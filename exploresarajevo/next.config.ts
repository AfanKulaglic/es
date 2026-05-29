import type { NextConfig } from "next";


const nextConfig: NextConfig = {
  // Helps clients detect stale bundles after deploy (reduces "Failed to find Server Action" noise)
  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || 'explore-sarajevo',
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "cheerio"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'explore.halvooo.com',
      },
      {
        protocol: 'https',
        hostname: 'dummyimage.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'supa.halvooo.com',
      },
      {
        protocol: 'https',
        hostname: 'saraya.deployer3000.halvooo.com',
      },
      {
        protocol: 'https',
        hostname: 'cms.saraya.solutions',
      },
    ],
    dangerouslyAllowSVG: true,
  },
};

export default nextConfig;
