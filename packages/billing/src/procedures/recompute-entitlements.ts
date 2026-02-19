import { ORPCError } from "@orpc/server"
import { z } from "zod"

import { recomputeOrganizationEntitlements } from "../service/entitlements"
import { protectedProcedure } from "./context"

const recomputeEntitlementsInputSchema = z.object({
  organizationId: z.string().min(1),
})

export const recomputeEntitlements = protectedProcedure
  .input(recomputeEntitlementsInputSchema)
  .handler(({ context, input }) => {
    if (context.session.user.role !== "admin") {
      throw new ORPCError("FORBIDDEN", {
        message: "Only admins can recompute entitlements.",
      })
    }

    return recomputeOrganizationEntitlements(input.organizationId)
  })
