'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * The organiser's notices, as the Event Hub shows them.
 *
 * Read-only here — posting and removing live behind the organiser PIN at
 * `/trip/[code]/organiser`, and the quiet link at the bottom is the one way
 * in from this screen. Newest first, because "carts on the path today"
 * matters more than last week's welcome.
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

export default function NoticesPanel({
  notices, tripCode,
}: {
  notices: Notice[]
  tripCode: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div>
      {notices.length === 0 ? (
        <p className="t-cap text-ink/65 text-center py-2">
          Nothing from the organiser yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notices.map(n => (
            <li key={n.id} className="bg-surface border border-bark/12 rounded-xl px-4 py-3">
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
      )}

      {/* The door to the admin side. Everyone can see it; the PIN decides
          who gets through — the same soft lock Trip Setup wears. */}
      <Link
        href={`/trip/${tripCode}/organiser`}
        className="block text-center mt-5 t-cap uppercase tracking-[0.18em] text-accent-deep hover:text-accent transition-colors"
      >
        Organiser area
      </Link>
    </div>
  )
}
