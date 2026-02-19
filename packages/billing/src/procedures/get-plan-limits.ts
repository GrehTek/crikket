import { getBillingPlanLimits } from "../service/entitlements"
import { protectedProcedure } from "./context"

export const getPlanLimits = protectedProcedure.handler(() => {
  return getBillingPlanLimits()
})
