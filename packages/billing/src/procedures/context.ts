import { createSessionProcedures } from "@crikket/shared/lib/server/orpc-auth"

export type BillingSessionContext = {
  user: {
    id: string
    role?: string | null
  }
  session: {
    activeOrganizationId?: string | null
  }
}

const { o, protectedProcedure } =
  createSessionProcedures<BillingSessionContext>({
    isAuthorized: (session) => Boolean(session?.user?.id),
  })

export { o, protectedProcedure }
