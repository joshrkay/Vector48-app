/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  // pdf-parse is an optional runtime dependency used only by the extract-pdf
  // route; exclude it from the webpack bundle so the build doesn't fail when
  // it is not installed.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
