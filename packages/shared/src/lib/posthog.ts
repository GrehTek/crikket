import posthog from "posthog-js"

type PostHogClientConfig = {
  key?: string
  host?: string
}

export const initPostHog = ({ key, host }: PostHogClientConfig): void => {
  if (key && host) {
    posthog.init(key, {
      api_host: "/ph",
      ui_host: host,
      defaults: "2026-01-30",
    })
  }
}
