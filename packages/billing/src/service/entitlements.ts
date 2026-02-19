import { db } from "@crikket/db"
import { member } from "@crikket/db/schema/auth"
import {
  organizationBillingAccount,
  organizationEntitlement,
} from "@crikket/db/schema/billing"
import { env } from "@crikket/env/server"
import { count, eq } from "drizzle-orm"

import {
  BILLING_PLAN,
  type BillingPlan,
  type BillingPlanLimitSnapshot,
  deserializeEntitlements,
  type EntitlementSnapshot,
  getBillingDisabledEntitlements,
  getBillingDisabledPlanLimitsSnapshot,
  getBillingPlanLimitsSnapshot,
  normalizeBillingPlan,
  normalizeBillingSubscriptionStatus,
  resolveEntitlements,
  serializeEntitlements,
} from "../model"
import type {
  BillingProjectionInput,
  OrganizationBillingSnapshot,
} from "./types"
import { asRecord } from "./utils"

export function upsertOrganizationBillingProjection(
  input: BillingProjectionInput
): Promise<EntitlementSnapshot> {
  return db.transaction(async (tx) => {
    const [existingBillingAccount, existingEntitlementRow] = await Promise.all([
      tx.query.organizationBillingAccount.findFirst({
        where: eq(
          organizationBillingAccount.organizationId,
          input.organizationId
        ),
        columns: {
          plan: true,
          subscriptionStatus: true,
        },
      }),
      tx.query.organizationEntitlement.findFirst({
        where: eq(organizationEntitlement.organizationId, input.organizationId),
        columns: {
          entitlements: true,
        },
      }),
    ])

    const nextPlan = normalizeBillingPlan(
      input.plan ?? existingBillingAccount?.plan
    )
    const nextSubscriptionStatus = normalizeBillingSubscriptionStatus(
      input.subscriptionStatus ?? existingBillingAccount?.subscriptionStatus
    )
    const entitlements = resolveEntitlements({
      plan: nextPlan,
      subscriptionStatus: nextSubscriptionStatus,
    })
    const nextEntitlementsPayload = {
      ...(asRecord(existingEntitlementRow?.entitlements) ?? {}),
      ...serializeEntitlements(entitlements),
    }

    await tx
      .insert(organizationBillingAccount)
      .values({
        organizationId: input.organizationId,
        provider: "polar",
        polarCustomerId: input.polarCustomerId,
        polarSubscriptionId: input.polarSubscriptionId,
        plan: nextPlan,
        subscriptionStatus: nextSubscriptionStatus,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        lastWebhookAt: new Date(),
      })
      .onConflictDoUpdate({
        target: organizationBillingAccount.organizationId,
        set: {
          polarCustomerId:
            input.polarCustomerId ?? organizationBillingAccount.polarCustomerId,
          polarSubscriptionId:
            input.polarSubscriptionId ??
            organizationBillingAccount.polarSubscriptionId,
          plan: nextPlan,
          subscriptionStatus: nextSubscriptionStatus,
          currentPeriodStart:
            input.currentPeriodStart ??
            organizationBillingAccount.currentPeriodStart,
          currentPeriodEnd:
            input.currentPeriodEnd ??
            organizationBillingAccount.currentPeriodEnd,
          cancelAtPeriodEnd:
            input.cancelAtPeriodEnd ??
            organizationBillingAccount.cancelAtPeriodEnd,
          lastWebhookAt: new Date(),
          updatedAt: new Date(),
        },
      })

    await tx
      .insert(organizationEntitlement)
      .values({
        organizationId: input.organizationId,
        plan: entitlements.plan,
        entitlements: nextEntitlementsPayload,
        lastComputedAt: new Date(),
        source: input.source ?? "reconciliation",
      })
      .onConflictDoUpdate({
        target: organizationEntitlement.organizationId,
        set: {
          plan: entitlements.plan,
          entitlements: nextEntitlementsPayload,
          lastComputedAt: new Date(),
          source: input.source ?? "reconciliation",
          updatedAt: new Date(),
        },
      })

    return entitlements
  })
}

