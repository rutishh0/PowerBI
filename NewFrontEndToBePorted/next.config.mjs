/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    // Server-side proxy: every /api/* request hits Flask. Cookies stay on
    // the Next origin, which means the browser never crosses an origin
    // boundary — no CORS preflight, no SameSite headaches.
    // Override the backend with FLASK_BACKEND_URL in production.
    const backend = process.env.FLASK_BACKEND_URL || "http://localhost:5000"
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      // /logout proxies to Flask too so the legacy HTML logout still works
      { source: "/logout", destination: `${backend}/logout` },
    ]
  },
}

export default nextConfig
