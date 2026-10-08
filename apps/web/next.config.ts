import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@dentasmart/shared'],
  async redirects() {
    return [
      { source: '/', destination: '/reception', permanent: false },
      { source: '/login', destination: '/reception', permanent: false },
    ];
  },
};

export default nextConfig;
