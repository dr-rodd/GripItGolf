import type { Metadata, Viewport } from "next";
import { Archivo, Baloo_2 } from "next/font/google";
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

/**
 * Baloo 2 is one exception to "three families, never mixed" — it is used
 * for exactly one element, the trip name at the top of the trip page, which
 * carries more visual weight than any other title in the app. On Google
 * Fonts, so it comes through next/font like Archivo: self-hosted, no CDN
 * dependency.
 */
const baloo2 = Baloo_2({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-baloo",
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
      <body className={`${archivo.variable} ${baloo2.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
