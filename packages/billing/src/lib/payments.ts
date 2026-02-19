import { env } from "@crikket/env/server"
import { Polar } from "@polar-sh/sdk"

const polarServer = env.NODE_ENV === "development" ? "sandbox" : "production"

export const polarClient = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
  server: polarServer,
})
