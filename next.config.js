/** @type {import('next').NextConfig} */
const nextConfig = {
  // For Next.js 15 with App Hosting, 'standalone' output is generally recommended
  // as it produces a self-contained server for deployment.
  output: 'standalone', 

  // Your existing configurations:
  typescript: {
    ignoreBuildErrors: true, // Keep this as you had it
  },
  eslint: {
    ignoreDuringBuilds: true, // Keep this as you had it
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // You might also need to configure 'allowedDevOrigins' for Next.js 15 in development
  // to resolve the cross-origin warning you saw earlier, but not critical for deploy.
  // experimental: {
  //   allowedDevOrigins: ['https://3000-firebase-studio-XXXX.cloudworkstations.dev'], // Adjust this if needed
  // },
};

module.exports = nextConfig;