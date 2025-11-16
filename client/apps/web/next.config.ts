import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    devIndicators: false,
    typedRoutes: true,
    reactCompiler: true,
    transpilePackages: ["shiki"],
};

export default nextConfig;
