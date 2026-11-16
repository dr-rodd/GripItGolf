'use client'

import { useEffect, useRef, useState } from 'react'
import { FIELD, cardClass } from '@/app/components/ui'
import { competitionNames, type MarkerAsk } from '@/lib/entryClient'

/**
 * Who marks each card (stage (d3)) — a club competition's card, before it is
 * signed. A card is final only with the player's own approval and a
 * marker's signature, never the same account: the group's other players are
 * offered first, each starting on the next one round the card, and anybody
 * on the club's list with an account can be searched for. Whoever is chosen
 * signs from their Cards to sign — or, when it is this phone's own account,
 * by signing here.
 */
export default function MarkerPicker({ code, players, markers, onChange }: {
  code: string
  players: { id: string; name: string }[]
  markers: Record<string, MarkerAsk>
  onChange: (m: Record<string, MarkerAsk>) => void
}) {
  const [searching, setSearching] = useState<string | null>(null)

  // The next player round the card marks each one, to start with.
  const ids = players.map(p => p.id).join(',')
  useEffect(() => {
    if (players.length < 2) return
    const next = { ...markers }
    let changed = false
    players.forEach((p, i) => {
      if (!next[p.id]) { next[p.id] = { playerId: players[(i + 1) % players.length].id }; changed = true }
    })
    if (changed) onChange(next)
    // Seeded once per card; a choice made afterwards is left alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  const nameOf = (m: MarkerAsk | undefined) =>
    !m ? null : 'memberId' in m ? m.name : players.find(p => p.id === m.playerId)?.name ?? null

  return (
    <section className={`${cardClass()} p-4 space-y-3`}>
      <div>
        <h2 className="t-card text-ink">Who marks each card?</h2>
        <p className="t-cap text-ink/65 mt-1">
          Each card is final once its player approves it on their own account and its marker signs it.
        </p>
      </div>
      <ul className="space-y-3">
        {players.map(p => {
          const m = markers[p.id]
          const value = !m ? '' : 'playerId' in m ? `p:${m.playerId}` : `m:${m.memberId}`
          return (
            <li key={p.id}>
              <label className="block">
                <span className="t-label text-ink">{p.name}</span>
                <select
                  value={searching === p.id ? 'search' : value}
                  onChange={e => {
                    const v = e.target.value
                    if (v === 'search') { setSearching(p.id); return }
                    setSearching(null)
                    if (v.startsWith('p:')) onChange({ ...markers, [p.id]: { playerId: v.slice(2) } })
                  }}
                  className={`${FIELD} mt-1`}
                  aria-label={`Who marks ${p.name}’s card`}
                >
                  {!m && <option value="">Choose a marker</option>}
                  {players.filter(o => o.id !== p.id).map(o => <option key={o.id} value={`p:${o.id}`}>Marked by {o.name}</option>)}
                  {m && 'memberId' in m && <option value={value}>Marked by {m.name}</option>}
                  <option value="search">Somebody else on the club’s list…</option>
                </select>
              </label>
              {searching === p.id && (
                <ListSearch code={code} exclude={nameOf(m)}
                  onPick={(id, name) => { onChange({ ...markers, [p.id]: { memberId: id, name } }); setSearching(null) }} />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ListSearch({ code, onPick }: { code: string; exclude: string | null; onPick: (id: string, name: string) => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ id: string; name: string; linked: boolean }[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setFound([]); return }
    timer.current = setTimeout(() => { competitionNames(code, q).then(setFound) }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, code])
  return (
    <div className="mt-2">
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the club’s list"
        aria-label="Search the club’s list for a marker" className={FIELD} />
      {found.length > 0 && (
        <ul className="mt-2 space-y-1">
          {found.map(f => (
            <li key={f.id}>
              <button type="button" disabled={!f.linked} onClick={() => onPick(f.id, f.name)}
                className="w-full text-left px-3 py-2 rounded-tile hover:bg-tint press disabled:text-ink/40">
                {f.name}{!f.linked ? ' · needs a Green Dot account' : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
