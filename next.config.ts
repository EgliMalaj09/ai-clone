import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Vinext applies the server-action body limit (1 MB by default) to multipart uploads. The API enforces its own,
    // smaller limits per upload (8 MB photos, 30 MB preview videos), so this only needs to sit above the largest one.
    serverActions: { bodySizeLimit: "32mb" },
  },
};

export default nextConfig;
