'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import CourseName from '@/app/components/CourseName'
import { splitCourseName } from '@/lib/courseDirectory'
import { FIELD, FIELD_LABEL, Pill, buttonClass, cardClass } from '@/app/components/ui'
import { eventHref, formatLine, isOfficeOnly, opensOutside, seasonOfYear, seasonType, seasonYears, type SeasonEvent } from '@/lib/clubhouse'
import { EVENT_TYPES, noteTimeLine, typeLabel, type ClubNote, type EventType } from '@/lib/clubEvents'
import { clubEventDates, irishToday } from '@/lib/clubs'
import { PHASE_WORDS } from '@/lib/compPhase'
import { useShell } from '../ShellContext'
import { useSeason } from '../useSeason'
import EventPanel from './EventPanel'
import CopyPanel from './CopyPanel'
import CompPanel from './CompPanel'
import PresetPanel from './PresetPanel'
import MatchPlayPanel from './MatchPlayPanel'
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
  // Ross, 17 Nov 2026: New competition asks first — stroke play on a day, or match play over weeks.
  const [choosing, setChoosing] = useState(false)
  const [matchPlay, setMatchPlay] = useState(false)
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
  // A club with one course names it once at most: its rows say "Course" (D272).
  const oneCourse = useMemo(() => new Set((events ?? []).map(e => e.competition?.courseName).filter(Boolean)).size <= 1, [events])
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
        <div className="flex-1 min-w-[min(18rem,100%)]">
          <h1 className="t-h1 text-ink">Events</h1>
          <p className="t-cap text-ink/65 mt-1">Competitions, and everything else on at the club.</p>
        </div>
        {office && (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setEditing('new')} disabled={!notesReady}
              title={notesReady ? undefined : 'The club’s calendar isn’t set up yet.'}
              className={`${buttonClass('secondary', false)} ch-focus`}>New event</button>
            <div className="relative">
              <button type="button" onClick={() => setChoosing(c => !c)} aria-expanded={choosing} aria-haspopup="menu"
                className={`${buttonClass('primary', false)} ch-focus`}>New competition</button>
              {choosing && (
                <div role="menu" className={`${cardClass('floating')} absolute right-0 top-full mt-2 z-30 w-72 p-2`}>
                  <button type="button" role="menuitem" onClick={() => { setChoosing(false); setComp('new') }} className="ch-hover ch-focus w-full text-left rounded-tile px-3 py-2">
                    <span className="block text-ink text-[15px] font-medium">Stroke play</span>
                    <span className="block t-cap text-ink/65">One day on the tee sheet — Stableford or strokes.</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setChoosing(false); setMatchPlay(true) }} className="ch-hover ch-focus w-full text-left rounded-tile px-3 py-2">
                    <span className="block text-ink text-[15px] font-medium">Match play</span>
                    <span className="block t-cap text-ink/65">A knockout over weeks, each round by its play-by date.</span>
                  </button>
                </div>
              )}
            </div>
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
                  {['Day', 'Event', 'Type', 'Location', 'Who can enter', 'Booked', 'Where it stands'].map(h => (
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
                      <td className="px-3 text-ink/80 text-[15px]">{c?.courseName ? (oneCourse ? 'Course' : <CourseName name={c.courseName} />) : n?.place ?? '—'}</td>
                      <td className="px-3 text-ink/80 text-[15px]">{c ? c.entry ?? 'Everybody' : '—'}</td>
                      <td className="px-3 text-ink/80 text-[15px] text-right tabular-nums whitespace-nowrap">{c ? (c.matchPlay ? `${c.matchPlay.entered}${c.matchPlay.cap ? ` of ${c.matchPlay.cap}` : ''}` : c.capacity ? `${c.booked} of ${c.capacity}` : c.booked) : '—'}</td>
                      <td className="px-3 whitespace-nowrap">
                        {c ? <Pill live={c.phase === 'in_play'}>{PHASE_WORDS[c.phase]}</Pill> : isOfficeOnly(e) ? <Pill>Office only</Pill> : null}
                      </td>
                      <td className="px-3 text-right whitespace-nowrap">
                        {office && ((c && !c.matchPlay) || n) && (
                          <button type="button" onClick={() => (n ? setEditing(n) : setComp(e.code))} aria-label={`Edit ${e.name}`}
                            className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Edit</button>
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
              const line = [clubEventDates(e.startDate, e.endDate), e.competition?.courseName ? (oneCourse ? 'Course' : splitCourseName(e.competition.courseName).club) : e.note?.place ?? null].filter(Boolean).join(' · ')
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
                  {e.competition && office && !e.competition.matchPlay && (
                    <div className="flex gap-1 px-3 pb-2 -mt-1">
                      <button type="button" onClick={() => setComp(e.code)} aria-label={`Edit ${e.name}`} className="ch-focus t-label text-ink rounded-tile px-2 min-h-11 press">Edit</button>
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
            <div className="flex-1 min-w-[min(18rem,100%)]">
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
        cats={categories ?? []} ageDate={ageDate} presets={presets ?? []} onClose={() => setComp(null)} onDone={again}
        onCopy={comp === 'new' ? undefined : () => { const ev = (events ?? []).find(x => x.code === comp); setComp(null); if (ev) setCopying(ev) }} />}
      {matchPlay && <MatchPlayPanel clubId={club.id} slug={face.slug} homeCourseId={club.homeCourseId ?? null} presets={presets ?? []} cats={categories ?? []} ageDate={ageDate}
        qualifiers={(events ?? []).filter(e => e.competition && !e.competition.matchPlay && e.startDate && e.startDate >= `${thisYear}-01-01`)
          .map(e => ({ code: e.code, name: e.name, date: clubEventDates(e.startDate, e.startDate) }))}
        onClose={() => setMatchPlay(false)} onDone={again} />}
      {presetOpen && <PresetPanel clubId={club.id} preset={presetOpen === 'new' ? null : presetOpen} presets={presets ?? []} homeCourseId={club.homeCourseId ?? null}
        cats={categories ?? []} ageDate={ageDate} onClose={() => setPresetOpen(null)} onSaved={setPresets} />}
      {copying && <CopyPanel clubId={club.id} slug={face.slug} event={copying} onClose={() => setCopying(null)} onMade={again} />}
      {editing && <EventPanel clubId={club.id} note={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={again} />}
    </>
  )
}
