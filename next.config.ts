import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  serverExternalPackages: ["exceljs", "bcryptjs"],
};

export default nextConfig;
