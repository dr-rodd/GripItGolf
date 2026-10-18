'use client'

/**
 * A switch whose knob is positioned explicitly rather than translated.
 *
 * The previous version placed the knob with `position: absolute` and no `left`,
 * relying on its static position, then moved it with a transform. That static
 * position is not where you would expect inside a button, so the knob sat
 * outside the track at rest and stopped halfway when switched on. Setting
 * `left` outright removes the guesswork — and avoids a transform, which this
 * codebase steers clear of on iOS anyway.
 */

const TRACK_W = 52
const TRACK_H = 32
const KNOB    = 24
const INSET   = 4

export default function Toggle({
  checked, onChange, disabled, label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // 52×32: on is the deep emerald, off is bark at 20%. The knob moves on
      // the putt curve over 160ms — the small-change pace.
      className={`relative flex-shrink-0 rounded-full transition-colors duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-accent-deep' : 'bg-bark/20'
      }`}
      style={{ width: TRACK_W, height: TRACK_H }}
    >
      <span
        className="absolute rounded-full bg-white shadow-raised"
        style={{
          width: KNOB,
          height: KNOB,
          top: (TRACK_H - KNOB) / 2,
          left: checked ? TRACK_W - KNOB - INSET : INSET,
          transition: 'left 160ms var(--gd-ease)',
        }}
      />
    </button>
  )
}
