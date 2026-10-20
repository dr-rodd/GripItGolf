/**
 * A plain chain link — what stands where Golf Ireland's logo will go.
 *
 * No Golf Ireland logo, mark or colour reaches the live site until they
 * permit it in writing (docs/golf-ireland.md, "Branding"). Showing theirs
 * before then would suggest a partnership that does not exist, so every
 * place that will carry it carries this instead: a generic link in our own
 * emerald. When permission comes, these two components are the only places
 * that change — `test:golf-ireland` holds that no image stands in for them.
 *
 * Drawn here, never an image file: two rounded links, `currentColor`, so it
 * takes the text colour of wherever it sits and needs nothing for dark mode.
 */

export function LinkMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

/**
 * A linked player's badge, beside their name — the link in a deep-emerald
 * disc. Read aloud as "Linked to Golf Ireland", the one thing it means.
 * Shown only for a link the organiser has confirmed.
 */
export function LinkedBadge({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Linked to Golf Ireland"
      title="Linked to Golf Ireland"
      className={`inline-flex items-center justify-center rounded-full bg-accent-deep text-white flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <LinkMark size={Math.round(size * 0.62)} />
    </span>
  )
}

/**
 * The heading of every Golf Ireland card — the link, then the name. Where
 * their logo will sit across the top of the card once it is permitted.
 */
export function LinkHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-accent-tint text-accent-deep flex-shrink-0">
        <LinkMark size={18} />
      </span>
      <p className="t-card text-ink">{children}</p>
    </div>
  )
}
