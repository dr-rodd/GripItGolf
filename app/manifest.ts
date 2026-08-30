import type { MetadataRoute } from "next";

/**
 * The web app manifest — what makes the site installable as an app.
 * Next serves this at /manifest.webmanifest and injects the <link> itself.
 *
 * `name` is the formal one (install sheets, settings lists); `short_name` is
 * the label under the icon and matches the wordmark. iOS actually labels the
 * icon from appleWebApp.title in app/layout.tsx — keep the two the same.
 *
 * start_url is "/" because the landing page already recognises a returning
 * player by cookie and routes them onward; there is no per-trip manifest.
 *
 * The colours are --color-bg, matching viewport.themeColor in app/layout.tsx
 * — background_color paints the launch screen, so it must be the same cream
 * the first paint arrives with.
 *
 * The 512 icon appears twice on purpose: once as "any", once as "maskable".
 * Separate entries, not "any maskable" in one — the combined form is flagged
 * by audits. No service worker, deliberately: installability has not
 * required one for years, and offline scoring is a future architecture
 * project, not a manifest field.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Green Dot Live",
    short_name: "green dot.",
    description:
      "Your handicap is the best 8 of your last 20. Live scoring, leaderboards and matchplay for your golf trip.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F4F0",
    theme_color: "#F6F4F0",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
