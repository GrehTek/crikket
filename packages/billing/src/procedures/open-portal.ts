import { ORPCError } from "@orpc/server"
import { z } from "zod"

import { createOrganizationPortalSession } from "../service/checkout"
import { protectedProcedure } from "./context"

const openPortalInputSchema = z.object({
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

export const openPortal = protectedProcedure
  .input(openPortalInputSchema)
  .handler(({ context, input }) => {
    const organizationId = resolveOrganizationId({
      organizationId: input.organizationId,
      activeOrganizationId: context.session.session.activeOrganizationId,
    })

    return createOrganizationPortalSession({
      organizationId,
      userId: context.session.user.id,
    })
  })
