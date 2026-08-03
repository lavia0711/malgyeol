import type { NextConfig } from "next";
import { getSecurityHeaders } from "./security-headers";

const isDevelopment = process.env.NODE_ENV === "development";
const securityHeaders = getSecurityHeaders(isDevelopment);

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
