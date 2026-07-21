/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // web3.js / anchor are browser-friendly; disable node-only fallbacks they never use.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
      stream: false,
    };
    // Anchor relies on a global Buffer in the browser.
    config.plugins.push(
      new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] }),
    );
    return config;
  },
};

export default nextConfig;
