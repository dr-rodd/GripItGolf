/**
 * The stand-in mark for a Golf Ireland link — two loose loops, linked.
 *
 * Ross's own drawing (October 2026), traced: an emerald loop and a grey one,
 * hand-drawn rather than geometric, passing through each other like two
 * links of a chain — the emerald over the grey at the bottom crossing, the
 * grey over the emerald at the top. It stands wherever Golf Ireland's logo
 * will go, because no Golf Ireland logo, mark or colour reaches the live
 * site until they permit it in writing (docs/golf-ireland.md, "Branding").
 * It is ours, in our own emerald and the neutral bark — deliberately not
 * their teal — and when permission comes, this file is the one that
 * changes. `test:golf-ireland` holds that no image stands in for it.
 *
 * Drawn here, never an image file, and coloured from the tokens, so it
 * follows the theme with nothing extra for dark mode.
 */

/** The emerald loop — the upper right. */
const FRONT = 'M21.7 0.9C22.9 0.8 25.4 0.9 26.8 0.9C28.1 1.0 28.5 0.8 29.7 1.2C31.0 1.6 32.7 2.7 34.2 3.4C35.6 4.2 37.2 5.0 38.3 5.6C39.5 6.3 40.2 6.6 41.1 7.4C41.9 8.1 42.8 9.3 43.4 10.2C44.0 11.0 44.3 11.4 44.5 12.3C44.7 13.2 44.7 14.4 44.6 15.7C44.5 17.0 44.1 18.6 43.8 19.8C43.6 21.1 43.3 22.0 42.9 23.1C42.6 24.2 42.2 25.3 41.7 26.3C41.3 27.3 40.8 28.2 40.2 29.1C39.5 30.0 38.6 31.0 37.8 31.8C37.1 32.7 36.2 33.6 35.5 34.2C34.8 34.7 34.4 35.1 33.7 35.4C33.0 35.6 32.4 35.7 31.4 35.8C30.4 35.9 28.8 35.9 27.7 35.8C26.6 35.8 25.9 35.7 24.9 35.5C24.0 35.4 22.9 35.2 22.0 34.9C21.0 34.6 20.3 34.2 19.4 33.7C18.5 33.2 17.5 32.6 16.6 32.0C15.7 31.4 14.8 30.9 13.8 30.2C12.9 29.5 11.8 28.7 11.1 28.0C10.3 27.2 9.7 26.6 9.2 25.8C8.7 25.1 8.2 24.6 8.0 23.7C7.8 22.9 8.0 21.7 8.0 20.8C8.0 19.8 8.0 18.8 8.1 18.0C8.2 17.2 8.4 16.5 8.7 15.7C8.9 14.9 9.2 14.2 9.5 13.4C9.8 12.6 10.3 11.6 10.7 10.8C11.2 10.0 11.6 9.1 12.2 8.3C12.7 7.6 13.3 7.0 14.0 6.3C14.8 5.6 15.7 4.7 16.6 4.0C17.5 3.2 18.5 2.4 19.4 1.9C20.2 1.4 20.5 1.1 21.7 0.9Z'
/** The grey loop — the lower left. */
const BACK = 'M12.0 13.7C13.4 13.5 15.7 13.6 17.1 13.7C18.5 13.7 19.3 13.9 20.3 14.1C21.3 14.3 22.2 14.5 23.1 15.0C24.0 15.4 24.9 16.0 25.8 16.6C26.8 17.3 27.8 18.1 28.6 18.9C29.5 19.7 30.2 20.6 30.9 21.4C31.7 22.3 32.4 23.1 33.0 24.0C33.7 24.9 34.4 26.0 34.9 26.8C35.3 27.6 35.6 28.0 35.7 28.9C35.9 29.8 35.8 31.3 35.7 32.3C35.7 33.3 35.6 34.2 35.4 35.1C35.3 36.0 35.1 37.0 34.7 37.8C34.3 38.7 33.8 39.5 33.2 40.3C32.7 41.2 32.0 42.0 31.4 42.7C30.8 43.4 30.2 44.1 29.5 44.6C28.9 45.1 28.2 45.5 27.5 45.9C26.8 46.2 26.1 46.5 25.4 46.6C24.6 46.8 24.9 46.8 23.1 46.8C21.2 46.8 16.3 46.9 14.3 46.8C12.3 46.7 12.1 46.7 11.1 46.4C10.0 46.2 9.1 45.8 8.1 45.2C7.2 44.7 6.2 43.9 5.4 43.2C4.5 42.5 3.6 41.6 3.0 40.8C2.3 40.0 1.9 39.1 1.6 38.3C1.2 37.5 1.0 37.5 0.9 36.0C0.8 34.5 0.9 30.8 0.9 29.1C1.0 27.4 1.0 27.0 1.2 25.8C1.4 24.7 1.9 23.4 2.3 22.4C2.7 21.4 3.1 20.7 3.7 19.8C4.3 19.0 4.9 17.9 5.7 17.1C6.6 16.2 7.7 15.3 8.8 14.8C9.8 14.2 10.6 13.8 12.0 13.7Z'

const EMERALD = 'var(--color-accent)'
const GREY = 'color-mix(in srgb, var(--color-bark) 38%, transparent)'

export function LinkMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  // Heavier when small, so a badge beside a name still reads as two loops.
  const weight = size <= 24 ? 4.4 : size <= 40 ? 3.4 : 2.6
  return (
    <svg
      width={size}
      height={size}
      viewBox="-2 -1.5 49 50"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <defs>
        {/* Where the emerald passes back over the grey — the bottom crossing. */}
        <clipPath id="gd-link-over">
          <circle cx="35.3" cy="34.2" r="6" />
        </clipPath>
      </defs>
      <path d={FRONT} style={{ stroke: EMERALD }} strokeWidth={weight} />
      <path d={BACK} style={{ stroke: GREY }} strokeWidth={weight} />
      <path d={FRONT} style={{ stroke: EMERALD }} strokeWidth={weight} clipPath="url(#gd-link-over)" />
    </svg>
  )
}

/**
 * A linked player's badge, beside their name — the mark itself. Read
 * aloud as "Linked to Golf Ireland", the one thing it means. Shown only
 * for a link the organiser has confirmed.
 */
export function LinkedBadge({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Linked to Golf Ireland"
      title="Linked to Golf Ireland"
      className={`inline-flex flex-shrink-0 ${className}`}
    >
      <LinkMark size={size} />
    </span>
  )
}

/**
 * The heading of every Golf Ireland card — the mark, then the name. Where
 * their logo will sit across the top of the card once it is permitted.
 */
export function LinkHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <LinkMark size={34} className="flex-shrink-0" />
      <p className="t-card text-ink">{children}</p>
    </div>
  )
}
