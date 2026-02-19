import { env } from "@crikket/env/server"

import {
  BILLING_PLAN,
  type BillingPlan,
  type BillingSubscriptionStatus,
  normalizeBillingSubscriptionStatus,
} from "../model"
import type { PolarWebhookPayload } from "./types"
import {
  asRecord,
  findFirstStringByKeys,
  getNestedString,
  toDateOrUndefined,
} from "./utils"

export function resolvePlanFromProductId(
  productId: string | undefined
): BillingPlan | undefined {
  if (!productId) {
    return undefined
  }

  if (
    productId === env.POLAR_STUDIO_PRODUCT_ID ||
    productId === env.POLAR_STUDIO_YEARLY_PRODUCT_ID
  ) {
    return BILLING_PLAN.studio
  }

  if (
    productId === env.POLAR_PRO_PRODUCT_ID ||
    productId === env.POLAR_PRO_YEARLY_PRODUCT_ID
  ) {
    return BILLING_PLAN.pro
  }

  return undefined
}

export function extractReferenceId(
  payload: PolarWebhookPayload
): string | undefined {
  return (
    getNestedString(payload, ["data", "referenceId"]) ??
    getNestedString(payload, ["data", "metadata", "referenceId"]) ??
    findFirstStringByKeys(payload.data, ["referenceId", "reference_id"])
  )
}

export function extractReferenceIdFromMetadata(
  metadata: unknown
): string | undefined {
  const metadataRecord = asRecord(metadata)
  if (!metadataRecord) {
    return undefined
  }

  const referenceId = metadataRecord.referenceId ?? metadataRecord.reference_id
  return typeof referenceId === "string" && referenceId.length > 0
    ? referenceId
    : undefined
}

export function extractProductId(
  payload: PolarWebhookPayload
): string | undefined {
  return (
    getNestedString(payload, ["data", "productId"]) ??
    getNestedString(payload, ["data", "product", "id"]) ??
    getNestedString(payload, ["data", "productPrice", "productId"]) ??
    getNestedString(payload, ["data", "productPrice", "product", "id"]) ??
    findFirstStringByKeys(payload.data, ["productId", "product_id"])
  )
}

export function extractSubscriptionStatus(
  payload: PolarWebhookPayload
): BillingSubscriptionStatus | undefined {
  const rawStatus =
    getNestedString(payload, ["data", "status"]) ??
    getNestedString(payload, ["data", "subscription", "status"])

  return rawStatus ? normalizeBillingSubscriptionStatus(rawStatus) : undefined
}

export function extractCustomerId(
  payload: PolarWebhookPayload
): string | undefined {
  return (
    getNestedString(payload, ["data", "customerId"]) ??
    getNestedString(payload, ["data", "customer", "id"])
  )
}

export function extractSubscriptionId(
  payload: PolarWebhookPayload
): string | undefined {
  const eventType = typeof payload.type === "string" ? payload.type : ""
  const canFallbackToResourceId = eventType.startsWith("subscription.")

  return (
    getNestedString(payload, ["data", "subscriptionId"]) ??
    getNestedString(payload, ["data", "subscription", "id"]) ??
    (canFallbackToResourceId
      ? getNestedString(payload, ["data", "id"])
      : undefined)
  )
}

export function extractCheckoutId(
  payload: PolarWebhookPayload
): string | undefined {
  return (
    getNestedString(payload, ["data", "checkoutId"]) ??
    getNestedString(payload, ["data", "checkout", "id"]) ??
    getNestedString(payload, ["data", "subscription", "checkoutId"]) ??
    getNestedString(payload, ["data", "subscription", "checkout", "id"]) ??
    findFirstStringByKeys(payload.data, ["checkoutId", "checkout_id"])
  )
}

export function extractCurrentPeriodStart(
  payload: PolarWebhookPayload
): Date | undefined {
  const value =
    getNestedString(payload, ["data", "currentPeriodStart"]) ??
    getNestedString(payload, ["data", "currentPeriodStartAt"])

  return toDateOrUndefined(value)
}

export function extractCurrentPeriodEnd(
  payload: PolarWebhookPayload
): Date | undefined {
  const value =
    getNestedString(payload, ["data", "currentPeriodEnd"]) ??
    getNestedString(payload, ["data", "currentPeriodEndAt"]) ??
    getNestedString(payload, ["data", "endedAt"])

  return toDateOrUndefined(value)
}

export function extractCancelAtPeriodEnd(
  payload: PolarWebhookPayload
): boolean | undefined {
  const value =
    asRecord(payload.data)?.cancelAtPeriodEnd ??
    getNestedString(payload, ["data", "cancelAtPeriodEnd"])
  if (typeof value === "boolean") {
    return value
  }

  if (value === "true") {
    return true
  }

  if (value === "false") {
    return false
  }

  return undefined
}

export function extractProviderEventId(
  payload: PolarWebhookPayload,
  eventType: string
): string {
  const eventId =
    getNestedString(payload, ["id"]) ??
    getNestedString(payload, ["data", "eventId"]) ??
    getNestedString(payload, ["data", "event_id"])

  if (eventId && eventId.length > 0) {
    return `polar:event:${eventId}`
  }

  const secondaryId =
    getNestedString(payload, ["data", "id"]) ??
    getNestedString(payload, ["data", "subscriptionId"]) ??
    getNestedString(payload, ["data", "subscription_id"]) ??
    getNestedString(payload, ["data", "checkoutId"]) ??
    getNestedString(payload, ["data", "checkout_id"]) ??
    "unknown"
  const timestamp =
    getNestedString(payload, ["createdAt"]) ??
    getNestedString(payload, ["data", "createdAt"]) ??
    getNestedString(payload, ["data", "created_at"]) ??
    crypto.randomUUID()

  return `polar:fallback:${eventType}:${secondaryId}:${timestamp}`
}
