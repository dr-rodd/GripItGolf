/**
 * The pieces every screen is built from.
 *
 * These exist so a card looks like a card everywhere without each page
 * restating the same six classes — and so changing what a card is means
 * changing it once. Anything visual that appears on more than two screens
 * belongs here rather than being retyped. The refresh plan's "Parts kit"
 * (docs/refresh-plan.md, Phase 3) is what each one is drawn from.
 *
 * Server components: none of them hold state. `Segmented` takes its value
 * and an onChange from whoever does.
 */

import Link from 'next/link'
import { IconChevronRight } from './icons'

// ─── Surfaces ──────────────────────────────────────────────────
//
// Three levels, and only three. Flat is a tint with no edge: an empty
// state, a segmented control's track, a round nobody has scored. Raised is
// every card — white, a hairline, a warm shadow just under it. Floating is a
// sheet or something being dragged. The hairline stays on a raised card on
// purpose: a shadow nearly vanishes in direct sunlight, and the line is what
// still separates card from page outdoors.
//
// **No cards inside cards.** Rows inside a card are a `ListGroup`; a block
// inside a card that needs setting apart is `flat`.

export type CardVariant = 'raised' | 'flat' | 'floating'

/**
 * A card's classes, for the places a card has to be some other element — a
 * `<Link>`, a `<button>`, a `<label>`. `pressable` adds the press: shadow
 * off, a little smaller, 120ms. Only on a real button or link, because iOS
 * gives `:active` to nothing else.
 */
export const cardClass = (variant: CardVariant = 'raised', pressable = false) => {
  const look =
    variant === 'flat'
      ? 'bg-tint'
      : variant === 'floating'
        ? 'bg-surface border border-line shadow-floating'
        : 'bg-surface border border-line shadow-raised'
  return `${look} rounded-card${pressable ? ' press' : ''}`
}

export function Card({
  children, className = '', as: As = 'div', variant = 'raised',
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'section' | 'li' | 'article' | 'ul' | 'ol'
  variant?: CardVariant
}) {
  return (
    <As className={`${cardClass(variant)} ${className}`.trim()}>
      {children}
    </As>
  )
}

/**
 * A section's heading: the title, at most one line under it, and at most
 * one action on the right — a secondary button, 44px, never a second
 * emerald one.
 */
