import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 127.0.0.1 is used instead of localhost in dev because another local
  // project's dev server occupies localhost:3002 on IPv6, which would
  // otherwise silently serve the wrong app.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