export async function getOrganizationEntitlements(
  organizationId: string
): Promise<EntitlementSnapshot> {
  if (!env.ENABLE_PAYMENTS) {
    return getBillingDisabledEntitlements()
  }

  const [billingRow, row] = await Promise.all([
    db.query.organizationBillingAccount.findFirst({
      where: eq(organizationBillingAccount.organizationId, organizationId),
      columns: {
        plan: true,
        subscriptionStatus: true,
      },
    }),
    db.query.organizationEntitlement.findFirst({
      where: eq(organizationEntitlement.organizationId, organizationId),
      columns: {
        entitlements: true,
      },
    }),
  ])
  const effectiveEntitlements = resolveEntitlements({
    plan: normalizeBillingPlan(billingRow?.plan),
    subscriptionStatus: normalizeBillingSubscriptionStatus(
      billingRow?.subscriptionStatus
    ),
  })

  if (row) {
    return deserializeEntitlements(effectiveEntitlements.plan, row.entitlements)
  }

  return effectiveEntitlements
}

export async function getOrganizationBillingSnapshot(
  organizationId: string
): Promise<OrganizationBillingSnapshot> {
  const [billingRow, entitlement, memberCountResult] = await Promise.all([
    db.query.organizationBillingAccount.findFirst({
      where: eq(organizationBillingAccount.organizationId, organizationId),
      columns: {
        plan: true,
        subscriptionStatus: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    }),
    getOrganizationEntitlements(organizationId),
    db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId)),
  ])

  return {
    organizationId,
    plan: entitlement.plan,
    subscriptionStatus: normalizeBillingSubscriptionStatus(
      billingRow?.subscriptionStatus
    ),
    currentPeriodStart: billingRow?.currentPeriodStart ?? null,
    currentPeriodEnd: billingRow?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: billingRow?.cancelAtPeriodEnd ?? false,
    memberCount: memberCountResult[0]?.value ?? 0,
    entitlements: entitlement,
  }
}

export function getBillingPlanLimits(): Record<
  BillingPlan,
  BillingPlanLimitSnapshot
> {
  if (!env.ENABLE_PAYMENTS) {
    return getBillingDisabledPlanLimitsSnapshot()
  }

  return getBillingPlanLimitsSnapshot()
}

export async function recomputeOrganizationEntitlements(
  organizationId: string
) {
  const billingRow = await db.query.organizationBillingAccount.findFirst({
    where: eq(organizationBillingAccount.organizationId, organizationId),
    columns: {
      plan: true,
      subscriptionStatus: true,
      polarCustomerId: true,
      polarSubscriptionId: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  })

  const plan = normalizeBillingPlan(billingRow?.plan)
  const subscriptionStatus = normalizeBillingSubscriptionStatus(
    billingRow?.subscriptionStatus
  )
  const entitlements = await upsertOrganizationBillingProjection({
    organizationId,
    plan,
    subscriptionStatus,
    polarCustomerId: billingRow?.polarCustomerId ?? undefined,
    polarSubscriptionId: billingRow?.polarSubscriptionId ?? undefined,
    currentPeriodStart: billingRow?.currentPeriodStart ?? undefined,
    currentPeriodEnd: billingRow?.currentPeriodEnd ?? undefined,
    cancelAtPeriodEnd: billingRow?.cancelAtPeriodEnd ?? false,
    source: "manual-recompute",
  })

  return {
    organizationId,
    plan,
    subscriptionStatus,
    entitlements,
  }
}

export async function assertOrganizationCanAddMembers(
  organizationId: string,
  incomingMembers = 1
): Promise<void> {
  const entitlements = await getOrganizationEntitlements(organizationId)
  const memberCap = entitlements.memberCap

  if (memberCap === null) {
    return
  }

  const memberCountResult = await db
    .select({ value: count() })
    .from(member)
    .where(eq(member.organizationId, organizationId))
  const memberCount = memberCountResult[0]?.value ?? 0

  if (memberCount + incomingMembers <= memberCap) {
    return
  }

  if (entitlements.plan === BILLING_PLAN.pro) {
    throw new Error(
      `Pro plan supports up to ${memberCap} members. Upgrade to Studio to add more teammates.`
    )
  }

  if (entitlements.plan === BILLING_PLAN.free) {
    throw new Error("Upgrade to Pro to invite teammates to this organization.")
  }

  throw new Error("Organization member limit reached.")
}
