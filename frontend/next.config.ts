import type { NextConfig } from "next"

const apiOrigin = (() => {
  const value = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "")
  try {
    return value ? new URL(value).origin : "http://localhost:8000"
  } catch {
    return "http://localhost:8000"
  }
})()

const isDevelopment = process.env.NODE_ENV === "development"

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "img-src 'self' data: blob:",
  // Next.js requires inline bootstrap styles and scripts for this client application.
  // React's development diagnostics use eval for stack reconstruction. Keep this
  // exception out of the production CSP served to Vercel and other hosts.
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://cdnjs.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
};
export default nextConfig
