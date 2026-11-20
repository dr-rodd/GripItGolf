'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { FIELD, FIELD_LABEL, Segmented, cardClass } from '@/app/components/ui'
import { clubEventDates } from '@/lib/clubs'
import type { ClubMatchRow } from './MyMatch'

type Shown = 'all' | 'open' | 'played'

/**
 * A club match play's draw as a list, with the filters a big field needs
 * (Ross, 18 Nov 2026): a round, matches still to play or played, and a
 * player's name. Every club member sees every match play this way. A match
 * with both sides known opens its own page.
 */
export default function DrawView({ rows, rounds, matchHref, today, startRound = null }: {
  rows: ClubMatchRow[]
  rounds: { roundNumber: number; roundName: string; deadline: string | null; played: number; total: number }[]
  matchHref: string
  today: string
  /** The round to open on — the one in play, on Matches; every round, on Draw. */
  startRound?: number | null
}) {
  const [round, setRound] = useState<number | null>(startRound)
  const [shown, setShown] = useState<Shown>('all')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const kept = useMemo(() => rows.filter(m =>
    (round === null || m.roundNumber === round)
    && (shown === 'all' || (shown === 'played') === !!m.winner)
    && (!needle || m.aName.toLowerCase().includes(needle) || m.bName.toLowerCase().includes(needle))), [rows, round, shown, needle])
  const showing = rounds.filter(r => kept.some(m => m.roundNumber === r.roundNumber))

  return (
    <>
      <div className="mt-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="dv-round" className={FIELD_LABEL}>Round</label>
            <select id="dv-round" value={round ?? ''} onChange={e => setRound(e.target.value ? Number(e.target.value) : null)} className={FIELD}>
              <option value="">Every round</option>
              {rounds.map(r => <option key={r.roundNumber} value={r.roundNumber}>{r.roundName}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="dv-q" className={FIELD_LABEL}>Find a player</label>
            <input id="dv-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="A name" className={FIELD} />
          </div>
        </div>
        <Segmented label="Which matches" value={shown} onChange={setShown}
          options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'To play' }, { value: 'played', label: 'Played' }] as const} />
      </div>

      {showing.length === 0 && <p className="text-ink/80 text-[15px] mt-6">No matches like that.</p>}
      {showing.map(r => (
        <section key={r.roundNumber} className="mt-6">
          <h2 className="t-h2 text-ink">{r.roundName}</h2>
          <p className="t-cap text-ink/65 mt-1">
            {[r.deadline ? `${r.deadline < today && r.played < r.total ? 'Was due' : 'Play by'} ${clubEventDates(r.deadline, r.deadline)}` : null, `${r.played} of ${r.total} played`].filter(Boolean).join(' · ')}
          </p>
          <ul className={`${cardClass()} mt-3 divide-y divide-line`}>
            {kept.filter(m => m.roundNumber === r.roundNumber).map(m => {
              const body = (
                <span className="flex items-baseline gap-2 px-4 py-3">
                  <span className="flex-1 min-w-0 text-[15px] text-ink">
                    <span className={`t-data ${m.winner && m.winner === m.sideA ? 'font-semibold' : ''}`}>{m.aName}</span>
                    <span className="text-ink/65"> v </span>
                    <span className={`t-data ${m.winner && m.winner === m.sideB ? 'font-semibold' : ''}`}>{m.bName}</span>
                  </span>
                  {m.result && <span className="t-cap text-ink/80 whitespace-nowrap">{m.result}</span>}
                </span>
              )
              return <li key={m.id}>{m.sideA && m.sideB ? <Link href={`${matchHref}/${m.id}`} className="block press">{body}</Link> : body}</li>
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
