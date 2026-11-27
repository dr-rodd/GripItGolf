'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import CourseSelect from '@/app/components/CourseSelect'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { FIELD, FIELD_LABEL, ListGroup, ListRow, SectionHeader, Segmented, buttonClass, cardClass } from '@/app/components/ui'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { describeShortDate } from '@/lib/itinerary'
import { MAX_TIE_MATCHES, clubSide, competitionFormat, formatLine, type TieFormat } from '@/lib/interclubTie'
import { askInterclub } from '@/lib/interclubClient'
import DrawNameField from '../../DrawNameField'

/** A match on the draw with both clubs known — what a captain may set up. */
export type DrawPair = { round: number; slot: number; roundName: string; a: string; b: string; by: string | null }

type Tie = { round: number; slot: number; code: string; nameA: string; nameB: string; taken: { a: boolean; b: boolean } }
type MyClub = { id: string; name: string; slug: string; drawName: string; homeCourseId: string | null }

/**
 * Under a competition's draw (docs/interclub.md, stage 2): every match set
 * up on Green Dot, for anybody to open and score; and, for a team captain
 * (D358), their club's matches on this draw — **Set up this match**, the
 * tie's own page once it is, or **Take your side** where the other club set
 * it up. Asked after the page paints; the draw itself is the page's.
 */
