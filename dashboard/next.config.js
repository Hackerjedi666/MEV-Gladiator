/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ["@pit/shared"],
  webpack: (config) => {
    // Resolve .js import specifiers inside our TS-only shared package to their .ts source.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
