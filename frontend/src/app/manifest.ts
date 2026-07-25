import type { MetadataRoute } from "next";

// Required for `output: "export"` — the manifest has no per-request
// data, so it can be emitted once at build time like any other asset.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nimbus — your files, your bucket",
    short_name: "Nimbus",
    description:
      "A self-hosted Drive and Photos replacement that runs in your own AWS account.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
