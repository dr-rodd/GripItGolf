import Link from "next/link"
import { IconChevronLeft } from "./icons"

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
  "inline-flex items-center justify-center gap-1 flex-shrink-0",
  "h-11 rounded-xl border border-bark/12 bg-surface",
  "text-ink/65 hover:text-ink hover:border-bark/25",
  "transition-colors duration-150",
].join(" ")

const icon = <IconChevronLeft size={18} />

export default function BackButton({ href, onClick, label, className = "" }: Props) {
  // Square when the arrow speaks for itself; padded out when it has a word to say.
  const cls = `${BASE} ${label ? "px-4" : "w-11"} ${className}`.trim()

  const body = (
    <>
      {icon}
      {label && (
        <span className="t-label pr-1">{label}</span>
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
