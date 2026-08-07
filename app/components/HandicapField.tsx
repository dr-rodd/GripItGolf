'use client'

import { useState } from 'react'
import { HANDICAP_INPUT } from '@/lib/handicap'

/**
 * A handicap, typed on a phone.
 *
 * The keypad and the plus sign pull against each other, and this exists
 * because the app has now had the bug at both ends. A decimal keypad is the
 * right keyboard for 14.2 and has no `+` on it — iOS and Android both — so a
 * plus handicap could not be entered at all. The field was switched to
 * `inputMode="text"` to get the sign back, which handed everybody a full
 * QWERTY keyboard to type two digits with: the common case broken to serve
 * the rare one.
 *
 * So the sign stops being a character to type and becomes a control. The
 * keypad comes back for everyone, and a player better than scratch taps `+`.
 * `parseHandicap` still reads the text, so nothing downstream changes — the
 * button only ever writes the same "+1" a keyboard used to.
 *
 * Controlled or not, because the call sites are both. Pass `value` and it
 * follows the parent; pass `defaultValue` and it keeps its own, which is what
 * the editable player row wants — a row seeded from the database that saves
 * on blur rather than on every keystroke.
 */
export default function HandicapField({
  value, defaultValue, onChange, onCommit,
  placeholder, className = '', rowClassName = '', disabled = false,
}: {
  /** Controlled text. Leave unset to let the field hold its own. */
  value?: string
  /** Uncontrolled seed. Ignored when `value` is given. */
  defaultValue?: string
  /** Every keystroke, and the sign button. */
  onChange?: (next: string) => void
  /**
   * Worth saving: on blur, and on the sign button.
   *
   * The button needs its own call because a click blurs the input first, so
   * the blur carries the text from *before* the sign changed. Without this
   * the toggle would look right and save nothing.
   */
  onCommit?: (next: string) => void
  placeholder?: string
  /** Classes for the input itself, so each form keeps its own field shape. */
  className?: string
  /** Classes for the row holding the input and the button. */
  rowClassName?: string
  disabled?: boolean
}) {
  const [inner, setInner] = useState(defaultValue ?? '')
  const text = value ?? inner

  // A leading minus counts as a plus handicap for the same reason
  // `parseHandicap` reads it that way: nobody means "worse than scratch by
  // minus one", so the two are one state here.
  const trimmed = text.trim()
  const plus = trimmed.startsWith('+') || trimmed.startsWith('-')

  function set(next: string, commit: boolean) {
    if (value === undefined) setInner(next)
    onChange?.(next)
    if (commit) onCommit?.(next)
  }

  return (
    <div className={`flex gap-1.5 ${rowClassName}`}>
      <input
        {...HANDICAP_INPUT}
        value={text}
        onChange={e => set(e.target.value, false)}
        onBlur={e => onCommit?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      <button
        type="button"
        onClick={() => set(plus ? trimmed.slice(1).trim() : `+${trimmed}`, true)}
        disabled={disabled}
        aria-pressed={plus}
        aria-label="Better than scratch"
        title="Plus handicap"
        className={`w-11 flex-shrink-0 rounded-lg text-base font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          plus
            ? 'bg-accent-deep text-white'
            : 'bg-surface border border-bark/12 text-ink/65 hover:border-bark/25'
        }`}
      >
        +
      </button>
    </div>
  )
}
