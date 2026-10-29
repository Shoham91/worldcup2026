import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile exists in the
  // parent directory, which otherwise confuses Turbopack's root detection).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
