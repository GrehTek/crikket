import { Badge } from "@crikket/ui/components/ui/badge"
import { Button } from "@crikket/ui/components/ui/button"

import type {
  BillingInterval,
  BillingPlan,
  PlanOption,
  SwitchablePlan,
} from "./types"
import {
  formatMoney,
  formatPlanLabel,
  getPlanSwitchActionLabel,
  planBadgeVariant,
  resolvePriceByInterval,
} from "./utils"

interface PlanOptionCardProps {
  billingInterval: BillingInterval
  currentPlan: BillingPlan
  currentBillingInterval: BillingInterval | null
  canManageBilling: boolean
  isMutating: boolean
  option: PlanOption
  onSelect: (nextPlan: SwitchablePlan) => void
}

export function PlanOptionCard(props: PlanOptionCardProps) {
  const isCurrentPlan =
    props.currentPlan === props.option.slug &&
    props.currentBillingInterval === props.billingInterval
  const actionLabel = getPlanSwitchActionLabel({
    currentPlan: props.currentPlan,
    nextPlan: props.option.slug,
  })

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{formatPlanLabel(props.option.slug)}</p>
        {isCurrentPlan ? (
          <Badge variant={planBadgeVariant(props.option.slug)}>Current</Badge>
        ) : null}
      </div>
      <p className="mt-1 text-muted-foreground text-sm">
        {props.option.description}
      </p>
      <p className="mt-2 font-medium text-sm">
        {formatMoney(
          resolvePriceByInterval(props.option.prices, props.billingInterval),
          props.billingInterval
        )}
      </p>

      <Button
        className="mt-3"
        disabled={props.isMutating || isCurrentPlan || !props.canManageBilling}
        onClick={() => props.onSelect(props.option.slug)}
        variant={isCurrentPlan ? "outline" : "default"}
      >
        {isCurrentPlan ? "Current plan" : actionLabel}
      </Button>
    </div>
  )
}
