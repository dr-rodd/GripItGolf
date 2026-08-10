import { ImageResponse } from "next/og";
import { IconTile } from "@/lib/iconTile";

// One of the two manifest icons (see app/manifest.ts) — Android and desktop
// installs read these; iOS uses app/apple-icon.tsx. Extension-less URL: the
// manifest's `type` field carries the MIME type. force-static because GET
// handlers are dynamic by default, and this should be built once, not drawn
// per request.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<IconTile size={192} />, { width: 192, height: 192 });
}
