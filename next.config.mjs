/** Baseline security headers applied to every response. A nonce-based CSP is
 *  deferred to the frontend phase (it needs per-page tuning to avoid breakage). */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["postgres"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
