'use client'

import { useId, useState, type ReactNode } from 'react'
import { IconChevronDown } from './icons'

/**
 * A collapsible heading on the trip hub.
 *
 * The hub is a stack of these now, and later phases add more — course
 * summaries, stats. So this is one component with the open/closed state
 * handed in rather than held: **one section is open at a time**, and a rule
 * about all of them cannot live inside any one of them. `SectionStack` below
 * owns that.
 *
 * The heading is the whole row and the whole tap target. On a phone held one
 * handed, a chevron is something to miss.
 *
 * Motion: the panel grid-collapses over 300ms, ease-out — inside the guide's
 * 250–350ms band for something this size. `grid-template-rows: 0fr → 1fr` is
 * what makes a height animation possible without measuring the content, and
 * it degrades to an instant open under `prefers-reduced-motion`, which
 * `app/globals.css` switches off centrally.
 *
 * The panel stays mounted when closed so its content is in the HTML — the
 * players list and the itinerary are worth having in the page for a reader
 * who never taps anything.
 */
export function Section({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string
  /** A count or a total, right-aligned in the heading. Optional. */
  meta?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const panelId = useId()

  return (
    <section className="border-t border-bark/12">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full flex items-center gap-3 py-4 text-left transition-colors duration-150 hover:text-ink"
        >
          <span className="t-h2 text-ink flex-1 min-w-0">{title}</span>
          {meta && <span className="t-cap text-ink/50 tabular-nums flex-shrink-0">{meta}</span>}
          <span
            className={`flex-shrink-0 text-ink/50 transition-transform duration-300 ease-out ${
              open ? 'rotate-180' : ''
            }`}
          >
            <IconChevronDown size={18} />
          </span>
        </button>
      </h2>

      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        {/* The inner wrapper is what the 0fr row actually crushes; overflow
            has to be hidden here rather than on the grid, or the content
            spills out of a row with no height. */}
        <div className="overflow-hidden">
          <div className={`pb-6 transition-opacity duration-300 ease-out ${open ? 'opacity-100' : 'opacity-0'}`}>
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}

/** One heading's worth of the stack. `content` is rendered on the server. */
export type SectionSpec = {
  key: string
  title: string
  meta?: ReactNode
  content: ReactNode
}

/**
 * The stack, and the rule that only one of them is open.
 *
 * Opening a section closes whichever was open, so the page never grows past
 * a screenful of headings with everything unfurled underneath. Tapping the
 * open one closes it and leaves them all shut, which is a legitimate state —
 * somebody who wants the buttons and nothing else should be able to have
 * that.
 *
 * `initial` is the section open on arrival. The hub opens the itinerary,
 * because on the morning of the second day that is the question.
 *
 * The panels' content is built on the server and passed through — this owns
 * which one is showing and nothing about what is in them.
 */
export function SectionStack({
  sections,
  initial,
}: {
  sections: SectionSpec[]
  initial?: string
}) {
  const [openKey, setOpenKey] = useState<string | null>(initial ?? null)

  return (
    <div className="flex flex-col">
      {sections.map(s => (
        <Section
          key={s.key}
          title={s.title}
          meta={s.meta}
          open={openKey === s.key}
          onToggle={() => setOpenKey(k => (k === s.key ? null : s.key))}
        >
          {s.content}
        </Section>
      ))}
    </div>
  )
}
