import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo root; without it Turbopack may pick up a stray lockfile outside the repo.
  turbopack: { root: path.join(__dirname, "../..") },
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  // Safe{Wallet} loads /manifest.json cross-origin when the app is added as a custom Safe App.
  // Do NOT add X-Frame-Options / frame-ancestors: app.safe.global must be able to iframe this app.
  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET" },
          { key: "Access-Control-Allow-Headers", value: "X-Requested-With, content-type, Authorization" },
        ],
      },
    ];
  },
};

const isIpfs = process.env.NEXT_PUBLIC_IPFS_BUILD === "true";

if (isIpfs) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
  nextConfig.images = {
    unoptimized: true,
  };
}

module.exports = nextConfig;
