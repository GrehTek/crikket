import { changePlan } from "@crikket/billing/procedures/change-plan"
import { createCheckoutSession } from "@crikket/billing/procedures/create-checkout-session"
import { getCurrentOrganizationPlan } from "@crikket/billing/procedures/get-current-organization-plan"
import { getEntitlements } from "@crikket/billing/procedures/get-entitlements"
import { getPlanLimits } from "@crikket/billing/procedures/get-plan-limits"
import { openPortal } from "@crikket/billing/procedures/open-portal"
import { recomputeEntitlements } from "@crikket/billing/procedures/recompute-entitlements"

export const billingRouter = {
  changePlan,
  createCheckoutSession,
  getCurrentOrganizationPlan,
  getEntitlements,
  getPlanLimits,
  openPortal,
  recomputeEntitlements,
}
