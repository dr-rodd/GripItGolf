'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import { teesForPlayer } from '@/lib/courseHandicap'
import { WALKOVER, withTee, type MatchTees } from '@/lib/matchArrangements'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { Sheet } from '@/app/components/ItineraryForms'
import CourseSelect from '@/app/components/CourseSelect'
import DateField from '@/app/components/DateField'
import InlineUnlock from '@/app/components/InlineUnlock'
import { FIELD_LABEL, buttonClass, cardClass, chipClass } from '@/app/components/ui'

/**
 * What can be done to a knockout match from its own page (docs/event-use-
 * cases.md, story 2): arranging it — the course, the day, each player's
 * tee, from which the server works out the shots — and a walkover.
 *
 * Arranging is for the players in the match, or the organiser with the
 * admin PIN asked in place. A walkover is conceded by a player in the match
 * (to the other side) or awarded by the organiser (to either, and over a
 * result already in — changing a result is theirs). Both write the match
 * row the bracket reads, through the anon client as the bracket does.
 */

type MatchPerson = { id: string; name: string; gender: string; homeCourseId: string | null }
type TeeOption = { id: string; name: string | null; gender: string; slope: number | null; course_id: string }

/** The admin PIN: open when none is set, else this device's unlock or the PIN asked now. */
function useOrganiser(tripCode: string, passcodeHash: string | null) {
  const [unlocked, setUnlocked] = useState(false)
  // The unlock lives in sessionStorage — read after mount, never in render.
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  return { organiser: unlocked || !isLocked(passcodeHash), unlock: () => setUnlocked(true) }
}

// ─── Arranging ─────────────────────────────────────────────────

