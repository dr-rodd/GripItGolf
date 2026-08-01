import { donationUrl } from '@/lib/donation'

/**
 * A quiet invitation to chip in, for the bottom of a page.
 *
 * Deliberately the least urgent thing on screen: no modal, no banner, no
 * interruption. It sits below everything else, and someone playing a round
 * will scroll past it without noticing. That is the point — the app has to
 * work the same for somebody who never taps it.
 *
 * Renders nothing at all when NEXT_PUBLIC_DONATION_URL is unset, so removing
 * the variable removes the feature with no leftover gap.
 *
 * A server component: the address is read at build time and there is no state
 * here, so nothing needs shipping to the browser but the markup.
 */
export default function SupportLink({ className = '' }: { className?: string }) {
  const href = donationUrl()
  if (!href) return null

  return (
    <div className={`text-center ${className}`.trim()}>
      <p className="t-body text-ink/65 max-w-[19rem] mx-auto mb-3">
        Enjoy the app? Support like minded golfers grow the game.
      </p>
      <a
        href={href}
        target="_blank"
        // noopener stops the payment page reaching back into this one;
        // noreferrer keeps our URL out of its logs.
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-bark/12 bg-surface text-ink/80 text-[13px] tracking-[0.18em] uppercase hover:text-ink hover:border-accent/40 hover:bg-accent/[0.06] transition-colors"
      >
        Let&apos;s get those green dots
        <span aria-hidden="true">🟢</span>
      </a>
    </div>
  )
}