export default function CaptainPanel({ competitionId, province, slug, competitionName, pairs }: {
  competitionId: string
  province: string
  slug: string
  competitionName: string
  pairs: DrawPair[]
}) {
  const router = useRouter()
  const [ties, setTies] = useState<Tie[]>([])
  const [clubs, setClubs] = useState<MyClub[] | null>(null)
  const [ready, setReady] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    void askInterclub({ action: 'ties', competitionId }, { public: true }).then(r => {
      if (live && r.ok && Array.isArray(r.ties)) setTies(r.ties as Tie[])
    })
    void askInterclub({ action: 'mine' }).then(r => {
      if (!live) return
      if (r.ok) { setClubs((r.clubs as MyClub[]) ?? []); setReady(r.ready !== false) } else setClubs([])
    })
    return () => { live = false }
  }, [competitionId])

  const tieAt = (p: { round: number; slot: number }) => ties.find(t => t.round === p.round && t.slot === p.slot) ?? null
  const mine = useMemo(() => (clubs ?? []).map(c => ({
    club: c,
    matches: pairs.map(p => ({ pair: p, side: clubSide(c.drawName, p) })).filter(x => x.side),
  })), [clubs, pairs])

  async function take(code: string, clubId: string) {
    setBusy(true); setError('')
    const r = await askInterclub({ action: 'take', code, clubId })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    router.push(`/interclub/tie/${code}`)
  }

  return (
    <div className="mt-8 space-y-6">
      {ties.length > 0 && (
        <section>
          <SectionHeader hint="Anybody with the link scores them.">On Green Dot</SectionHeader>
          <ListGroup className="mt-3">
            {ties.map(t => (
              <ListRow key={t.code} label={`${t.nameA} v ${t.nameB}`} hint={pairs.find(p => p.round === t.round)?.roundName} href={`/${t.code}`} />
            ))}
          </ListGroup>
        </section>
      )}

      {mine.map(({ club, matches }) => (
        <section key={club.id}>
          <SectionHeader hint="You’re a team captain.">{club.name}</SectionHeader>
          {!ready && <p className="t-cap text-ink/65 mt-2">Interclub isn’t set up yet — try again later.</p>}
          {matches.length === 0 ? (
            <div className={`${cardClass('flat')} p-4 mt-3`}>
              <p className="t-body text-ink/80 mb-3">{club.name} isn’t in a match on this draw with both clubs known. If the draw spells the club differently, say how:</p>
              <DrawNameField clubId={club.id} compact onSaved={name => setClubs(cs => (cs ?? []).map(c => (c.id === club.id ? { ...c, drawName: name } : c)))} />
            </div>
          ) : (
            <div className="space-y-3 mt-3">
              {matches.map(({ pair, side }) => {
                const tie = tieAt(pair)
                const key = `${club.id}:${pair.round}:${pair.slot}`
                const ours = tie && side ? tie.taken[side] : false
                return (
                  <div key={key} className={`${cardClass()} p-4`}>
                    <p className="t-card text-ink">{pair.a} v {pair.b}</p>
                    <p className="t-cap text-ink/65 mt-1">
                      {pair.roundName}{pair.by ? ` · play by ${describeShortDate(pair.by) ?? pair.by}` : ''}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tie ? (
                        ours ? (
                          <a href={`/interclub/tie/${tie.code}`} className={buttonClass('primary', false)}>Run the match</a>
                        ) : (
                          <>
                            <button type="button" disabled={busy} onClick={() => void take(tie.code, club.id)} className={buttonClass('primary', false)}>Take your side</button>
                            <a href={`/${tie.code}`} className={buttonClass('secondary', false)}>Open the match</a>
                          </>
                        )
                      ) : open === key ? null : (
                        <button type="button" disabled={!ready} onClick={() => { setOpen(key); setError('') }} className={buttonClass('primary', false)}>Set up this match</button>
                      )}
                    </div>
                    {!tie && open === key && (
                      <SetUp
                        club={club} pair={pair} province={province} slug={slug} competitionName={competitionName}
                        onCancel={() => setOpen(null)}
                        onMade={code => router.push(`/interclub/tie/${code}`)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ))}
      {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}
    </div>
  )
}

const MATCH_WORDS: { value: TieFormat['match']; label: string }[] = [
  { value: 'singles', label: 'Singles' }, { value: 'fourball', label: 'Fourball' }, { value: 'foursomes', label: 'Foursomes' },
]

/** Set up this match: the day, where, and what the competition plays — suggested from its name, changed here. */
function SetUp({ club, pair, province, slug, competitionName, onCancel, onMade }: {
  club: MyClub; pair: DrawPair; province: string; slug: string; competitionName: string
  onCancel: () => void; onMade: (code: string) => void
}) {
  const { courses: listed } = usePlatformCourses()
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const courses = [...listed.filter(c => !added.some(a => a.id === c.id)), ...added]
  const [courseId, setCourseId] = useState(club.homeCourseId ?? '')
  const [date, setDate] = useState(pair.by ?? '')
  const [time, setTime] = useState('')
  const [format, setFormat] = useState<TieFormat>(() => competitionFormat(competitionName))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function make() {
    setBusy(true); setError('')
    const r = await askInterclub({ action: 'setup', province, slug, round: pair.round, slot: pair.slot, clubId: club.id, courseId, date, time, format })
    setBusy(false)
    if (!r.ok || typeof r.code !== 'string') { setError(r.ok ? 'Could not set up the match — try again.' : r.error); return }
    onMade(r.code)
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={FIELD_LABEL} htmlFor="tie-date">Day</label>
          <input id="tie-date" type="date" className={FIELD} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className={FIELD_LABEL} htmlFor="tie-time">First tee (optional)</label>
          <input id="tie-time" type="time" className={FIELD} value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>
      <div>
        <p className={FIELD_LABEL}>Where it’s played</p>
        <CourseSelect courses={courses} value={courseId} onChange={setCourseId} onCourseAdded={c => setAdded(a => [...a.filter(x => x.id !== c.id), c])} />
      </div>
      <div>
        <p className={FIELD_LABEL}>What it plays</p>
        <Segmented label="Format" options={MATCH_WORDS} value={format.match} onChange={m => setFormat(f => ({ ...f, match: m }))} />
        <div className="flex items-center gap-3 mt-3">
          <span className="t-label text-ink flex-1">Matches</span>
          <button type="button" aria-label="One match fewer" disabled={format.matches <= 1} onClick={() => setFormat(f => ({ ...f, matches: f.matches - 1 }))} className={buttonClass('secondary', false)}>−</button>
          <span className="font-serif t-data text-ink w-6 text-center">{format.matches}</span>
          <button type="button" aria-label="One match more" disabled={format.matches >= MAX_TIE_MATCHES} onClick={() => setFormat(f => ({ ...f, matches: f.matches + 1 }))} className={buttonClass('secondary', false)}>+</button>
        </div>
        <Segmented className="mt-3" label="A level match" value={format.tie} onChange={t => setFormat(f => ({ ...f, tie: t }))}
          options={[{ value: 'half', label: 'Halved after 18' }, { value: 'extra', label: 'Played on' }]} />
        <p className="t-cap text-ink/65 mt-2">{formatLine(format)}</p>
      </div>
      {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || !courseId || !date} onClick={() => void make()} className={buttonClass('primary', false)}>
          {busy ? 'Setting up…' : 'Set it up'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('quiet', false)}>Cancel</button>
      </div>
    </div>
  )
}
