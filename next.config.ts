import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next-prod',
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
};
export default config;
