'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@/app/components/icons'
import CourseName from '@/app/components/CourseName'
import { splitCourseName } from '@/lib/courseDirectory'
import { FIELD, FIELD_LABEL, Pill, Segmented, buttonClass, cardClass } from '@/app/components/ui'
import { copyCompetition } from '../../clubhouseClient'
import { MAX_COPIES, eventHref, formatLine, isOfficeOnly, opensOutside, seasonOfYear, seasonType, seasonYears, weeklyFrom, type SeasonEvent } from '@/lib/clubhouse'
import { EVENT_TYPES, noteTimeLine, typeLabel, type ClubNote, type EventType } from '@/lib/clubEvents'
import { clubEventDates, irishToday } from '@/lib/clubs'
import { PHASE_WORDS } from '@/lib/compPhase'
import { useShell } from '../ShellContext'
import { useSeason } from '../useSeason'
import EventPanel from './EventPanel'
import CompPanel from './CompPanel'
import PresetPanel from './PresetPanel'
import { useCategories } from '../useCategories'
import { askClub } from '@/lib/accountClient'
import { planLine, type Preset } from '@/lib/clubPresets'

type Shown = 'all' | 'members' | 'office'

/**
 * Events (stage c1, M1; was Competitions, stage (k2)): every event under
 * the club a year at a time — competitions with their course, format, who
 * can enter, how many are booked and where each stands; the club's own
 * events (Golf, Social, Club business, Other sport, Course, Miscellaneous)
 * with where and when — filtered by type and by who sees it. The office
 * makes and changes the club's own events in a side panel here, and copies
 * a competition to another date or repeats it weekly. On a phone the table
 * is a list, and everything else is the same panels, full screen.
 */
