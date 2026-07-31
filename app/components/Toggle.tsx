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

const TRACK_W = 48
const TRACK_H = 28
const KNOB    = 20
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
      className={`relative flex-shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-accent' : 'bg-bark/[0.08]'
      }`}
      style={{ width: TRACK_W, height: TRACK_H }}
    >
      <span
        className="absolute rounded-full bg-white shadow"
        style={{
          width: KNOB,
          height: KNOB,
          top: (TRACK_H - KNOB) / 2,
          left: checked ? TRACK_W - KNOB - INSET : INSET,
          transition: 'left 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </button>
  )
}
