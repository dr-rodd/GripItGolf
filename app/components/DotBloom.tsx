/**
 * The one celebration (refresh plan, Phase 8; D11): when a card is signed and
 * when a run is logged, the emerald dot blooms — a solid disc swelling from
 * nothing — and settles into the quiet tinted disc with its tick that the
 * screen always showed. About 600ms on the putt curve, once per action, no
 * overshoot. Never in score entry, never on a board.
 *
 * **A named exception to the 400ms ceiling**, in the same shape as the site
 * intro's: its timing lives here, in the component's own `<style>`, where
 * the stylesheet's ceilings do not reach, and `test:branding` names this
 * file as the one place it may. The settled frame *is* the Reduce Motion
 * version — the static disc from before Phase 8 — so a reader who asked for
 * less motion sees exactly what everyone sees once the bloom has finished.
 *
 * Replays by remounting: give it a `key` that changes per action.
 */
export const DOT_BLOOM_MS = 600

export default function DotBloom({ size = 64, className = '' }: {
  /** The settled disc's diameter in px. */
  size?: number
  className?: string
}) {
  return (
    <span
      className={`dot-bloom relative inline-flex items-center justify-center rounded-full flex-shrink-0 ${className}`.trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Done"
    >
      <style>{`
        .dot-bloom { background-color: color-mix(in srgb, var(--color-accent) 20%, transparent); }
        .dot-bloom > .dot-bloom-tick { color: var(--color-accent-deep); }
        @media (prefers-reduced-motion: no-preference) {
          .dot-bloom { animation: gdDotBloom ${DOT_BLOOM_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both; }
          .dot-bloom > .dot-bloom-tick { animation: gdDotBloomTick ${DOT_BLOOM_MS}ms ease-out both; }
        }
        @keyframes gdDotBloom {
          0%   { transform: scale(0);    background-color: var(--color-accent); }
          55%  { transform: scale(1);    background-color: var(--color-accent); }
          100% { transform: scale(1);    background-color: color-mix(in srgb, var(--color-accent) 20%, transparent); }
        }
        @keyframes gdDotBloomTick {
          0%, 50% { opacity: 0; }
          100%    { opacity: 1; }
        }
      `}</style>
      <svg
        className="dot-bloom-tick"
        width={size * 0.45}
        height={size * 0.45}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}
