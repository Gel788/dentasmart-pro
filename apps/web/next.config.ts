import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@dentasmart/shared'],
  async redirects() {
    return [];
  },
};

export default nextConfig;
