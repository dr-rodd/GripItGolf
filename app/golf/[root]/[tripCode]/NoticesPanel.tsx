'use client'

import { useEffect, useState } from 'react'
import { cardClass } from '@/app/components/ui'

/**
 * The organiser's notices, as the Event Hub shows them.
 *
 * Read-only here — posting and removing live behind the organiser PIN at
 * `/trip/[code]/organiser`, reached through the Settings tab. Newest first,
 * because "carts on the path today" matters more than last week's welcome.
 *
 * A home screen module (lib/eventHub.ts `activeHubModules`): the hub only
 * draws it while a notice is up, so there is no empty state here. "Nothing
 * from the organiser yet" under a heading was a section a reader had to
 * open to find empty — and the organiser's door that lived at its foot is
 * on the Settings tab now, where it is there whether or not anything is.
 *
 * A client component for one reason: the timestamps. `created_at` is a
 * moment in time and the server does not know the reader's clock, so the
 * caption is rendered only after mount — the same trick the itinerary plays
 * with `useMinute` — rather than hydrating a UTC time and correcting it in
 * front of the reader.
 */

export type Notice = { id: string; body: string; created_at: string }

function describePosted(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-IE', { hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time}`
}

export default function NoticesPanel({ notices }: { notices: Notice[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <ul className="flex flex-col gap-2">
      {notices.map(n => (
        <li key={n.id} className={`px-4 py-3 ${cardClass()}`}>
          {/* The body keeps its line breaks — a notice is written as it
              should read, and folding it into one paragraph would undo
              the organiser's own formatting. */}
          <p className="text-ink text-sm leading-relaxed whitespace-pre-line">{n.body}</p>
          {mounted && (
            <p className="t-cap text-ink/50 mt-1.5">{describePosted(n.created_at)}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
