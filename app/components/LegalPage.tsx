import type { ReactNode } from 'react'
import TripHeader from './TripHeader'

/**
 * The frame the privacy notice and the terms share: the mark, a title, the
 * date it last changed, and readable prose — plain sentences in short
 * sections, at a width a phone reads comfortably. Static, like /create:
 * nothing here touches a database.
 */

export function LegalPage({ title, updated, children }: {
  title: string
  /** When the wording last changed, as it should read: "13 October 2026". */
  updated: string
  children: ReactNode
}) {
  return (
    <main className="min-h-dvh bg-cream">
      <TripHeader backTo="/" />
      <article className="max-w-lg mx-auto px-4 pt-8 pb-20 page-enter">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink leading-tight">{title}</h1>
        <p className="text-ink/65 text-[13px] mt-1.5">Last updated {updated}</p>
        <div className="mt-6 space-y-6">{children}</div>
      </article>
    </main>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-[family-name:var(--font-display)] text-xl text-ink mb-2">{title}</h2>
      <div className="space-y-3 text-ink/80 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

export const LEGAL_LINK = 'text-accent-deep underline underline-offset-2 hover:text-accent transition-colors'
