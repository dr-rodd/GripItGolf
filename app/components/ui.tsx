/**
 * The pieces every screen is built from.
 *
 * These exist so a card looks like a card everywhere without each page
 * restating the same six classes — and so changing what a card is means
 * changing it once. Anything visual that appears on more than two screens
 * belongs here rather than being retyped.
 *
 * Server components: none of them hold state.
 */

import Link from 'next/link'

// ─── Surfaces ──────────────────────────────────────────────────

/** A raised surface: white on the cream page, hairline border, no shadow. */
export function Card({
  children, className = '', as: As = 'div',
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'section' | 'li'
}) {
  return (
    <As className={`bg-surface border border-bark/12 rounded-2xl ${className}`}>
      {children}
    </As>
  )
}

/** A section heading. The label above it is Archivo; the heading is Clash. */
export function SectionTitle({
  children, hint, className = '',
}: {
  children: React.ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={className}>
      <h2 className="t-h2 text-ink">{children}</h2>
      {hint && <p className="t-cap text-ink/40 mt-1">{hint}</p>}
    </div>
  )
}

/** The small all-caps line that labels a group. */
export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`t-cap uppercase tracking-[0.18em] text-ink/40 ${className}`}>
      {children}
    </p>
  )
}

// ─── Buttons ───────────────────────────────────────────────────
//
// One primary action per screen. Emerald is an accent, so a page with three
// emerald buttons on it has none.

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl t-label ' +
  'transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ' +
  'min-h-[48px] px-5'

export const buttonClass = (
  variant: 'primary' | 'secondary' | 'quiet' | 'danger' = 'primary',
  full = true,
) => {
  const look =
    variant === 'primary'
      ? 'bg-accent text-white hover:bg-accent-deep'
      : variant === 'secondary'
        ? 'bg-surface text-ink border border-bark/25 hover:border-bark/40'
        : variant === 'danger'
          ? 'bg-surface text-rust-deep border border-rust/40 hover:bg-rust/[0.06]'
          : 'text-ink/60 hover:text-ink'
  return `${BUTTON_BASE} ${look} ${full ? 'w-full' : ''}`.trim()
}

export function ButtonLink({
  href, children, variant = 'primary', full = true, className = '',
}: {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  full?: boolean
  className?: string
}) {
  return (
    <Link href={href} className={`${buttonClass(variant, full)} ${className}`.trim()}>
      {children}
    </Link>
  )
}

// ─── Status ────────────────────────────────────────────────────

/**
 * A status pill: the status colour at 22%, text a darker shade of the same
 * hue. Never black text on a coloured pill — it reads as a warning.
 */
export function Badge({
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
      ? 'bg-accent/[0.22] text-accent-deep'
      : tone === 'loss'
        ? 'bg-rust/[0.22] text-rust-deep'
        : 'bg-bark/[0.09] text-bark'

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full t-cap uppercase tracking-[0.12em] whitespace-nowrap ${look} ${className}`.trim()}
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
 * One short sentence and one clear action. No illustration, no icon — an
 * empty screen should tell you what to do, not decorate the fact.
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
    <div className={`text-center py-12 px-6 ${className}`.trim()}>
      <p className="t-body text-ink/65 max-w-[24rem] mx-auto">{message}</p>
      {actionLabel && actionHref && (
        <div className="mt-5 flex justify-center">
          <ButtonLink href={actionHref} full={false}>{actionLabel}</ButtonLink>
        </div>
      )}
    </div>
  )
}

// ─── Form furniture ────────────────────────────────────────────

export const FIELD =
  'w-full bg-surface border border-bark/25 rounded-xl px-4 py-3.5 ' +
  'text-ink placeholder:text-ink/40 ' +
  'focus:outline-none focus:border-accent transition-colors duration-150 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export const FIELD_LABEL = 'block t-label text-ink/65 mb-2'
