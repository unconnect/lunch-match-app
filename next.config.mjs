/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules Next actually traced, so the Docker image ships megabytes
  // instead of the whole dependency tree. See Dockerfile.
  output: "standalone",
};

export default nextConfig;
