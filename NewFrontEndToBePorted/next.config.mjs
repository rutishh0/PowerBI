/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML/CSS/JS export: `next build` writes everything into ./out/.
  // Flask serves those files directly so the whole project runs from a
  // single Render web service. Implications:
  //   - No Server Actions, no Route Handlers, no server-side `redirect()`
  //     inside RSC components. Auth flows are client-side fetches to Flask.
  //   - `experimental.serverActions` is no longer needed and removed.
  output: "export",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Dev-only rewrites so `pnpm dev` on :3000 can talk to Flask on :5000.
  // Static export does not run a Next server in production, so rewrites
  // never fire there — they're harmless to leave in place.
  async rewrites() {
    const backend = process.env.FLASK_BACKEND_URL || "http://localhost:5000"
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
      {
        source: "/logout",
        destination: `${backend}/logout`,
      },
    ]
  },
}

export default nextConfig
