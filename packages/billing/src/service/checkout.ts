import { db } from "@crikket/db"
import { organizationBillingAccount } from "@crikket/db/schema/billing"
import { env } from "@crikket/env/server"
import { ORPCError } from "@orpc/server"
import { eq } from "drizzle-orm"
import { polarClient } from "../lib/payments"
import {
  ACTIVE_PAID_SUBSCRIPTION_STATUSES,
  type BillingPlan,
  normalizeBillingPlan,
  normalizeBillingSubscriptionStatus,
} from "../model"
import { assertUserCanManageOrganizationBilling } from "./access"
import { upsertOrganizationBillingProjection } from "./entitlements"
import {
  extractReferenceIdFromMetadata,
  resolvePlanFromProductId,
} from "./polar-payload"
import type { ChangeOrganizationPlanResult } from "./types"
import { getErrorMessage } from "./utils"
import { findWebhookBillingBackfill } from "./webhooks"

type BillingInterval = "monthly" | "yearly"

function resolveProductIdByPlan(input: {
  plan: Exclude<BillingPlan, "free">
  billingInterval: BillingInterval
}): string {
  const productId =
    input.plan === "studio"
      ? input.billingInterval === "yearly"
        ? env.POLAR_STUDIO_YEARLY_PRODUCT_ID
        : env.POLAR_STUDIO_PRODUCT_ID
      : input.billingInterval === "yearly"
        ? env.POLAR_PRO_YEARLY_PRODUCT_ID
        : env.POLAR_PRO_PRODUCT_ID

  if (!productId) {
    const productPeriodSuffix =
      input.billingInterval === "yearly" ? "_YEARLY" : ""
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: `POLAR_${input.plan.toUpperCase()}${productPeriodSuffix}_PRODUCT_ID is not configured.`,
    })
  }

  return productId
}

function assertPaymentsEnabled(): void {
  if (env.ENABLE_PAYMENTS) {
    return
  }

  throw new ORPCError("BAD_REQUEST", {
    message: "Payments are disabled in this deployment.",
  })
}

type OrganizationBillingAccountSnapshot = {
  polarCustomerId: string | null
  polarSubscriptionId: string | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean | null
}

function isPolarResourceNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const errorCode =
    "error" in error && typeof error.error === "string" ? error.error : ""
  if (errorCode === "ResourceNotFound") {
    return true
  }

  const message = getErrorMessage(error, "")
  return message.includes("ResourceNotFound")
}

function isActivePaidSubscriptionStatus(status: unknown): boolean {
  return ACTIVE_PAID_SUBSCRIPTION_STATUSES.has(
    normalizeBillingSubscriptionStatus(status)
  )
}

function isSubscriptionBoundToOrganization(
  subscription: {
    metadata: unknown
    customer: { externalId: string | null }
  },
  organizationId: string
): boolean {
  const referenceId = extractReferenceIdFromMetadata(subscription.metadata)
  if (referenceId === organizationId) {
    return true
  }

  return subscription.customer.externalId === organizationId
}

async function findUpdatableSubscription(input: {
  organizationId: string
  billingAccount: OrganizationBillingAccountSnapshot
}) {
  const { billingAccount, organizationId } = input
  const candidateSubscriptionId = billingAccount.polarSubscriptionId
  if (candidateSubscriptionId) {
    try {
      const subscription = await polarClient.subscriptions.get({
        id: candidateSubscriptionId,
      })
      const customerMatches =
        !billingAccount.polarCustomerId ||
        subscription.customerId === billingAccount.polarCustomerId

      if (
        customerMatches &&
        isActivePaidSubscriptionStatus(subscription.status)
      ) {
        return subscription
      }
    } catch (error) {
      if (!isPolarResourceNotFoundError(error)) {
        throw error
      }
    }
  }

  const listFilter = billingAccount.polarCustomerId
    ? { customerId: billingAccount.polarCustomerId }
    : { externalCustomerId: organizationId }
  const page = await polarClient.subscriptions.list({
    ...listFilter,
    active: true,
    limit: 100,
  })
  const activeSubscriptions = page.result.items.filter((subscription) =>
    isActivePaidSubscriptionStatus(subscription.status)
  )

  const orgMatchedSubscription = activeSubscriptions.find((subscription) =>
    isSubscriptionBoundToOrganization(subscription, organizationId)
  )

  return orgMatchedSubscription ?? activeSubscriptions[0] ?? null
}

