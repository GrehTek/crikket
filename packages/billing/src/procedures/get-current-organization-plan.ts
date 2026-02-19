import { ORPCError } from "@orpc/server"
import { z } from "zod"

import { assertUserBelongsToOrganization } from "../service/access"
import { getOrganizationBillingSnapshot } from "../service/entitlements"
import { protectedProcedure } from "./context"

const currentPlanInputSchema = z.object({
  organizationId: z.string().min(1).optional(),
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

export const getCurrentOrganizationPlan = protectedProcedure
  .input(currentPlanInputSchema)
  .handler(async ({ context, input }) => {
    const organizationId = resolveOrganizationId({
      organizationId: input.organizationId,
      activeOrganizationId: context.session.session.activeOrganizationId,
    })

    try {
      await assertUserBelongsToOrganization({
        organizationId,
        userId: context.session.user.id,
      })
    } catch (error) {
      throw new ORPCError("FORBIDDEN", {
        message:
          error instanceof Error
            ? error.message
            : "You do not have access to this organization.",
      })
    }

    return getOrganizationBillingSnapshot(organizationId)
  })
