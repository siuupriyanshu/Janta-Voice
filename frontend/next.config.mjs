/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // web3.js is browser-friendly; disable node-only fallbacks it never uses in the browser.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
      stream: false,
    };
    return config;
  },
};

export default nextConfig;