export function SectionHeader({
  children, hint, action, className = '', as: As = 'h2',
}: {
  children: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`.trim()}>
      <div className="min-w-0">
        <As className="t-h2 text-ink">{children}</As>
        {hint && <p className="t-cap text-ink/65 mt-1">{hint}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

/** The old name, kept so a heading reads the same wherever it was written. */
export const SectionTitle = SectionHeader

// ─── Lists ─────────────────────────────────────────────────────

/**
 * One raised card holding rows, with hairlines between them. What a group
 * of settings, a roster or a set of boards is — one card, never a card per
 * row and never cards inside it.
 */
export function ListGroup({
  children, className = '', as: As = 'div',
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'ul' | 'section'
}) {
  return (
    <As className={`${cardClass()} overflow-hidden divide-y divide-line ${className}`.trim()}>
      {children}
    </As>
  )
}

/**
 * A row in a `ListGroup`: a label at 17/500, an optional value or hint in
 * caption type, and a chevron when it goes somewhere. At least 56px tall.
 * Given an `href` it is a link, an `onClick` a button, neither a plain row.
 */
export function ListRow({
  label, value, hint, icon, trailing, href, onClick, chevron, className = '',
}: {
  label: React.ReactNode
  /** On the right, before any chevron — a count, a setting's current answer. */
  value?: React.ReactNode
  /** Under the label, one line. */
  hint?: React.ReactNode
  /** A leading icon, drawn in a tile. */
  icon?: React.ReactNode
  /** Anything else for the right-hand end — a toggle, a pill. */
  trailing?: React.ReactNode
  href?: string
  onClick?: () => void
  /** Defaults to on for a link or a button, off for a plain row. */
  chevron?: boolean
  className?: string
}) {
  const goes = !!(href || onClick)
  const showChevron = chevron ?? goes
  const body = (
    <>
      {icon && (
        <span className="flex-shrink-0 w-10 h-10 rounded-tile bg-tint text-bark flex items-center justify-center" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-[17px] font-medium leading-snug text-ink">{label}</span>
        {hint && <span className="block t-cap text-ink/65 mt-0.5">{hint}</span>}
      </span>
      {value !== undefined && value !== null && (
        <span className="flex-shrink-0 t-cap text-ink/65 text-right">{value}</span>
      )}
      {trailing && <span className="flex-shrink-0">{trailing}</span>}
      {showChevron && (
        <span className="flex-shrink-0 text-ink/50" aria-hidden="true">
          <IconChevronRight size={20} />
        </span>
      )}
    </>
  )
  const cls = `flex items-center gap-3 min-h-14 px-4 py-3 text-left w-full ${goes ? 'press hover:bg-tint' : ''} ${className}`.trim()
  if (href) return <Link href={href} className={cls}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>
  return <div className={cls}>{body}</div>
}

// ─── Buttons ───────────────────────────────────────────────────
//
// One primary action per screen. Emerald is an accent, so a page with three
// emerald buttons on it has none.
//
// Sentence case and no letter-spacing: "Create challenge", never
// "CREATE CHALLENGE". Full width is 56px tall, inline 48. Disabled is a
// flat bark wash with dimmed words — not a washed-out green, which reads as
// broken rather than as "not yet".

// `press` rather than `transition-colors duration-150`: it carries the
// colour fade, the scale and the shadow under a thumb, and having it own the
// whole transition is what stops them overriding each other — see the note
// on `.press` in globals.css.
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-button press ' +
  'text-[17px] font-semibold leading-tight text-center ' +
  'disabled:cursor-not-allowed'

const DISABLED =
  'disabled:bg-disabled-bg disabled:text-disabled-fg disabled:border-transparent disabled:shadow-none'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

export const buttonClass = (
  variant: ButtonVariant = 'primary',
  full = true,
  /** 44px — a button inside a dense row, beside a dense field. */
  dense = false,
) => {
  const look =
    variant === 'primary'
      ? `bg-accent-deep text-white shadow-cta hover:bg-accent ${DISABLED}`
      : variant === 'secondary'
        ? `bg-surface text-ink border border-line shadow-raised hover:border-line-strong ${DISABLED}`
        : variant === 'danger'
          ? `bg-surface text-rust-deep border border-rust/40 hover:bg-rust/[0.06] ${DISABLED}`
          : 'text-accent-deep hover:text-accent disabled:text-disabled-fg'
  const size =
    variant === 'quiet'
      ? (dense ? 'min-h-11 px-2' : 'min-h-12 px-2')
      : dense ? `${full ? 'w-full ' : ''}min-h-11 px-4`
        : full ? 'w-full min-h-14 px-5' : 'min-h-12 px-5'
  return `${BUTTON_BASE} ${look} ${size}`.trim()
}

export function Button({
  children, variant = 'primary', full = true, className = '', type = 'button', ...rest
}: {
  children: React.ReactNode
  variant?: ButtonVariant
  full?: boolean
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>) {
  return (
    <button type={type} className={`${buttonClass(variant, full)} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

export function ButtonLink({
  href, children, variant = 'primary', full = true, className = '',
}: {
  href: string
  children: React.ReactNode
  variant?: ButtonVariant
  full?: boolean
  className?: string
}) {
  return (
    <Link href={href} className={`${buttonClass(variant, full)} ${className}`.trim()}>
      {children}
    </Link>
  )
}

/**
 * A control that is only an icon: 48px square (44 inside a dense row),
 * the icon 20 to 24, bark at half strength, and always a name read out.
 */
export const iconButtonClass = (dense = false) =>
  `inline-flex items-center justify-center flex-shrink-0 rounded-tile press text-ink/50 hover:text-ink/80 ${dense ? 'w-11 h-11' : 'w-12 h-12'}`

export function IconButton({
  label, children, dense = false, className = '', ...rest
}: {
  /** What it does, read out — the icon is all a sighted reader gets. */
  label: string
  children: React.ReactNode
  dense?: boolean
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'aria-label'>) {
  return (
    <button type="button" aria-label={label} title={label} className={`${iconButtonClass(dense)} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

// ─── Choosing ──────────────────────────────────────────────────

/**
 * A chip: 44px tall, fully round. Chosen is the deep emerald with white
 * words; not chosen is a raised white chip.
 */
export const chipClass = (selected: boolean, compact = false) =>
  `inline-flex items-center justify-center gap-1.5 min-h-11 ${compact ? 'px-2' : 'px-4'} rounded-full t-label tabular-nums press whitespace-nowrap ` +
  'disabled:bg-disabled-bg disabled:text-disabled-fg disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed ' +
  (selected
    ? 'bg-accent-deep text-white border border-accent-deep'
    : 'bg-surface text-ink border border-line shadow-raised hover:border-line-strong')

/**
 * A choice that needs more than a word — a label and a line under it. A
 * raised card; chosen, it takes the emerald wash with a deep-emerald edge.
 * On a real button, so it presses.
 */
export const optionClass = (selected: boolean) =>
  'block w-full text-left rounded-card px-4 py-3.5 press border ' +
  (selected
    ? 'bg-accent-tint border-accent-deep'
    : 'bg-surface border-line shadow-raised hover:border-line-strong')

/**
 * A row of chips answering one question — a form's either/or, a setting's
 * value. The answer given is the deep emerald. Equal widths by default, so
 * two or three answers read as a choice between equals; a long list wraps.
 *
 * Chips answer; `Segmented` switches what a screen shows. The difference
 * is what the emerald means: an answer you gave, not a view you are on.
 */
export function ChoiceChips<T extends string>({
  options, value, onChange, label, equal = true, className = '',
}: {
  options: readonly { value: T; label: React.ReactNode }[]
  /** Null when the question has not been answered yet. */
  value: T | null
  onChange: (next: T) => void
  /** The question, read out. */
  label: string
  equal?: boolean
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`flex gap-2 ${equal ? '' : 'flex-wrap'} ${className}`.trim()}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`${chipClass(o.value === value, equal)} ${equal ? 'flex-1 min-w-0' : ''}`.trim()}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A segmented control: two to a handful of answers on a tinted track, the
 * chosen one raised out of it. For switching what a screen shows — which
 * board, which view. It replaces the emerald pill pairs that did this job,
 * which spent the screen's one emerald on a switch. Scrolls sideways when
 * the answers will not fit.
 */
export function Segmented<T extends string>({
  options, value, onChange, label, className = '',
}: {
  options: readonly { value: T; label: React.ReactNode }[]
  /** Null when nothing has been chosen yet — every answer sits in the track. */
  value: T | null
  onChange: (next: T) => void
  /** What is being chosen, read out. */
  label: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-1 p-1 rounded-button bg-tint overflow-x-auto scroll-strip ${className}`.trim()}
    >
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`flex-1 min-w-max min-h-11 px-4 rounded-tile t-label whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 ease-out ${
              on ? 'bg-surface text-ink shadow-raised' : 'text-ink/65 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Status ────────────────────────────────────────────────────

/**
 * A status pill: 13px, sentence case, no letter-spacing. Won is the emerald
 * tint with deep-emerald words, lost the rust equivalent, anything else a
 * bark wash. Never black text on a coloured pill — it reads as a warning.
 */
export function Pill({
  children, tone = 'neutral', live = false, className = '',
}: {
  children: React.ReactNode
  tone?: 'win' | 'loss' | 'neutral'
  /** Adds the breathing dot. Only for something genuinely happening now. */
  live?: boolean
  className?: string
}) {
  const look =
    tone === 'win'
      ? 'bg-accent-tint text-accent-deep'
      : tone === 'loss'
        ? 'bg-rust/[0.14] text-rust-deep'
        : 'bg-bark/[0.09] text-ink/80'

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold leading-none whitespace-nowrap ${look} ${className}`.trim()}
    >
      {live && <span className="w-1.5 h-1.5 rounded-full bg-accent dot-live" aria-hidden="true" />}
      {children}
    </span>
  )
}

/** The dot motif on its own: small, solid, emerald, one per screen. */
export function LiveDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full bg-accent dot-live flex-shrink-0 ${className}`.trim()}
      title="Live"
      aria-label="Live"
      role="img"
    />
  )
}

// ─── Empty states ──────────────────────────────────────────────

/**
 * One short sentence and one clear action, on a flat tint. No
 * illustration, no icon — an empty screen should tell you what to do, not
 * decorate the fact.
 */
export function EmptyState({
  message, actionLabel, actionHref, className = '',
}: {
  message: string
  actionLabel?: string
  actionHref?: string
  className?: string
}) {
  return (
    <div className={`${cardClass('flat')} text-center py-12 px-6 ${className}`.trim()}>
      <p className="t-body text-ink/80 max-w-[24rem] mx-auto">{message}</p>
      {actionLabel && actionHref && (
        <div className="mt-5 flex justify-center">
          <ButtonLink href={actionHref} full={false}>{actionLabel}</ButtonLink>
        </div>
      )}
    </div>
  )
}

// ─── The code ──────────────────────────────────────────────────

/**
 * One character of an event's code, shown big — the confirmation screens
 * and the share card. Archivo 600 in ink, not emerald: the code is read
 * and copied, not pressed. Laid out as characters with a gap rather than
 * letter-spacing, which adds space after the last character too and
 * pushed the code off the right edge of its box. The code and the field
 * it is typed into are the one place capitals are spaced.
 */
export const CODE_CHAR = 'font-semibold text-[clamp(2rem,11vw,2.5rem)] leading-none text-ink tabular-nums'

// ─── Form furniture ────────────────────────────────────────────

/**
 * A field's input: 56px, 17px type, a 1.5px line that becomes a 2.5px
 * emerald one in focus and a rust one in error. The look lives in
 * `.field` in globals.css, because a type size on an input has to be said
 * outside Tailwind's layers to beat the 16px floor every input carries.
 */
export const FIELD = 'field'

/** A field's label: Archivo 15/600, sentence case, 8px above the field. */
export const FIELD_LABEL = 'block t-label text-ink/80 mb-2'

/**
 * A labelled field: the label, the input you hand it, a one-line hint, and
 * the error right under the field when there is one. Give the input
 * `className={FIELD}`, an `id` matching `htmlFor`, and
 * `aria-invalid={!!error}` so it takes the rust line.
 */
export function Field({
  label, htmlFor, hint, error, children, className = '',
}: {
  label: React.ReactNode
  htmlFor?: string
  hint?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={FIELD_LABEL}>{label}</label>
      {children}
      {error
        ? <p className="mt-2 text-[15px] leading-snug text-rust-deep" role="alert">{error}</p>
        : hint ? <p className="mt-2 t-cap text-ink/65">{hint}</p> : null}
    </div>
  )
}
