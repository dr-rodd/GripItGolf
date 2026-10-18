import Link from "next/link"
import { IconChevronLeft } from "./icons"

/**
 * The one way back, everywhere.
 *
 * A bare chevron, 48px square — no box, no border, no shadow. Two shapes: a
 * square when it is only the arrow sitting beside a heading, and wider when
 * it carries a word ("Home", "Trip"). Both are 48px tall, the touch target.
 *
 * It was a 44px bordered box, and in the create wizards that box sat
 * absolutely positioned in a step row about 34px tall — hanging out of the
 * row top and bottom, over the progress bar and across the row's border.
 * The rows are 48px grids now with the button in the flow
 * (docs/refresh-plan.md, 2.4); `test:branding` holds both halves.
 *
 * `dense` keeps the old 44px footprint, for the scoring screens' header
 * rows, whose layout is frozen — 44 is the floor for an icon button inside
 * a row. Named call sites only; the test lists them.
 */

type Common = { label?: string; className?: string; dense?: boolean }
type Props = Common & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }
)

const BASE = [
  "inline-flex items-center justify-center gap-1 flex-shrink-0 rounded-xl",
  "text-ink/80 hover:text-ink",
  "transition-colors duration-150",
].join(" ")

export default function BackButton({ href, onClick, label, className = "", dense = false }: Props) {
  const box = dense ? "h-11" : "h-12"
  // Square when the arrow speaks for itself; padded out when it has a word to say.
  const width = label ? "pl-2 pr-3" : dense ? "w-11" : "w-12"
  const cls = `${BASE} ${box} ${width} ${className}`.trim()

  const body = (
    <>
      <IconChevronLeft size={24} />
      {label && (
        <span className="t-label">{label}</span>
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
