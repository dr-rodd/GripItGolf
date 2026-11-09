'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FIELD, cardClass } from '@/app/components/ui'

/**
 * Which tee each player in a session match plays off — the shots come off
 * it. Set on the match (`session_matches.tees`); untouched, each plays the
 * tee the round recorded, else the middle of their own (lib/sessions.ts
 * `defaultTeeIndex`). Folded away under one line.
 */
export default function SessionTees({ tripId, matchId, players, tees, choices }: {
  tripId: string
  matchId: string
  players: { id: string; name: string }[]
  tees: Record<string, string>
  choices: Record<string, { id: string; name: string }[]>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (pid: string) => choices[pid]?.find(t => t.id === tees[pid])?.name ?? '—'
  const set = async (pid: string, teeId: string) => {
    setError(null)
    const { error: err } = await supabase.from('session_matches')
      .update({ tees: { ...tees, [pid]: teeId }, updated_at: new Date().toISOString() })
      .eq('id', matchId).eq('trip_id', tripId)
    if (err) setError('Could not change the tee — try again')
    else router.refresh()
  }
  return (
    <div className={`mb-3 px-3 py-2 ${cardClass('flat')}`}>
      <button type="button" className="w-full text-left t-cap text-ink/65" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        Tees: {players.map(p => `${p.name.split(' ')[0]} ${nameOf(p.id)}`).join(' · ')} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {players.map(p => (
            <label key={p.id} className="flex items-center justify-between gap-3">
              <span className="t-label text-ink">{p.name}</span>
              <select className={`${FIELD} max-w-[55%]`} value={tees[p.id] ?? ''} onChange={e => set(p.id, e.target.value)}>
                {(choices[p.id] ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          ))}
          {error && <p className="t-cap text-rust-deep">{error}</p>}
        </div>
      )}
    </div>
  )
}
