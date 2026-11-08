import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.76"],

  // The old addresses (Ross, 8 Nov 2026: trips now at /golf/trip/<code>,
  // events at /golf/event/<code>). Every confirmation email, bookmark, QR
  // code and home-screen app made before says /trip/<code>, and /event/<code>
  // was live for an hour; both are sent on here, the rest of the address and
  // its query kept. Next's own redirects, not a proxy — a proxy.ts in front
  // of these pages took greendot.live down (docs/gotchas-and-debt.md). An
  // event that lands at its trip address is put right by the page itself
  // (lib/tripPaths.ts). Not permanent, so a browser never caches them.
  async redirects() {
    return [
      { source: "/trip/:code/:path*", destination: "/golf/trip/:code/:path*", permanent: false },
      { source: "/event/:code/:path*", destination: "/golf/event/:code/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
