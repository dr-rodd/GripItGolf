import { FIELD, FIELD_LABEL } from '@/app/components/ui'
'use client'

/**
 * A date input that stays inside its container.
 *
 * Native date inputs are awkward to size. Two things push them past the edge
 * of the page:
 *
 *   1. iOS Safari gives `input[type=date]` a wide intrinsic width from the
 *      native control, which `width: 100%` alone does not override. Turning
 *      off the webkit appearance stops it claiming that width.
 *   2. Grid and flex children default to `min-width: auto`, so they refuse to
 *      shrink below their content. Without `min-width: 0` on both the input
 *      and its wrapper, a two-column row of dates overflows to the right.
 *
 * Both fixes live here so every date field on the site behaves the same.
 */
export default function DateField({
  label, value, onChange, disabled, className = '', min, max,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  /** The earliest and latest days the picker offers, YYYY-MM-DD. */
  min?: string
  max?: string
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label className={FIELD_LABEL}>
          {label}
        </label>
      )}
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        min={min}
        max={max}
        className={`${FIELD} min-w-0 max-w-full`}
        style={{
          // Without this the picker's text renders in the system colour,
          // which is invisible against a dark background on iOS
          colorScheme: 'dark',
          // Stops iOS sizing the field to the native control's preference
          WebkitAppearance: 'none',
          appearance: 'none',
          minWidth: 0,
          maxWidth: '100%',
        }}
      />
    </div>
  )
}
