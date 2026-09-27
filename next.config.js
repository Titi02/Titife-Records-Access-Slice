/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Next.js 15.5.x generates `.next/types/` files that reference `Object`
    // without it being in scope — a known compatibility issue with TS 5.7+.
    // Our own code is type-checked separately via `tsc --noEmit`.
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
