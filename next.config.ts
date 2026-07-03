import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Exclude better-sqlite3 from client bundle (server-only)
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
