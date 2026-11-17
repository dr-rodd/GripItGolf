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
      // A Green Dot member's home is /home (stage (g), D148): My events is
      // its Events tab now, and /dashboard — never a page of its own, only
      // /dashboard/create under it — lands there too.
      { source: "/account/events", destination: "/home?tab=events", permanent: false },
      { source: "/dashboard", destination: "/home", permanent: false },
      // The Clubhouse's Competitions became Events (stage c1, M1).
      { source: "/clubhouse/:slug/competitions", destination: "/clubhouse/:slug/events", permanent: false },
    ];
  },
};

export default nextConfig;
