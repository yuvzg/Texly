import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@texly/shared', '@texly/latex'],
};

export default nextConfig;
