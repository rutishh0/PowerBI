/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hosted as a sub-path of the Flask domain (elevatechecked1.info/beta).
  // basePath ensures all Next pages, links, and static assets are served
  // under /beta/* — Flask reverse-proxies that prefix to this service.
  basePath: "/beta",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Server Actions enforce CSRF by comparing Origin to Host. When this
  // service is reverse-proxied through Flask, the browser's Origin is
  // the Flask domain but our Host is the Render URL — mismatch causes
  // 500s on every form submit. Whitelist the proxy origins explicitly.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "elevatechecked1.info",
        "www.elevatechecked1.info",
        "powerbi-1d2m.onrender.com",
        "powerbi-1-ulbm.onrender.com",
      ],
    },
  },
  async rewrites() {
    // Local-dev rewrite only. In production the browser hits Flask directly
    // at /api/*, /logout (same origin = elevatechecked1.info), so these
    // rewrites never fire. `basePath: false` keeps them pinned at the root
    // even though the rest of Next is under /beta.
    const backend = process.env.FLASK_BACKEND_URL || "http://localhost:5000"
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
        basePath: false,
      },
      {
        source: "/logout",
        destination: `${backend}/logout`,
        basePath: false,
      },
    ]
  },
}

export default nextConfig
