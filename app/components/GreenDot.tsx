/**
 * The mark the whole thing is named after.
 *
 * Your handicap comes from the best 8 of your last 20 rounds. On the graph
 * those 8 are green dots — so a green dot means the round counted. That is
 * what every golfer is chasing when they tee off, and it is the one image
 * this app is built around.
 *
 * A server component: it is decoration, and nothing about it needs to reach
 * the browser as JavaScript. The pulse is CSS.
 */

export default function GreenDot({
  size = 16,
  className = '',
  label,
}: {
  /** Diameter of the dot itself, in pixels. The glow extends beyond it. */
  size?: number
  className?: string
  /** Given only where the dot carries meaning rather than decoration. */
  label?: string
}) {
  const halo = Math.round(size * 2.6)

  return (
    <span
      className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: halo, height: halo }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Outer breath — slow, so it reads as alive rather than busy */}
      <span
        className="absolute rounded-full"
        style={{
          width: halo,
          height: halo,
          background:
            'radial-gradient(circle, rgba(52,211,153,0.34) 0%, rgba(52,211,153,0.10) 45%, transparent 70%)',
          animation: 'gdBreathe 3.2s ease-in-out infinite',
        }}
      />
      {/* Ring, expanding outward and fading, like a ripple off the dot */}
      <span
        className="absolute rounded-full border"
        style={{
          width: size * 1.7,
          height: size * 1.7,
          borderColor: 'rgba(52,211,153,0.55)',
          animation: 'gdRipple 3.2s ease-out infinite',
        }}
      />
      {/* The dot */}
      <span
        className="relative rounded-full"
        style={{
          width: size,
          height: size,
          background: 'radial-gradient(circle at 35% 32%, #6EE7B7 0%, #34D399 55%, #10B981 100%)',
          boxShadow: `0 0 ${size * 0.9}px rgba(52,211,153,0.85), 0 0 ${size * 2}px rgba(52,211,153,0.35)`,
        }}
      />
    </span>
  )
}
