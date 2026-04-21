import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=()",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/get-started",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/foundation-1",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/foundation-1/get-started",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
