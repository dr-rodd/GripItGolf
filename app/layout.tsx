import type { Metadata } from "next";
import { Playfair_Display, Caveat, Crimson_Pro } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
});

const crimson = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-crimson",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Green Dot Golf",
  description: "Your handicap is the best 8 of your last 20. Live scoring, leaderboards and matchplay for your golf trip.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${caveat.variable} ${crimson.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
