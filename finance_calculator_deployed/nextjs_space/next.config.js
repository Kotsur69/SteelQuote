const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  productionBrowserSourceMaps: false,
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
    // Loaded from node_modules at runtime; bundling it breaks its internal dynamic imports.
    serverComponentsExternalPackages: ['puppeteer-core'],
    // The assistant's knowledge base is read with fs at runtime (lib/assistant/systemPrompt.ts),
    // so the tracer cannot see it: without this a standalone build ships without the files.
    outputFileTracingIncludes: {
      '/api/assistant/chat': ['./lib/assistant/knowledge/**/*.md'],
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.filename = 'static/chunks/[name]-[contenthash:8].js';
      config.output.chunkFilename = 'static/chunks/[contenthash:16].js';
    }
    return config;
  },
};

module.exports = nextConfig;
