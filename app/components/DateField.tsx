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
  label, value, onChange, disabled, className = '',
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label className="block text-ink/80 text-[13px] uppercase tracking-wider mb-2">
          {label}
        </label>
      )}
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={[
          'block w-full min-w-0 max-w-full',
          'bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
          'text-ink text-sm',
          'focus:outline-none focus:border-accent/50 transition-colors',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        ].join(' ')}
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
