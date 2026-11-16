'use client'

import { useState } from 'react'
import CourseSelect from '@/app/components/CourseSelect'
import ScorecardGate from '@/app/components/ScorecardGate'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { listedBlocker, ratedTeeCount } from '@/lib/courseCard'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { askClub, type ClubSummary } from '@/lib/accountClient'

/**
 * The club's home course (D161), set by its owners and admins on the list
 * page; new competitions default to it. Any course may be chosen — never
 * refused — but one a card cannot start on yet asks for its scorecard photo
 * here, the one gate every card door asks (`cardBlocker`), so a competition
 * never starts on a course without one.
 */
export default function ClubHomeCourse({ club, onChange }: { club: ClubSummary; onChange: (c: ClubSummary) => void }) {
  const { courses: listed } = usePlatformCourses()
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const courses = [...listed.filter(c => !added.some(a => a.id === c.id)), ...added]
  const chosenId = club.homeCourseId ?? ''
  const chosen = courses.find(c => c.id === chosenId) ?? null
  const blocker = chosen ? listedBlocker(chosen) : null

  function upsert(c: DirectoryCourse) {
    setAdded(a => [...a.filter(x => x.id !== c.id), c])
  }

  async function choose(courseId: string) {
    setBusy(true); setError('')
    const r = await askClub('home-course', { clubId: club.id, courseId: courseId || null })
    setBusy(false)
    if (!r.ok || !r.club) { setError(r.ok ? 'Could not save the home course — try again.' : r.error); return }
    onChange(r.club)
  }

  return (
    <section className="mt-8">
      <h2 className="t-h2 text-ink">Home course</h2>
      <p className="text-ink/65 text-sm mt-1">Where {club.name}’s competitions are played unless you choose another.</p>
      <div className="mt-4" aria-busy={busy}>
        <CourseSelect courses={courses} value={chosenId} onChange={id => void choose(id)} onCourseAdded={upsert} />
      </div>
      {error && <p className="t-cap text-rust-deep mt-2" role="alert">{error}</p>}
      {blocker && chosen && (
        <div className="mt-4">
          <ScorecardGate
            blocker={blocker}
            courseId={chosen.id}
            event
            onReady={(holes, tees) => upsert({
              ...chosen, card_verified: true,
              hole_count: holes.length,
              rated_tees: ratedTeeCount(tees as { course_rating: number | null; slope: number | null; par: number | null }[]),
            })}
          />
        </div>
      )}
    </section>
  )
}
