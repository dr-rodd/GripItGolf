/**
 * The home-screen tile: the green dot on a cream square.
 *
 * This is the one drawing of it. Three PNGs are generated from this component
 * at build time — app/apple-icon.tsx (iOS home screen, 180) and the
 * app/icon-192 / app/icon-512 route handlers (the manifest's icons, for
 * Android and desktop installs) — so the icon cannot disagree with itself
 * across platforms.
 *
 * Opaque cream on purpose: iOS composites a transparent apple-touch-icon
 * onto black, which would turn the tile into a dark square on every home
 * screen. This is why the favicon (app/icon.svg, transparent behind the dot)
 * is not reused here — the two backgrounds want opposite things.
 *
 * The dot sits at 62% of the tile, smaller than the favicon's near-full
 * bleed, for two reasons: a home-screen tile needs breathing room, and the
 * maskable manifest icon must keep its content inside the central 80% safe
 * zone or Android's shaped masks clip it. Corners are square on purpose —
 * iOS applies its own squircle.
 *
 * Hexes are written out because ImageResponse (Satori) cannot read CSS
 * custom properties. They are --color-bg and --color-accent from
 * app/globals.css; if either ever moves, this moves with it.
 */
export function IconTile({ size }: { size: number }) {
  const dot = Math.round(size * 0.62);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F6F4F0",
      }}
    >
      <div
        style={{
          width: dot,
          height: dot,
          borderRadius: "50%",
          backgroundColor: "#0A9D56",
        }}
      />
    </div>
  );
}