export async function createOrganizationCheckoutSession(input: {
  organizationId: string
  plan: "pro" | "studio"
  billingInterval?: BillingInterval
  userId: string
}): Promise<{ url: string }> {
  assertPaymentsEnabled()

  await assertUserCanManageOrganizationBilling({
    organizationId: input.organizationId,
    userId: input.userId,
  })

  if (!env.POLAR_SUCCESS_URL) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "POLAR_SUCCESS_URL is not configured.",
    })
  }

  const billingInterval = input.billingInterval ?? "monthly"
  const productId = resolveProductIdByPlan({
    plan: input.plan,
    billingInterval,
  })

  const existingBillingAccount =
    await db.query.organizationBillingAccount.findFirst({
      where: eq(
        organizationBillingAccount.organizationId,
        input.organizationId
      ),
      columns: {
        polarCustomerId: true,
      },
    })

  try {
    const checkout = await polarClient.checkouts.create({
      customerId: existingBillingAccount?.polarCustomerId,
      externalCustomerId: existingBillingAccount?.polarCustomerId
        ? undefined
        : input.organizationId,
      products: [productId],
      successUrl: env.POLAR_SUCCESS_URL,
      metadata: {
        billingInterval,
        initiatedByUserId: input.userId,
        plan: input.plan,
        referenceId: input.organizationId,
        source: "crikket-billing-checkout",
      },
    })

    return { url: checkout.url }
  } catch (error) {
    const message = getErrorMessage(error, "Failed to create checkout session")

    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message,
    })
  }
}

export async function changeOrganizationPlan(input: {
  organizationId: string
  plan: "pro" | "studio"
  billingInterval?: BillingInterval
  userId: string
}): Promise<ChangeOrganizationPlanResult> {
  assertPaymentsEnabled()

  await assertUserCanManageOrganizationBilling({
    organizationId: input.organizationId,
    userId: input.userId,
  })

  const billingAccount = await db.query.organizationBillingAccount.findFirst({
    where: eq(organizationBillingAccount.organizationId, input.organizationId),
    columns: {
      polarCustomerId: true,
      polarSubscriptionId: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  })

  const nextPlan = normalizeBillingPlan(input.plan)
  const billingInterval = input.billingInterval ?? "monthly"
  const targetProductId = resolveProductIdByPlan({
    plan: input.plan,
    billingInterval,
  })

  const updatableSubscription = billingAccount
    ? await findUpdatableSubscription({
        organizationId: input.organizationId,
        billingAccount,
      }).catch((error) => {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: getErrorMessage(
            error,
            "Failed to resolve existing subscription"
          ),
        })
      })
    : null

  if (!updatableSubscription) {
    const checkout = await createOrganizationCheckoutSession({
      billingInterval,
      organizationId: input.organizationId,
      plan: input.plan,
      userId: input.userId,
    })

    return {
      action: "checkout_required",
      plan: nextPlan,
      url: checkout.url,
    }
  }

  const currentPlan = normalizeBillingPlan(
    resolvePlanFromProductId(updatableSubscription.productId)
  )
  const isSamePlanAndCadence =
    currentPlan === nextPlan &&
    updatableSubscription.productId === targetProductId

  if (isSamePlanAndCadence) {
    return {
      action: "unchanged",
      plan: nextPlan,
    }
  }

  try {
    const subscription = await polarClient.subscriptions.update({
      id: updatableSubscription.id,
      subscriptionUpdate: {
        productId: targetProductId,
      },
    })

    const resolvedPlan =
      resolvePlanFromProductId(subscription.productId) ??
      normalizeBillingPlan(input.plan)
    const resolvedSubscriptionStatus = normalizeBillingSubscriptionStatus(
      subscription.status
    )

    await upsertOrganizationBillingProjection({
      organizationId: input.organizationId,
      plan: resolvedPlan,
      subscriptionStatus: resolvedSubscriptionStatus,
      polarCustomerId:
        subscription.customerId ??
        updatableSubscription.customerId ??
        billingAccount?.polarCustomerId ??
        undefined,
      polarSubscriptionId: subscription.id,
      currentPeriodStart:
        subscription.currentPeriodStart ??
        updatableSubscription.currentPeriodStart ??
        billingAccount?.currentPeriodStart ??
        undefined,
      currentPeriodEnd:
        subscription.currentPeriodEnd ??
        updatableSubscription.currentPeriodEnd ??
        billingAccount?.currentPeriodEnd ??
        undefined,
      cancelAtPeriodEnd:
        subscription.cancelAtPeriodEnd ??
        updatableSubscription.cancelAtPeriodEnd ??
        billingAccount?.cancelAtPeriodEnd ??
        false,
      source: "manual-change-plan",
    })

    return {
      action: "updated",
      plan: resolvedPlan,
    }
  } catch (error) {
    const message = getErrorMessage(error, "Failed to change organization plan")

    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message,
    })
  }
}

