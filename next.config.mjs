/** @type {import('next').NextConfig} */
const nextConfig = {
  // These packages are server-only (native bindings / heavy) and must never be
  // bundled into the client or the Edge runtime.
  serverExternalPackages: [
    "@remotion/renderer",
    "@remotion/bundler",
    "@prisma/client",
    "prisma",
    "bullmq",
    "ioredis",
  ],
  // Uploads can be large; the App Router route handlers read the raw stream,
  // but we bump the server action / body limits for safety on self-host.
  experimental: {
    serverActions: {
      bodySizeLimit: "1024mb",
    },
  },
};

export default nextConfig;
