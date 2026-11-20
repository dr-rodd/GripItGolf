'use client'

import { useEffect, useMemo, useState } from 'react'
import { askAwards, type AwardAnswer } from '@/lib/accountClient'
import { clubEventDates, irishToday } from '@/lib/clubs'
import { FIELD, FIELD_LABEL, buttonClass, cardClass } from '@/app/components/ui'
import { STAGE_WORDS, WEIGHT_WORDS, type AwardRules, type StandingRow } from '@/lib/clubAward'
import { useShell } from '../ShellContext'
import { useSeason } from '../useSeason'
import { useCategories } from '../useCategories'
import AwardPanel from './AwardPanel'

type AwardView = NonNullable<AwardAnswer['awards']>[number]

/**
 * Golfer of the Year in the Clubhouse (stage 6; Ross, 17 Nov 2026, P14):
 * a year's awards — as many as the club runs — each with its table worked
 * out from the certified Results and the match play draws (never stored),
 * a row opening on every result that earned points and what it was worth.
 * **New award** and **Change** open the rules in a side panel: points by
 * finish, match play by stage, what counts, each competition's weight, best
 * N and who appears. The office's (`keep_calendar`).
 */
export default function Awards() {
  const { club, may } = useShell()
  const thisYear = Number(irishToday(new Date()).slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [awards, setAwards] = useState<AwardView[] | null>(null)
  const [ready, setReady] = useState(true)
  const [lost, setLost] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [standing, setStanding] = useState<StandingRow[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<AwardView | 'new' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const { events } = useSeason(club.id)
  const { categories, ageDate } = useCategories(club.id)

  useEffect(() => {
    let live = true
    setAwards(null); setLost('')
    void askAwards('list', { clubId: club.id, year }).then(r => {
      if (!live) return
      if (!r.ok) { setLost(r.error); return }
      setReady(r.ready !== false)
      setAwards(r.awards ?? [])
      setChosen(c => (r.awards ?? []).some(a => a.id === c) ? c : r.awards?.[0]?.id ?? null)
    })
    return () => { live = false }
  }, [club.id, year, attempt])

  useEffect(() => {
    if (!chosen) { setStanding(null); return }
    let live = true
    setStanding(null)
    void askAwards('standing', { clubId: club.id, year, id: chosen }).then(r => { if (live) setStanding(r.ok ? r.standing ?? [] : []) })
    return () => { live = false }
  }, [club.id, year, chosen, attempt])

  // The year's competitions, for each one's weight.
  const comps = useMemo(() => (events ?? [])
    .filter(e => e.competition && (e.startDate ?? '').startsWith(String(year)))
    .map(e => ({ code: e.code, name: e.name, date: e.startDate, matchPlay: !!e.competition?.matchPlay })), [events, year])

  if (!may('keep_calendar')) return <p className="text-ink/80 text-[15px]">Only someone with Clubhouse keeps the club’s awards.</p>

  const award = awards?.find(a => a.id === chosen) ?? null
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[12rem]">
          <h1 className="t-h1 text-ink">Golfer of the Year</h1>
          <p className="text-ink/80 text-[15px] mt-1">Points from every certified competition and match play — worked out fresh each time, so a change to the rules re-tells the table at once.</p>
        </div>
        <div>
          <label htmlFor="aw-year" className={FIELD_LABEL}>Year</label>
          <select id="aw-year" value={year} onChange={e => setYear(Number(e.target.value))} className={`${FIELD} ch-focus w-32`}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {ready && <button type="button" onClick={() => setEditing('new')} className={`${buttonClass('primary', false)} ch-focus`}>New award</button>}
      </div>

      {lost && <p className="t-cap text-ink/80 mt-5">{lost}</p>}
      {!ready && <p className="text-ink/80 text-[15px] mt-6">Golfer of the Year isn’t set up yet — it needs one more step on Green Dot’s side.</p>}
      {ready && awards === null && !lost && <div className="skeleton h-32 rounded-card mt-6" />}
      {ready && awards && awards.length === 0 && <p className="text-ink/80 text-[15px] mt-6">No award for {year} yet. Make one — the men’s, the ladies’, the seniors’ — each with its own rules.</p>}

      {ready && awards && awards.length > 0 && (
        <div className="mt-6 grid lg:grid-cols-[16rem_1fr] gap-5 max-w-5xl">
          <ul className="flex lg:flex-col gap-2 overflow-x-auto">
            {awards.map(a => (
              <li key={a.id}>
                <button type="button" onClick={() => { setChosen(a.id); setOpen(null) }} aria-current={a.id === chosen ? 'true' : undefined}
                  className={`ch-hover ch-focus w-full text-left rounded-tile px-3 py-2.5 t-label ${a.id === chosen ? 'bg-club-tint text-ink' : 'text-ink'}`}>
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
          {award && (
            <section>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="t-h2 text-ink break-words">{award.name}</h2>
                  <p className="t-cap text-ink/65 mt-1">{rulesLine(award.rules)}</p>
                </div>
                <button type="button" onClick={() => setEditing(award)} className={`${buttonClass('secondary', false)} ch-focus`}>Change</button>
              </div>
              {standing === null && <div className="skeleton h-40 rounded-card mt-4" />}
              {standing && standing.length === 0 && <p className="text-ink/80 text-[15px] mt-4">Nobody has points yet — they arrive as each competition is certified and each match play round is decided.</p>}
              {standing && standing.length > 0 && (
                <ol className={`${cardClass()} mt-4 divide-y divide-line`}>
                  {standing.map(r => (
                    <li key={r.rowId}>
                      <button type="button" onClick={() => setOpen(o => o === r.rowId ? null : r.rowId)} aria-expanded={open === r.rowId}
                        className="ch-hover ch-focus w-full flex items-baseline gap-3 px-4 py-2.5 text-left">
                        <span className={`w-8 tabular-nums ${r.place === 1 ? 'text-gold-deep font-semibold' : 'text-ink/65'}`}>{r.place}</span>
                        <span className="flex-1 min-w-0 tabular-nums text-[15px] text-ink truncate">{r.name}</span>
                        <span className="t-cap text-ink/65 whitespace-nowrap">{r.lines.filter(l => l.counts).length} counting</span>
                        <span className="tabular-nums text-[15px] text-ink w-14 text-right">{r.total}</span>
                      </button>
                      {open === r.rowId && (
                        <ul className="px-4 pb-3 space-y-1">
                          {r.lines.map(l => (
                            <li key={l.code} className={`flex items-baseline gap-3 t-cap ${l.counts ? 'text-ink/80' : 'text-ink/50 line-through'}`}>
                              <span className="flex-1 min-w-0 truncate">{l.name}{l.date ? ` · ${clubEventDates(l.date, l.date)}` : ''}</span>
                              <span className="whitespace-nowrap">{l.detail}{l.weight !== 1 ? ` · ×${l.weight}` : ''}</span>
                              <span className="w-12 text-right tabular-nums">{l.points}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      )}

      {editing && (
        <AwardPanel clubId={club.id} year={year} award={editing === 'new' ? null : editing} comps={comps}
          cats={categories ?? []} ageDate={ageDate}
          onClose={() => setEditing(null)}
          onSaved={id => { setEditing(null); if (id) setChosen(id); setAttempt(a => a + 1) }} />
      )}
    </>
  )
}

/** "Best 8 · stroke and match play · 25 for a win" — an award's rules said short. */
function rulesLine(r: AwardRules): string {
  const what = r.kinds.stroke && r.kinds.matchPlay ? 'Stroke and match play' : r.kinds.stroke ? 'Stroke competitions' : 'Match play'
  const majors = Object.values(r.weights).filter(w => w === 2).length
  return [what, `${r.points[0] ?? 0} for a win`, r.kinds.matchPlay ? `${r.stages.winner} for a match play ${STAGE_WORDS.winner.toLowerCase()}` : null,
    r.bestOf ? `Best ${r.bestOf}` : 'Every result counts', majors ? `${majors} ${majors === 1 ? 'Major' : 'Majors'} (${WEIGHT_WORDS[2].split(' · ')[0]})` : null]
    .filter(Boolean).join(' · ')
}
