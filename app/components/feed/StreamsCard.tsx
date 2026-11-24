'use client'

import { useEffect, useState } from 'react'
import { askFeed } from '@/lib/feedClient'
import { IconCheck } from '../icons'
import { cardClass } from '../ui'
import StreamName from './StreamName'

type StreamView = { key: string; kind: 'friends' | 'club' | 'comp' | 'match'; label: string; empty: string; about?: string }
type Home = { ready: boolean; junior?: boolean; streams?: StreamView[]; offered?: StreamView[] }

/**
 * Your streams (D300, moved to the gear's page by D319): a tick for each
 * stream the member could keep, saved on each tick and kept on the account,
 * so every phone signed in to it agrees. At least one stays on. Nothing at
 * all before migration 102, or for a junior.
 */
export default function StreamsCard({ club = null, className = '' }: { club?: string | null; className?: string }) {
  const [home, setHome] = useState<Home | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    void askFeed<Home>('home', club ? { club } : {}).then(r => { if (live && r.ok) setHome(r) })
    return () => { live = false }
  }, [club])

  if (!home || !home.ready || home.junior) return null
  const kept = new Set((home.streams ?? []).map(s => s.key))
  const offered = home.offered ?? []

  async function flip(key: string) {
    const on = kept.has(key)
    if (on && kept.size <= 1) { setError('Keep at least one stream.'); return }
    // The member's order is kept; one turned on joins where it is offered.
    const next = offered.map(s => s.key).filter(k => (k === key ? !on : kept.has(k)))
    setBusy(true); setError('')
    const r = await askFeed<{ streams: string[] }>('streams', { streams: next })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setHome(h => h && ({ ...h, streams: offered.filter(s => r.streams.includes(s.key)) }))
  }

  return (
    <div className={`${cardClass()} px-4 py-4 ${className}`}>
      <p className="t-label text-ink">Show these streams</p>
      <p className="t-cap text-ink/65">On the Stream tab. A club’s stream shows only in its own area.</p>
      <ul className="mt-2">
        {offered.map(s => {
          const on = kept.has(s.key)
          return (
            <li key={s.key}>
              <button type="button" role="checkbox" aria-checked={on} disabled={busy} onClick={() => void flip(s.key)}
                className="w-full flex items-center gap-3 min-h-12 text-left press">
                <span className="flex-1 min-w-0">
                  <span className="block text-ink text-[15px]"><StreamName kind={s.kind} />{s.kind === 'club' && s.label ? <span className="text-ink/65"> · {s.label}</span> : null}</span>
                  {s.about && <span className="block t-cap text-ink/65">{s.about}</span>}
                </span>
                <span aria-hidden="true" className={`inline-flex items-center justify-center w-6 h-6 rounded-[6px] border flex-shrink-0 ${on ? 'bg-accent-deep border-accent-deep text-white' : 'bg-surface border-line-strong'}`}>
                  {on && <IconCheck size={16} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
    </div>
  )
}
