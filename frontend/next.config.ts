import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Static export: Cloudflare Pages serves files, it does not run a
   * Next.js server. Every page here is client-rendered and talks to the
   * API Gateway backend, so nothing needs server-side execution.
   *
   * Consequences worth remembering: no API routes, no server actions, no
   * middleware, no ISR. If any of those become necessary the hosting
   * choice has to be revisited (requirements.md §4).
   */
  output: "export",

  /**
   * next/image's optimiser needs a running server. Photos are served as
   * presigned S3 URLs through plain <img> already, so there is nothing
   * for it to optimise.
   */
  images: { unoptimized: true },

  // Emit /path/index.html rather than /path.html — what static hosts
  // expect when resolving clean URLs.
  trailingSlash: true,
};

export default nextConfig;
