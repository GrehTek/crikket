import { initPostHog } from "@crikket/shared/lib/posthog"

initPostHog({
  key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
})
