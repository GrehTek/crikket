import { ORPCError } from "@orpc/server"
import { z } from "zod"

import { changeOrganizationPlan } from "../service/checkout"
import { protectedProcedure } from "./context"

const changePlanInputSchema = z.object({
  organizationId: z.string().min(1).optional(),
  billingInterval: z.enum(["monthly", "yearly"]).default("monthly"),
  plan: z.enum(["pro", "studio"]),
})

function resolveOrganizationId(input: {
  organizationId?: string
  activeOrganizationId?: string | null
}): string {
  const organizationId = input.organizationId ?? input.activeOrganizationId
  if (!organizationId) {
    throw new ORPCError("BAD_REQUEST", { message: "No active organization" })
  }

  return organizationId
}

export const changePlan = protectedProcedure
  .input(changePlanInputSchema)
  .handler(({ context, input }) => {
    const organizationId = resolveOrganizationId({
      organizationId: input.organizationId,
      activeOrganizationId: context.session.session.activeOrganizationId,
    })

    return changeOrganizationPlan({
      billingInterval: input.billingInterval,
      organizationId,
      plan: input.plan,
      userId: context.session.user.id,
    })
  })
