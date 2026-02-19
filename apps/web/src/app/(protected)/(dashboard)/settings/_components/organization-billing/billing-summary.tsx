import { Badge } from "@crikket/ui/components/ui/badge"

import type { BillingPlan, BillingPlanLimits } from "./types"
import {
  formatDateLabel,
  formatMoney,
  formatPlanLabel,
  formatSubscriptionStatus,
  formatVideoDurationLabel,
  planBadgeVariant,
} from "./utils"

interface BillingSummaryProps {
  currentPeriodEnd: string | Date | null
  currentPlanLimit: BillingPlanLimits[BillingPlan] | null
  currentPlanPrice: number
  memberCap: number | null
  memberCount: number
  plan: BillingPlan
  proMemberCap: number
  subscriptionStatus: string
}

export function BillingSummary(props: BillingSummaryProps) {
  const memberLimitLabel =
    props.memberCap === null
      ? "Unlimited"
      : `${props.memberCap.toLocaleString()} members`
  const renewalDate = formatDateLabel(props.currentPeriodEnd)
  const exceedsProMemberCap =
    props.plan === "studio" && props.memberCount > props.proMemberCap

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={planBadgeVariant(props.plan)}>
          {formatPlanLabel(props.plan)}
        </Badge>
        <span className="text-muted-foreground text-sm">
          {formatSubscriptionStatus(props.subscriptionStatus)}
        </span>
      </div>

      <p className="mt-3 font-medium text-sm">
        Current monthly price: {formatMoney(props.currentPlanPrice, "monthly")}
      </p>
      <p className="mt-1 text-muted-foreground text-sm">
        {renewalDate
          ? `Next renewal: ${renewalDate}`
          : "No renewal date available yet."}
      </p>

      <div className="mt-3 space-y-1 text-sm">
        <p>
          Members: {props.memberCount.toLocaleString()} / {memberLimitLabel}
        </p>
        <p>
          Video limit:{" "}
          {props.currentPlanLimit?.canUploadVideo
            ? formatVideoDurationLabel(
                props.currentPlanLimit.maxVideoDurationMs
              )
            : "Locked"}
        </p>
      </div>

      {exceedsProMemberCap ? (
        <p className="mt-2 text-muted-foreground text-sm">
          Downgrading to Pro keeps current members, but new invites are blocked
          while you are above {props.proMemberCap} members.
        </p>
      ) : null}
    </div>
  )
}