export async function createOrganizationPortalSession(input: {
  organizationId: string
  userId: string
}): Promise<{ url: string }> {
  assertPaymentsEnabled()

  await assertUserCanManageOrganizationBilling({
    organizationId: input.organizationId,
    userId: input.userId,
  })

  const billingAccount = await db.query.organizationBillingAccount.findFirst({
    where: eq(organizationBillingAccount.organizationId, input.organizationId),
    columns: {
      polarCustomerId: true,
      polarSubscriptionId: true,
    },
  })

  let portalCustomerId = billingAccount?.polarCustomerId
  let portalSubscriptionId = billingAccount?.polarSubscriptionId
  const recoveryFailures: string[] = []

  if (!(portalCustomerId && portalSubscriptionId)) {
    const webhookBackfill = await findWebhookBillingBackfill(
      input.organizationId
    )
    if (webhookBackfill) {
      portalCustomerId = portalCustomerId ?? webhookBackfill.polarCustomerId
      portalSubscriptionId =
        portalSubscriptionId ?? webhookBackfill.polarSubscriptionId

      await upsertOrganizationBillingProjection({
        organizationId: input.organizationId,
        plan: webhookBackfill.plan,
        subscriptionStatus: webhookBackfill.subscriptionStatus,
        polarCustomerId: webhookBackfill.polarCustomerId,
        polarSubscriptionId: webhookBackfill.polarSubscriptionId,
        currentPeriodStart: webhookBackfill.currentPeriodStart,
        currentPeriodEnd: webhookBackfill.currentPeriodEnd,
        cancelAtPeriodEnd: webhookBackfill.cancelAtPeriodEnd,
        source: "portal-recovery",
      })
    }
  }

  if (!portalCustomerId && portalSubscriptionId) {
    try {
      const subscription = await polarClient.subscriptions.get({
        id: portalSubscriptionId,
      })
      portalCustomerId = subscription.customerId
    } catch (error) {
      recoveryFailures.push(
        `subscription lookup failed (${getErrorMessage(error, "unknown error")})`
      )
    }
  }

  if (!portalCustomerId) {
    try {
      const customerSession = await polarClient.customerSessions.create({
        externalCustomerId: input.organizationId,
        returnUrl: env.POLAR_SUCCESS_URL ?? undefined,
      })

      return { url: customerSession.customerPortalUrl }
    } catch (error) {
      recoveryFailures.push(
        `external customer portal lookup failed (${getErrorMessage(error, "unknown error")})`
      )
    }
  }

  if (!portalCustomerId) {
    const recoveryHint =
      recoveryFailures.length > 0
        ? ` Recovery attempts failed (${recoveryFailures.join("; ")}).`
        : ""
    throw new ORPCError("BAD_REQUEST", {
      message: `No billing customer found for this organization. Start a Pro or Studio checkout first.${recoveryHint}`,
    })
  }

  try {
    const customerSession = await polarClient.customerSessions.create({
      customerId: portalCustomerId,
      returnUrl: env.POLAR_SUCCESS_URL ?? undefined,
    })

    return { url: customerSession.customerPortalUrl }
  } catch (error) {
    const message = getErrorMessage(
      error,
      "Failed to create customer portal session"
    )

    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message,
    })
  }
}
