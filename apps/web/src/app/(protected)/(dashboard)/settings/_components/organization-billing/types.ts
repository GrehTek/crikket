export type BillingPlan = "free" | "pro" | "studio"
export type SwitchablePlan = "pro" | "studio"
export type BillingInterval = "monthly" | "yearly"

export type BillingPlanLimits = Record<
  BillingPlan,
  {
    monthlyPriceUsd: number
    yearlyPriceUsd: number
    canUploadVideo: boolean
    maxVideoDurationMs: number | null
    memberCap: number | null
  }
>

export interface OrganizationBillingCardProps {
  organizationId: string
  canManageBilling: boolean
  limits: BillingPlanLimits | null
  memberCap: number | null
  memberCount: number
  plan: BillingPlan
  subscriptionStatus: string
  currentPeriodStart: string | Date | null
  currentPeriodEnd: string | Date | null
}

export interface PlanOption {
  slug: SwitchablePlan
  description: string
  prices: {
    monthlyPriceUsd: number
    yearlyPriceUsd: number
  }
}
