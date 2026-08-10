import { ImageResponse } from "next/og";
import { IconTile } from "@/lib/iconTile";

// Next's file convention: this renders once at build time and emits the
// <link rel="apple-touch-icon"> — the icon iOS uses for Add to Home Screen.
// The drawing itself lives in lib/iconTile.tsx, shared with the manifest
// icons so all platforms show the same tile.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconTile size={180} />, size);
}
