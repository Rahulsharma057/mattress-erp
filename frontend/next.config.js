/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // produces a minimal self-contained server for Docker (no full node_modules copy needed)
};

module.exports = nextConfig;
