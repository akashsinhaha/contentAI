import path from "path";
import { fileURLToPath } from "url";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client"],
  webpack(config) {
    config.resolve.alias["@"] = path.join(rootDirectory, "src");
    return config;
  },
};
export default nextConfig;
