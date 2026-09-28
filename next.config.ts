import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Anthropic SDK is server-only; keep it out of the bundler.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
