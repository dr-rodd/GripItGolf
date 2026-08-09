import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

/**
 * Archivo comes through next/font, so it is self-hosted, preloaded, and
 * immune to a third party being slow. It is the workhorse: buttons, labels,
 * form fields — everything that has to stay legible in bright sunlight.
 *
 * Clash Display and Bespoke Serif are Fontshare fonts, not on Google Fonts,
 * so they load from Fontshare's CDN via the stylesheet below. If that ever
 * fails the page still reads properly: the fallback chain in globals.css puts
 * Archivo behind Clash Display and Georgia behind Bespoke Serif, so the
 * weights and the register survive even when the exact faces do not.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const FONTSHARE =
  "https://api.fontshare.com/v2/css?" +
  "f[]=clash-display@500,600&" +
  "f[]=bespoke-serif@400,500,700&" +
  "display=swap";

export const metadata: Metadata = {
  title: "green dot.",
  description:
    "Your handicap is the best 8 of your last 20. Live scoring, leaderboards and matchplay for your golf trip.",
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTSHARE} />
      </head>
      <body className={`${archivo.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
