import "@crikket/env/web"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    if (!process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      return []
    }

    return [
      {
        source: "/ph/:path*",
        destination: `${process.env.NEXT_PUBLIC_POSTHOG_HOST}/:path*`,
      },
    ]
  },
}

export default nextConfig
