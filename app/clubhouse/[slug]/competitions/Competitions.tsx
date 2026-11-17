'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@/app/components/icons'
import CourseName from '@/app/components/CourseName'
import { splitCourseName } from '@/lib/courseDirectory'
import { FIELD, FIELD_LABEL, Pill, Segmented, buttonClass, cardClass } from '@/app/components/ui'
import { copyCompetition } from '../../clubhouseClient'
import { MAX_COPIES, formatLine, seasonOfYear, seasonYears, weeklyFrom, type SeasonEvent } from '@/lib/clubhouse'
import { clubEventDates, irishToday } from '@/lib/clubs'
import { PHASE_WORDS } from '@/lib/compPhase'
import { useShell } from '../ShellContext'
import { useSeason } from '../useSeason'

/**
 * Competitions (stage (k2), D214, D215): the season's competitions as a
 * table — the day, the course, the format, how many are booked of how many
 * places, where each stands — a year at a time. An Officer copies one to
 * another date or repeats it weekly; each copy is made exactly as New
 * competition makes one. New competition and Manage stay in the members app
 * for Officers, on the phone (D214). On a phone the table is a list.
 */
export default function Competitions() {
  const { face, club, may } = useShell()
  const { events, lost, again } = useSeason(club.id)
  const thisYear = Number(irishToday(new Date()).slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [copying, setCopying] = useState<SeasonEvent | null>(null)
  const officer = may('run_events')

  const comps = useMemo(() => seasonOfYear((events ?? []).filter(e => e.competition), year), [events, year])
  const years = useMemo(() => seasonYears((events ?? []).filter(e => e.competition), thisYear), [events, thisYear])

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="t-h1 text-ink">Competitions</h1>
          <p className="t-cap text-ink/65 mt-1">
            {officer ? <>New competition and Manage are in <Link href={`/club/${face.slug}?tab=comps`} className="underline underline-offset-2 text-ink">the members app</Link>.</> : 'The club’s Officers make and copy competitions.'}
          </p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Season" className={`${FIELD} ch-focus max-w-[160px]`}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      {!events && !lost && <div className="mt-6 space-y-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-12 rounded-tile" />)}</div>}
      {events && comps.length === 0 && (
        <div className={`${cardClass()} p-6 mt-6 max-w-xl`}>
          <p className="t-card text-ink">No competitions in {year}</p>
          <p className="text-ink/80 text-[15px] mt-2">
            {officer ? 'Make the first one in the members app, then copy it across the season from here.' : 'They show here once the club’s Officers make them.'}
          </p>
        </div>
      )}

      {comps.length > 0 && (
        <>
          <div className={`${cardClass()} mt-6 overflow-x-auto hidden md:block`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line">
                  {['Day', 'Competition', 'Course', 'Format', 'Booked', 'Where it stands'].map(h => (
                    <th key={h} scope="col" className={`t-eyebrow text-ink/65 font-normal px-4 py-3 whitespace-nowrap ${h === 'Booked' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                  <th scope="col" className="px-4"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {comps.map(e => {
                  const c = e.competition!
                  return (
                    <tr key={e.code} className="ch-hover border-b border-line last:border-b-0 h-12">
                      <td className="px-4 text-ink/80 text-[15px] whitespace-nowrap tabular-nums">{clubEventDates(e.startDate, e.endDate)}</td>
                      <td className="px-4 text-ink text-[15px] font-medium">{e.name}</td>
                      <td className="px-4 text-ink/80 text-[15px]">{c.courseName ? <CourseName name={c.courseName} /> : '—'}</td>
                      <td className="px-4 text-ink/80 text-[15px] whitespace-nowrap">{formatLine(c)}</td>
                      <td className="px-4 text-ink/80 text-[15px] text-right tabular-nums whitespace-nowrap">{c.capacity ? `${c.booked} of ${c.capacity}` : c.booked}</td>
                      <td className="px-4 whitespace-nowrap"><Pill live={c.phase === 'in_play'}>{PHASE_WORDS[c.phase]}</Pill></td>
                      <td className="px-4 text-right whitespace-nowrap">
                        <Link href={`/club/${face.slug}/comp/${e.code}`} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9 inline-flex items-center">Open</Link>
                        {officer && (
                          <button type="button" onClick={() => setCopying(e)} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Copy</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ul className={`${cardClass()} mt-6 divide-y divide-line md:hidden overflow-hidden`}>
            {comps.map(e => (
              <li key={e.code}>
                <Link href={`/club/${face.slug}/comp/${e.code}`} className="flex items-center gap-3 min-h-14 px-4 py-3 press">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[17px] font-medium text-ink leading-snug">{e.name}</span>
                    <span className="block t-cap text-ink/65 mt-0.5">{[clubEventDates(e.startDate, e.endDate), e.competition!.courseName ? splitCourseName(e.competition!.courseName).club : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Pill live={e.competition!.phase === 'in_play'}>{PHASE_WORDS[e.competition!.phase]}</Pill>
                </Link>
              </li>
            ))}
          </ul>
          {officer && <p className="md:hidden t-cap text-ink/65 mt-3">Open this on a computer to copy a competition or repeat it weekly.</p>}
        </>
      )}

      {copying && <CopyPanel clubId={club.id} slug={face.slug} event={copying} onClose={() => setCopying(null)} onMade={again} />}
    </>
  )
}

/** Copy to another date, or Repeat weekly (D214) — the dates shown before anything is made. */
function CopyPanel({ clubId, slug, event, onClose, onMade }: {
  clubId: string; slug: string; event: SeasonEvent; onClose: () => void; onMade: () => void
}) {
  const [mode, setMode] = useState<'once' | 'weekly'>('once')
  const [date, setDate] = useState('')
  const [count, setCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ made: { code: string; date: string }[]; refused: { date: string; why: string }[] } | null>(null)
  const dates = useMemo(() => (date ? (mode === 'once' ? [date] : weeklyFrom(date, count)) : []), [date, mode, count])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function make() {
    setBusy(true); setError('')
    const r = await copyCompetition(clubId, event.code, dates)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setResult(r)
    if (r.made.length) onMade()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="copy-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <div className="ch-panel relative w-full md:w-[400px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="copy-title" className="t-h2 text-ink break-words">Copy {event.name}</h2>
            <p className="t-cap text-ink/65 mt-1">The same course, format, tee times and booking, on another day.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>

        {result ? (
          <div className="mt-6 space-y-3">
            {result.made.length > 0 && (
              <>
                <p className="t-label text-ink">{result.made.length} made</p>
                <ul className="space-y-1">
                  {result.made.map(m => (
                    <li key={m.code}><Link href={`/club/${slug}/comp/${m.code}`} className="text-ink text-[15px] underline underline-offset-2">{clubEventDates(m.date, m.date)}</Link></li>
                  ))}
                </ul>
              </>
            )}
            {result.refused.length > 0 && (
              <ul className="space-y-1">
                {result.refused.map(r => <li key={r.date} className="t-cap text-rust-deep">{clubEventDates(r.date, r.date)}: {r.why}</li>)}
              </ul>
            )}
            <button type="button" onClick={onClose} className={`${buttonClass('secondary', false)} ch-focus`}>Done</button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <Segmented label="How often" value={mode} onChange={setMode}
              options={[{ value: 'once', label: 'Another date' }, { value: 'weekly', label: 'Repeat weekly' }] as const} />
            <div>
              <label htmlFor="copy-date" className={FIELD_LABEL}>{mode === 'once' ? 'The day' : 'The first day'}</label>
              <input id="copy-date" type="date" value={date} min={irishToday(new Date())} onChange={e => setDate(e.target.value)} className={`${FIELD} ch-focus`} />
            </div>
            {mode === 'weekly' && (
              <div>
                <label htmlFor="copy-count" className={FIELD_LABEL}>How many weeks</label>
                <input id="copy-count" type="number" min={2} max={MAX_COPIES} value={count}
                  onChange={e => setCount(Math.max(2, Math.min(MAX_COPIES, Math.floor(Number(e.target.value) || 2))))} className={`${FIELD} ch-focus`} />
              </div>
            )}
            {dates.length > 1 && (
              <p className="t-cap text-ink/80">{dates.map(d => clubEventDates(d, d)).join(' · ')}</p>
            )}
            {error && <p role="alert" className="t-cap text-rust-deep">{error}</p>}
            <button type="button" disabled={busy || dates.length === 0} onClick={() => void make()} className={`${buttonClass('primary', false)} ch-focus`}>
              {busy ? 'Making…' : dates.length > 1 ? `Make ${dates.length} competitions` : 'Make the copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
