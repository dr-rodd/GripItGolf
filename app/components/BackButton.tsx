import Link from "next/link"

/**
 * The one way back, everywhere.
 *
 * Two shapes, same box: a square when it is only an arrow sitting beside a
 * heading, and a wider pill when it carries a word ("Home", "Trip"). Both are
 * the rounded-xl bordered box used by every other control in the app, so a
 * back control never reads as a stray link or a bare chevron.
 */

type Common = { label?: string; className?: string }
type Props = Common & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }
)

const BASE = [
  "inline-flex items-center justify-center gap-2 flex-shrink-0",
  "h-11 rounded-xl border border-white/15 bg-white/[0.04]",
  "text-white/60 hover:text-white hover:border-white/30 hover:bg-white/[0.08]",
  "transition-colors",
].join(" ")

const icon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export default function BackButton({ href, onClick, label, className = "" }: Props) {
  // Square when the arrow speaks for itself; padded out when it has a word to say.
  const cls = `${BASE} ${label ? "px-4" : "w-11"} ${className}`.trim()

  const body = (
    <>
      {icon}
      {label && (
        <span className="text-xs tracking-[0.18em] uppercase">{label}</span>
      )}
    </>
  )

  // Without a label the arrow is the only content, so it needs a name read out.
  const aria = label ? undefined : "Back"

  if (href) {
    return <Link href={href} className={cls} aria-label={aria}>{body}</Link>
  }
  return <button type="button" onClick={onClick} className={cls} aria-label={aria}>{body}</button>
}