export function MatchArrange({
  tripId, tripCode, matchId, passcodeHash, inMatch, allowAddCourse, people,
  courseId, playedOn, tees,
}: {
  tripId: string
  tripCode: string
  matchId: string
  passcodeHash: string | null
  /** This phone is one of the players in the match. */
  inMatch: boolean
  allowAddCourse: boolean
  people: MatchPerson[]
  courseId: string | null
  playedOn: string | null
  tees: MatchTees
}) {
  const router = useRouter()
  const { organiser, unlock } = useOrganiser(tripCode, passcodeHash)
  const [open, setOpen] = useState(false)
  const [course, setCourse] = useState(courseId ?? '')
  const [day, setDay] = useState(playedOn ?? '')
  const [chosen, setChosen] = useState<MatchTees>(tees)
  const [courseTees, setCourseTees] = useState<TeeOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { courses } = usePlatformCourses(open)
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const allCourses = useMemo(() => {
    const known = new Set(courses.map(c => c.id))
    return [...courses, ...added.filter(c => !known.has(c.id))].sort((a, b) => a.name.localeCompare(b.name))
  }, [courses, added])

  const mayArrange = inMatch || organiser

  // The tees of the course chosen, read when it changes (tees are readable).
  useEffect(() => {
    if (!open || !course) { setCourseTees([]); return }
    let live = true
    supabase.from('tees').select('id, name, gender, slope, course_id').eq('course_id', course)
      .then(({ data, error: err }) => {
        if (!live) return
        if (err) { console.error('Match tees fetch failed:', err); setCourseTees([]); return }
        setCourseTees((data ?? []) as TeeOption[])
      })
    return () => { live = false }
  }, [open, course])

  // The home clubs of the players in the match, offered first.
  const homes = [...new Map(people
    .filter(p => p.homeCourseId)
    .map(p => [p.homeCourseId as string, p])).values()]

  function openSheet() {
    setCourse(courseId ?? '')
    setDay(playedOn ?? '')
    setChosen(tees)
    setError(null)
    setOpen(true)
  }

  async function save() {
    if (!mayArrange) { setError('Arranging this match needs the admin PIN.'); return }
    if (!course) { setError('Choose the course first.'); return }
    setSaving(true)
    setError(null)
    // Only tees that belong to this course survive a change of course.
    const valid = new Set(courseTees.map(t => t.id))
    const kept = Object.fromEntries(Object.entries(chosen).filter(([, t]) => valid.has(t)))
    const { error: err } = await supabase.from('matchplay_matches')
      .update({ course_id: course, played_on: day || null, tees: kept })
      .eq('id', matchId).eq('trip_id', tripId)
    setSaving(false)
    if (err) {
      console.error('Match arrange write failed:', err)
      setError('Could not save the match — try again.')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={openSheet} className={buttonClass('secondary')}>
        {courseId ? 'Change the venue or tees' : 'Choose the venue'}
      </button>

      {open && (
        <Sheet
          title="Arrange the match"
          onClose={() => !saving && setOpen(false)}
          onAdd={save}
          addLabel={saving ? 'Saving…' : 'Save'}
          error={error}
        >
          {!mayArrange && passcodeHash && (
            <div className={`p-4 ${cardClass()}`}>
              <p className="text-ink text-sm font-medium">The players arrange their match</p>
              <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
                Or the organiser, with the admin PIN.
              </p>
              <InlineUnlock tripCode={tripCode} passcodeHash={passcodeHash} onUnlocked={unlock} prompt="Enter the PIN" />
            </div>
          )}

          <div>
            <label className={FIELD_LABEL}>Course</label>
            {homes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {homes.map(p => {
                  const name = allCourses.find(c => c.id === p.homeCourseId)?.name
                  return (
                    <button
                      key={p.homeCourseId}
                      type="button"
                      onClick={() => setCourse(p.homeCourseId as string)}
                      aria-pressed={course === p.homeCourseId}
                      className={chipClass(course === p.homeCourseId)}
                    >
                      {p.name.split(' ')[0]}’s club{name ? ` · ${name}` : ''}
                    </button>
                  )
                })}
              </div>
            )}
            <CourseSelect
              courses={allCourses}
              value={course}
              onChange={setCourse}
              onCourseAdded={c => setAdded(prev => [...prev.filter(x => x.id !== c.id), c])}
              allowAdd={allowAddCourse}
            />
          </div>

          <DateField label="Day (if arranged)" value={day} onChange={setDay} />

          {course && (
            <div className="space-y-3">
              <p className={FIELD_LABEL}>Tees</p>
              {courseTees.length === 0 && (
                <p className="t-cap text-ink/65">This course has no rated tees yet, so the shots cannot be worked out.</p>
              )}
              {courseTees.length > 0 && people.map(p => (
                <div key={p.id}>
                  <p className="t-cap text-ink/80 mb-1">{p.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {teesForPlayer(courseTees, p.gender).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setChosen(prev => withTee(prev, p.id, prev[p.id] === t.id ? null : t.id))}
                        aria-pressed={chosen[p.id] === t.id}
                        className={chipClass(chosen[p.id] === t.id)}
                      >
                        {t.name ?? 'Tee'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}

// ─── Walkover ──────────────────────────────────────────────────

export function MatchWalkover({
  tripId, tripCode, matchId, passcodeHash, concedeTo, sides, decided,
}: {
  tripId: string
  tripCode: string
  matchId: string
  passcodeHash: string | null
  /** The side this phone's player would concede to, when they may. */
  concedeTo: { id: string; name: string } | null
  /** Both sides, for the organiser to award to either. */
  sides: { id: string; name: string }[]
  decided: boolean
}) {
  const router = useRouter()
  const { organiser, unlock } = useOrganiser(tripCode, passcodeHash)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Nothing to offer: not a player who may concede, and the match is not
  // the organiser's to change from here without the PIN either.
  if (!concedeTo && sides.length < 2) return null

  async function award(winnerId: string, name: string) {
    const conceding = !organiser && concedeTo?.id === winnerId
    if (!organiser && !conceding) { setError('Awarding a walkover needs the admin PIN.'); return }
    const sure = window.confirm(decided
      ? `Change the result to a walkover for ${name}? Any later results that follow from this match are cleared.`
      : `Give ${name} the match as a walkover?`)
    if (!sure) return
    setSaving(true)
    setError(null)
    try {
      const { loadBracket, persistWinner } = await import('@/lib/matchplayStore')
      const all = await loadBracket(tripId)
      await persistWinner(all, matchId, winnerId, WALKOVER)
      setOpen(false)
      router.refresh()
    } catch (e) {
      console.error('Walkover write failed:', e)
      setError('Could not record the walkover — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setError(null); setOpen(true) }} className={buttonClass('quiet')}>
        {concedeTo && !decided ? 'Concede or give a walkover' : 'Walkover'}
      </button>

      {open && (
        <Sheet title="Walkover" onClose={() => !saving && setOpen(false)} onAdd={() => setOpen(false)} addLabel="Close" error={error}>
          <p className="text-ink/80 text-sm leading-snug">
            A walkover puts one side through without the match being played — the
            other could not play, or conceded. The bracket shows it as {WALKOVER}.
          </p>

          {concedeTo && !decided && (
            <button type="button" disabled={saving} onClick={() => award(concedeTo.id, concedeTo.name)} className={buttonClass('danger')}>
              Concede to {concedeTo.name}
            </button>
          )}

          <div className={`p-4 ${cardClass()}`}>
            <p className="text-ink text-sm font-medium">Award it to either side</p>
            <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
              The organiser’s, with the admin PIN{decided ? ' — and it changes the result already in' : ''}.
            </p>
            {!organiser && passcodeHash ? (
              <InlineUnlock tripCode={tripCode} passcodeHash={passcodeHash} onUnlocked={unlock} prompt="Enter the PIN" />
            ) : (
              <div className="flex flex-col gap-2">
                {sides.map(s => (
                  <button key={s.id} type="button" disabled={saving} onClick={() => award(s.id, s.name)} className={buttonClass('secondary')}>
                    Walkover to {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Sheet>
      )}
    </>
  )
}