export default function Events() {
  const { face, club, may } = useShell()
  const { events, lost, again, notesReady } = useSeason(club.id)
  const thisYear = Number(irishToday(new Date()).slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [type, setType] = useState<EventType | 'all'>('all')
  const [shown, setShown] = useState<Shown>('all')
  const [copying, setCopying] = useState<SeasonEvent | null>(null)
  const [editing, setEditing] = useState<ClubNote | 'new' | null>(null)
  // Stage c1, M7, M10–M11: competitions made and changed here, from presets.
  const [comp, setComp] = useState<string | 'new' | null>(null)
  const [presetOpen, setPresetOpen] = useState<Preset | 'new' | null>(null)
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [presetsReady, setPresetsReady] = useState(false)
  const { categories, ageDate } = useCategories(club.id)
  const office = may('keep_calendar')
  useEffect(() => {
    let live = true
    void askClub('presets', { clubId: club.id }).then(r => { if (live && r.ok) { setPresets(r.presets ?? []); setPresetsReady(!!r.presetsReady) } })
    return () => { live = false }
  }, [club.id])

  const rows = useMemo(() => seasonOfYear(events ?? [], year)
    .filter(e => type === 'all' || seasonType(e) === type)
    .filter(e => shown === 'all' || (shown === 'office') === isOfficeOnly(e)), [events, year, type, shown])
  const years = useMemo(() => seasonYears(events ?? [], thisYear), [events, thisYear])
  const typesHere = useMemo(() => EVENT_TYPES.filter(t => (events ?? []).some(e => seasonType(e) === t.code)), [events])
  // The event's name opens it: a club event's panel (the office's), anything else where it lives.
  const open = (e: SeasonEvent) => {
    const cls = 'ch-hover ch-focus rounded-tile -mx-1 px-1 py-0.5 text-left text-ink text-[15px] font-medium'
    if (e.note) return office ? <button type="button" onClick={() => setEditing(e.note!)} className={cls}>{e.name}</button> : <span className="text-ink text-[15px] font-medium">{e.name}</span>
    return <Link href={eventHref(e, face.slug)!} {...(opensOutside(e) ? { target: '_blank', rel: 'noopener' } : {})} className={cls}>{e.name}</Link>
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="t-h1 text-ink">Events</h1>
          <p className="t-cap text-ink/65 mt-1">Competitions, and everything else on at the club.</p>
        </div>
        {office && (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setEditing('new')} disabled={!notesReady}
              title={notesReady ? undefined : 'The club’s calendar isn’t set up yet.'}
              className={`${buttonClass('secondary', false)} ch-focus`}>New event</button>
            <button type="button" onClick={() => setComp('new')} className={`${buttonClass('primary', false)} ch-focus`}>New competition</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 mt-5">
        <div>
          <label htmlFor="ev-year" className={FIELD_LABEL}>Season</label>
          <select id="ev-year" value={year} onChange={e => setYear(Number(e.target.value))} className={`${FIELD} ch-focus w-[120px]`}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ev-type-filter" className={FIELD_LABEL}>Type</label>
          <select id="ev-type-filter" value={type} onChange={e => setType(e.target.value as EventType | 'all')} className={`${FIELD} ch-focus w-[180px]`}>
            <option value="all">Every type</option>
            {typesHere.map(t => <option key={t.code} value={t.code}>{t.plural}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ev-shown" className={FIELD_LABEL}>Who sees it</label>
          <select id="ev-shown" value={shown} onChange={e => setShown(e.target.value as Shown)} className={`${FIELD} ch-focus w-[180px]`}>
            <option value="all">Members and office</option>
            <option value="members">Members</option>
            <option value="office">Office only</option>
          </select>
        </div>
      </div>

      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      {!events && !lost && <div className="mt-6 space-y-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-12 rounded-tile" />)}</div>}
      {events && rows.length === 0 && (
        <div className={`${cardClass()} p-6 mt-6 max-w-xl`}>
          <p className="t-card text-ink">{type === 'all' && shown === 'all' ? `Nothing in ${year}` : `None like that in ${year}`}</p>
          <p className="text-ink/80 text-[15px] mt-2">
            {type !== 'all' || shown !== 'all' ? 'Try every type, or members and office.'
              : office ? 'Add an event, or make a competition and copy it across the season.' : 'Events show here once the club adds them.'}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className={`${cardClass()} mt-6 overflow-x-auto hidden md:block`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line">
                  {['Day', 'Event', 'Type', 'Course or where', 'Who can enter', 'Booked', 'Where it stands'].map(h => (
                    <th key={h} scope="col" className={`t-eyebrow text-ink/65 font-normal px-3 py-3 whitespace-nowrap ${h === 'Booked' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                  <th scope="col" className="px-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(e => {
                  const c = e.competition
                  const n = e.note
                  return (
                    <tr key={e.code} className="ch-hover border-b border-line last:border-b-0 h-12">
                      <td className="px-3 text-ink/80 text-[15px] whitespace-nowrap tabular-nums">
                        {clubEventDates(e.startDate, e.endDate)}
                        {n && noteTimeLine(n) && <span className="block t-cap text-ink/65">{noteTimeLine(n)}</span>}
                      </td>
                      <td className="px-3 min-w-[9rem]">{open(e)}</td>
                      <td className="px-3 text-ink/80 text-[15px] whitespace-nowrap">
                        {typeLabel(seasonType(e))}
                        {c && <span className="block t-cap text-ink/65">{formatLine(c)}</span>}
                      </td>
                      <td className="px-3 text-ink/80 text-[15px]">{c?.courseName ? <CourseName name={c.courseName} /> : n?.place ?? '—'}</td>
                      <td className="px-3 text-ink/80 text-[15px]">{c ? c.entry ?? 'Everybody' : '—'}</td>
                      <td className="px-3 text-ink/80 text-[15px] text-right tabular-nums whitespace-nowrap">{c ? (c.capacity ? `${c.booked} of ${c.capacity}` : c.booked) : '—'}</td>
                      <td className="px-3 whitespace-nowrap">
                        {c ? <Pill live={c.phase === 'in_play'}>{PHASE_WORDS[c.phase]}</Pill> : isOfficeOnly(e) ? <Pill>Office only</Pill> : null}
                      </td>
                      <td className="px-3 text-right whitespace-nowrap">
                        {c && office && (
                          <>
                            <button type="button" onClick={() => setComp(e.code)} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Change</button>
                            <button type="button" onClick={() => setCopying(e)} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Copy</button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ul className={`${cardClass()} mt-6 divide-y divide-line md:hidden overflow-hidden`}>
            {rows.map(e => {
              const line = [clubEventDates(e.startDate, e.endDate), e.competition?.courseName ? splitCourseName(e.competition.courseName).club : e.note?.place ?? null].filter(Boolean).join(' · ')
              const body = (
                <>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[17px] font-medium text-ink leading-snug">{e.name}</span>
                    <span className="block t-cap text-ink/65 mt-0.5">{typeLabel(seasonType(e))} · {line}</span>
                  </span>
                  {e.competition ? <Pill live={e.competition.phase === 'in_play'}>{PHASE_WORDS[e.competition.phase]}</Pill> : isOfficeOnly(e) ? <Pill>Office only</Pill> : null}
                </>
              )
              return (
                <li key={e.code}>
                  {e.note
                    ? (office
                      ? <button type="button" onClick={() => setEditing(e.note!)} className="w-full text-left flex items-center gap-3 min-h-14 px-4 py-3 press">{body}</button>
                      : <div className="flex items-center gap-3 min-h-14 px-4 py-3">{body}</div>)
                    : <Link href={eventHref(e, face.slug)!} {...(opensOutside(e) ? { target: '_blank', rel: 'noopener' } : {})} className="flex items-center gap-3 min-h-14 px-4 py-3 press">{body}</Link>}
                  {e.competition && office && (
                    <div className="flex gap-1 px-3 pb-2 -mt-1">
                      <button type="button" onClick={() => setComp(e.code)} className="ch-focus t-label text-ink rounded-tile px-2 min-h-11 press">Change</button>
                      <button type="button" onClick={() => setCopying(e)} className="ch-focus t-label text-ink rounded-tile px-2 min-h-11 press">Copy</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {office && presetsReady && presets && (
        <section className="mt-10">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <h2 className="t-h2 text-ink">Presets</h2>
              <p className="t-cap text-ink/65 mt-1">What a competition starts from — its format, who can enter, its tee times. Changing one changes no competition already made.</p>
            </div>
            <button type="button" onClick={() => setPresetOpen('new')} className={`${buttonClass('secondary', false)} ch-focus`}>New preset</button>
          </div>
          {presets.length === 0 ? (
            <div className={`${cardClass()} p-6 mt-4 max-w-xl`}>
              <p className="t-card text-ink">No presets yet</p>
              <p className="text-ink/80 text-[15px] mt-2">Make one for each kind of competition the club runs — the Saturday men’s comp, the Wednesday semi-open — and New competition and a calendar file start from it.</p>
            </div>
          ) : (
            <ul className={`${cardClass()} mt-4 divide-y divide-line overflow-hidden`}>
              {presets.map(p => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPresetOpen(p)} className="ch-hover ch-focus w-full text-left flex items-start gap-4 px-4 py-3">
                    <span className="font-mono text-[15px] text-ink w-16 md:w-20 flex-shrink-0 pt-0.5 break-all">{p.code}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-ink text-[15px] font-medium">{p.name}</span>
                      {p.usedFor && <span className="block t-cap text-ink/65">{p.usedFor}</span>}
                      <span className="block t-cap text-ink/65">{formatLine(p)} · {planLine(p.plan)}</span>
                    </span>
                    {p.isDefault && <Pill>Default</Pill>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {comp && <CompPanel clubId={club.id} slug={face.slug} code={comp === 'new' ? null : comp} homeCourseId={club.homeCourseId ?? null}
        cats={categories ?? []} ageDate={ageDate} presets={presets ?? []} onClose={() => setComp(null)} onDone={again} />}
      {presetOpen && <PresetPanel clubId={club.id} preset={presetOpen === 'new' ? null : presetOpen} presets={presets ?? []} homeCourseId={club.homeCourseId ?? null}
        cats={categories ?? []} ageDate={ageDate} onClose={() => setPresetOpen(null)} onSaved={setPresets} />}
      {copying && <CopyPanel clubId={club.id} slug={face.slug} event={copying} onClose={() => setCopying(null)} onMade={again} />}
      {editing && <EventPanel clubId={club.id} note={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={again} />}
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
                    <li key={m.code}><Link href={`/clubhouse/${slug}/events/${m.code}`} className="text-ink text-[15px] underline underline-offset-2">{clubEventDates(m.date, m.date)}</Link></li>
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
