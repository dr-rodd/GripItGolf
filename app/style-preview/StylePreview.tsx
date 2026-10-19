'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import TripHeader from '@/app/components/TripHeader'
import { Button, ButtonLink } from '@/app/components/ui'
import {
  AXES, applySetup, labCount, parseSetup, rememberSetup, resetSetup, type Setup,
} from '@/lib/styleLab'

/**
 * Read through useSyncExternalStore rather than searchParams on the server,
 * so the route stays static (the same reasoning as JoinForm). The server
 * renders with no link and the browser fills it in on hydration.
 */
const subscribe = () => () => {}
const readFromUrl = () => new URLSearchParams(window.location.search).get('s') ?? ''
/** Null on the server, where there is no URL yet; '' in a browser without ?s=. */
const readOnServer = (): string | null => null

/** What the link changes, in words: "Title font Gabarito, Corners Sharp". */
function describe(setup: Setup): string {
  return AXES
    .filter(a => setup[a.key] !== a.house)
    .map(a => `${a.label} ${a.options.find(o => o.id === setup[a.key])?.name ?? ''}`)
    .join(', ')
}

export default function StylePreview() {
  const url = useSyncExternalStore<string | null>(subscribe, readFromUrl, readOnServer)
  const raw = url ?? ''
  const [done, setDone] = useState<'applied' | 'kept' | null>(null)
  const isReset = raw.trim() === 'reset'
  const setup = parseSetup(raw)
  const changes = labCount(setup)

  const line = isReset
    ? 'This link puts this phone back to the house style.'
    : changes === 0
      ? 'This link changes nothing — it is the house style.'
      : `This link changes how green dot. looks on this phone only: ${describe(setup)}.`

  return (
    <main className="min-h-dvh paper text-ink">
      <TripHeader backTo="/" />
      <div className="max-w-lg mx-auto px-4 pt-6 pb-10 flex flex-col gap-6">
        <h1 className="t-h1">Style preview</h1>
        <p className="t-body text-ink/80">
          {url === null ? 'Opening the link…' : raw ? line : 'This link has no look in it.'}
        </p>

        {done ? (
          <div className="flex flex-col gap-3">
            <p className="t-body text-ink/80">
              {done === 'applied' ? 'Done. Every screen on this phone now wears it.' : 'Nothing changed.'}
            </p>
            <ButtonLink href="/">Go to the home page</ButtonLink>
          </div>
        ) : raw && (isReset || changes > 0) ? (
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => {
                if (isReset) resetSetup()
                else { applySetup(setup); rememberSetup(setup) }
                setDone('applied')
              }}
            >
              {isReset ? 'Reset to the house style' : 'Preview on this phone'}
            </Button>
            <Button variant="secondary" onClick={() => setDone('kept')}>
              Keep the house style
            </Button>
          </div>
        ) : url !== null ? (
          <Link href="/" className="t-label text-accent-deep">Go to the home page</Link>
        ) : null}
      </div>
    </main>
  )
}
