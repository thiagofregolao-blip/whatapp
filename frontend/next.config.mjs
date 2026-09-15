const nextConfig = {
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'}/api/:path*` }] },
};
export default nextConfig;
