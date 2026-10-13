import Link from 'next/link'

/**
 * "Privacy · Terms" — the quiet line every front door carries.
 *
 * Strava's API Policy (§7.3) wants the privacy policy reachable through
 * reasonably prominent links, and GDPR wants it findable before anybody
 * types their name in. So this sits at the foot of every way into an
 * event — the landing page, joining, creating, the golf doorway, a golf
 * trip's home and a run challenge's — and nowhere it would compete with a
 * score. One component, so the wording and the two addresses cannot drift
 * between screens.
 *
 * No 'use client': it is two links, and renders on either side.
 */
export default function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`t-cap text-ink/65 text-center ${className}`}>
      <Link href="/privacy" className="hover:text-ink/80 transition-colors">Privacy</Link>
      <span aria-hidden="true"> · </span>
      <Link href="/terms" className="hover:text-ink/80 transition-colors">Terms</Link>
    </p>
  )
}
