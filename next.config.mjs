/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // NEXT_PUBLIC_SUPABASE_URL — replace hostname with your Supabase project
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
