import { db } from "@crikket/db"
import {
  billingWebhookEvent,
  organizationBillingAccount,
} from "@crikket/db/schema/billing"
import { eq, sql } from "drizzle-orm"

import { polarClient } from "../lib/payments"
import { upsertOrganizationBillingProjection } from "./entitlements"
import {
  extractCancelAtPeriodEnd,
  extractCheckoutId,
  extractCurrentPeriodEnd,
  extractCurrentPeriodStart,
  extractCustomerId,
  extractProductId,
  extractProviderEventId,
  extractReferenceId,
  extractReferenceIdFromMetadata,
  extractSubscriptionId,
  extractSubscriptionStatus,
  resolvePlanFromProductId,
} from "./polar-payload"
import type {
  PolarWebhookPayload,
  PolarWebhookProcessingResult,
  WebhookBillingBackfill,
} from "./types"
import { asRecord, findFirstStringByKeys, getErrorMessage } from "./utils"

async function resolveOrganizationIdFromWebhookPayload(
  payload: PolarWebhookPayload
): Promise<string | undefined> {
  const referenceId = extractReferenceId(payload)
  if (referenceId) {
    return referenceId
  }

  const subscriptionId = extractSubscriptionId(payload)
  if (subscriptionId) {
    const billingAccountBySubscription =
      await db.query.organizationBillingAccount.findFirst({
        where: eq(
          organizationBillingAccount.polarSubscriptionId,
          subscriptionId
        ),
        columns: {
          organizationId: true,
        },
      })
    if (billingAccountBySubscription?.organizationId) {
      return billingAccountBySubscription.organizationId
    }
  }

  const checkoutId = extractCheckoutId(payload)
  let checkoutLookupError: Error | null = null
  if (checkoutId) {
    try {
      const checkout = await polarClient.checkouts.get({
        id: checkoutId,
      })
      const checkoutReferenceId =
        extractReferenceIdFromMetadata(checkout.metadata) ??
        findFirstStringByKeys(checkout, ["referenceId", "reference_id"])
      if (checkoutReferenceId) {
        return checkoutReferenceId
      }
    } catch (error) {
      checkoutLookupError = new Error(
        `Failed to resolve checkout ${checkoutId}: ${getErrorMessage(
          error,
          "Unknown checkout lookup error"
        )}`
      )
    }
  }

  const customerId = extractCustomerId(payload)
  if (!customerId) {
    if (checkoutLookupError) {
      throw checkoutLookupError
    }

    return undefined
  }

  const billingAccountsByCustomer = await db
    .select({
      organizationId: organizationBillingAccount.organizationId,
    })
    .from(organizationBillingAccount)
    .where(eq(organizationBillingAccount.polarCustomerId, customerId))
    .limit(2)

  if (billingAccountsByCustomer.length === 1) {
    return billingAccountsByCustomer[0]?.organizationId
  }

  if (checkoutLookupError) {
    throw checkoutLookupError
  }

  return undefined
}

export async function findWebhookBillingBackfill(
  organizationId: string
): Promise<WebhookBillingBackfill | null> {
  const recentWebhookEvents = await db
    .select({
      payload: billingWebhookEvent.payload,
    })
    .from(billingWebhookEvent)
    .orderBy(sql`${billingWebhookEvent.receivedAt} DESC`)
    .limit(500)

  for (const event of recentWebhookEvents) {
    const payloadRecord = asRecord(event.payload)
    if (!payloadRecord) {
      continue
    }

    const payload = payloadRecord as PolarWebhookPayload
    if (extractReferenceId(payload) !== organizationId) {
      continue
    }

    const eventType =
      typeof payload.type === "string" ? payload.type : "unknown"
    const isSubscriptionEvent = eventType.startsWith("subscription.")
    const plan = resolvePlanFromProductId(extractProductId(payload))
    const subscriptionStatus = isSubscriptionEvent
      ? extractSubscriptionStatus(payload)
      : undefined
    const polarCustomerId = extractCustomerId(payload)
    const polarSubscriptionId = extractSubscriptionId(payload)
    const currentPeriodStart = isSubscriptionEvent
      ? extractCurrentPeriodStart(payload)
      : undefined
    const currentPeriodEnd = isSubscriptionEvent
      ? extractCurrentPeriodEnd(payload)
      : undefined
    const cancelAtPeriodEnd = isSubscriptionEvent
      ? extractCancelAtPeriodEnd(payload)
      : undefined

    if (
      !(plan || subscriptionStatus || polarCustomerId || polarSubscriptionId)
    ) {
      continue
    }

    return {
      plan,
      subscriptionStatus,
      polarCustomerId,
      polarSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    }
  }

  return null
}

export async function processPolarWebhookPayload(
  payload: PolarWebhookPayload
): Promise<PolarWebhookProcessingResult> {
  const eventType =
    (typeof payload.type === "string" && payload.type.length > 0
      ? payload.type
      : "unknown") ?? "unknown"
  const providerEventId = extractProviderEventId(payload, eventType)

  const [existingWebhook] = await db
    .select({
      status: billingWebhookEvent.status,
    })
    .from(billingWebhookEvent)
    .where(eq(billingWebhookEvent.providerEventId, providerEventId))
    .limit(1)

  if (existingWebhook?.status === "processed") {
    return {
      eventType,
      ignored: true,
    }
  }

  if (existingWebhook) {
    await db
      .update(billingWebhookEvent)
      .set({
        status: "received",
        errorMessage: null,
        attemptCount: sql`${billingWebhookEvent.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(billingWebhookEvent.providerEventId, providerEventId))
  } else {
    await db.insert(billingWebhookEvent).values({
      id: crypto.randomUUID(),
      providerEventId,
      provider: "polar",
      eventType,
      status: "received",
      payload,
      attemptCount: 1,
    })
  }

  try {
    const organizationId =
      await resolveOrganizationIdFromWebhookPayload(payload)
    if (!organizationId) {
      await db
        .update(billingWebhookEvent)
        .set({
          status: "ignored",
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(billingWebhookEvent.providerEventId, providerEventId))

      return {
        eventType,
        ignored: true,
      }
    }

    const productId = extractProductId(payload)
    const plan = resolvePlanFromProductId(productId)
    const isSubscriptionEvent = eventType.startsWith("subscription.")
    const subscriptionStatus = isSubscriptionEvent
      ? extractSubscriptionStatus(payload)
      : undefined
    const polarCustomerId = extractCustomerId(payload)
    const polarSubscriptionId = extractSubscriptionId(payload)
    const currentPeriodStart = isSubscriptionEvent
      ? extractCurrentPeriodStart(payload)
      : undefined
    const currentPeriodEnd = isSubscriptionEvent
      ? extractCurrentPeriodEnd(payload)
      : undefined
    const cancelAtPeriodEnd = isSubscriptionEvent
      ? extractCancelAtPeriodEnd(payload)
      : undefined

    await upsertOrganizationBillingProjection({
      organizationId,
      plan,
      subscriptionStatus,
      polarCustomerId,
      polarSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      source: "webhook",
    })

    await db
      .update(billingWebhookEvent)
      .set({
        status: "processed",
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(billingWebhookEvent.providerEventId, providerEventId))

    return {
      eventType,
      ignored: false,
      organizationId,
    }
  } catch (error) {
    const message = getErrorMessage(error, "Unknown webhook processing error")

    await db
      .update(billingWebhookEvent)
      .set({
        status: "failed",
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(billingWebhookEvent.providerEventId, providerEventId))

    throw error
  }
}
