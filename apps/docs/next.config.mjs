import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async rewrites() {
    const rewrites = [
      {
        source: "/docs/:path*.mdx",
        destination: "/llms.mdx/docs/:path*",
      },
    ]

    if (process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      rewrites.push({
        source: "/ph/:path*",
        destination: `${process.env.NEXT_PUBLIC_POSTHOG_HOST}/:path*`,
      })
    }

    return rewrites
  },
}

export default withMDX(config)
