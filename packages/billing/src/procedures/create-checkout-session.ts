import { ORPCError } from "@orpc/server"
import { z } from "zod"

import { createOrganizationCheckoutSession } from "../service/checkout"
import { protectedProcedure } from "./context"

const createCheckoutSessionInputSchema = z.object({
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

export const createCheckoutSession = protectedProcedure
  .input(createCheckoutSessionInputSchema)
  .handler(({ context, input }) => {
    const organizationId = resolveOrganizationId({
      organizationId: input.organizationId,
      activeOrganizationId: context.session.session.activeOrganizationId,
    })

    return createOrganizationCheckoutSession({
      billingInterval: input.billingInterval,
      organizationId,
      plan: input.plan,
      userId: context.session.user.id,
    })
  })
