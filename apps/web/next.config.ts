import type { NextConfig } from 'next';

const demoFlag = process.env.NEXT_PUBLIC_DEMO === '0'
  ? '0'
  : process.env.NEXT_PUBLIC_DEMO === '1' || process.env.VERCEL || !process.env.NEXT_PUBLIC_API_URL
    ? '1'
    : '0';

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_DEMO: demoFlag },
  transpilePackages: ['@dentasmart/shared'],
  async redirects() {
    return [];
  },
};

export default nextConfig;
