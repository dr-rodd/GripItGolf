import { ImageResponse } from "next/og";
import { IconTile } from "@/lib/iconTile";

// The larger manifest icon, doing double duty: listed once as purpose "any"
// and once as "maskable" in app/manifest.ts. The tile's 62% dot stays inside
// the maskable safe zone (the central 80%), which is what lets one asset
// serve both. If the dot ever wants to be bigger on plain icons, add a
// fourth route rather than breaking the safe zone here.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<IconTile size={512} />, { width: 512, height: 512 });
}
