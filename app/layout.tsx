import type { Metadata, Viewport } from "next";
import { Archivo, Schibsted_Grotesk } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { STYLE_BOOT_SCRIPT } from "@/lib/styleLab";
import "./globals.css";
// The style lab (/admin/style) — after globals.css so its rules win ties.
// @font-face and html[data-…] rules only: with no lab attribute on <html>
// nothing in it applies, and its fonts are downloaded only by a phone that
// draws text in them. lib/styleLab.ts generates it.
import "./style-lab.css";

/**
 * Archivo and Schibsted Grotesk come through next/font, so they are
 * self-hosted, preloaded, and immune to a third party being slow.
 *
 * Archivo is the workhorse: buttons, labels, form fields — everything that
 * has to stay legible in bright sunlight. It loads whole, as the variable
 * font with its width axis, because the tab bar sets its labels narrower
 * (`font-stretch: 87.5%`) to fit "Leaderboard" across a 320px phone at 13px.
 *
 * Schibsted Grotesk is the title face, at 700 only. Titles are 700
 * everywhere — heavier turns shouty, lighter goes soft in sunlight — so a
 * single weight is the rule as well as the smaller download: any title that
 * asks for another weight is given 700 anyway.
 *
 * **Both `.variable` classes go on `<html>`, never `<body>`.** The stacks in
 * globals.css (`--font-ui`, `--font-display`) are declared on `:root` and
 * refer to these variables, and a custom property works out its `var()`
 * where it is declared. With the classes on `<body>`, `--font-archivo` did
 * not exist yet at `:root`, both stacks came out invalid, and every label,
 * button and title on the site fell back to the body serif — for the whole
 * of the site's life until October 2026, because the test only checked that
 * the stylesheet named the fonts. test:branding now checks where they land.
 *
 * Bespoke Serif is a Fontshare font, not on Google Fonts, so it still loads
 * from Fontshare's CDN via the stylesheet below. If that ever fails the page
 * still reads properly: the fallback chain in globals.css puts Georgia behind
 * it, so the register survives even when the exact face does not.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-schibsted",
  display: "swap",
});

const FONTSHARE =
  "https://api.fontshare.com/v2/css?" +
  "f[]=bespoke-serif@400,500,700&" +
  "display=swap";

export const metadata: Metadata = {
  // What a pasted link unfurls into. The base is the canonical site, so the
  // relative image below resolves absolute — WhatsApp's fetcher refuses a
  // relative og:image and runs no JavaScript, which is why all of this is
  // server-rendered metadata rather than anything in a component. A preview
  // deploy's links unfurl with the production image, which is the right
  // image either way.
  metadataBase: new URL("https://greendot.live"),
  title: "green dot.",
  description:
    "Live scoring and leaderboards for your event. Golf trips, tournaments — and more to come.",
  openGraph: {
    siteName: "Green Dot",
    title: "green dot.",
    description:
      "Live scoring and leaderboards for your event. Golf trips, tournaments — and more to come.",
    type: "website",
    images: "/og-image.png",
  },
  // The install layer's Apple half — the manifest (app/manifest.ts) covers
  // everyone else. `title` is the label under the home-screen icon.
  // statusBarStyle stays "default": dark text, readable over the cream
  // background. "black-translucent" turns the text white — invisible on
  // #F6F4F0.
  appleWebApp: {
    capable: true,
    title: "green dot.",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F4F0",
  width: "device-width",
  initialScale: 1,
  // Without this, iOS reports every safe-area inset as zero — so the tab
  // bar's `env(safe-area-inset-bottom)` padding, and every `calc()` built
  // on it, never actually fired. The visible symptom: scroll to the bottom
  // of a page, Safari's toolbar collapses, and the bar sits in the home
  // indicator's zone — "off the bottom". Cover is what makes the inset a
  // real number the bar can clear.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is scoped to this element's own attributes: the
    // theme boot script below adds `class="dark"` before React hydrates, and
    // without it React reports the server/client mismatch on every dark visit.
    <html
      lang="en"
      className={`${archivo.variable} ${schibsted.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Dark mode, before first paint. An inline script rather than a
            cookie read on the server, because cookies() in the root layout
            would force every route dynamic — including the landing page,
            whose static-ness the entry animation depends on. The script is
            the only thing that may set the class; see lib/theme.ts. */}
        {/* The style lab's attributes ride in the same script, for the
            same reason: they must be on <html> before the first paint, and
            the cookie must never be read on the server. */}
        <script dangerouslySetInnerHTML={{ __html: `${THEME_BOOT_SCRIPT};${STYLE_BOOT_SCRIPT}` }} />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTSHARE} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
