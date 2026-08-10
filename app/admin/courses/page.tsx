import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  countyOf, filterCourses, type DirectoryCourse,
} from '@/lib/courseDirectory'
import { Badge } from '@/app/components/ui'
import { requireAdmin } from '../adminGate'
import AdminLogin from '../AdminLogin'
import AdminShell from '../AdminShell'

export const dynamic = 'force-dynamic'

/**
 * The platform course list — every shared course, searchable, each linking
 * to its editor. Anyone can add a course from the picker, so this list is
 * where typos, wrong counties and wrong slopes get found and fixed.
 *
 * The search reuses lib/courseDirectory's filterCourses — the same folding
 * the picker itself searches with.
 */
export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

type CourseRow = DirectoryCourse & { created_at: string }

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  if (!(await requireAdmin())) return <AdminLogin />

  const { q = '' } = await searchParams
  const db = createAdminClient()

  const [coursesRes, teesRes, holesRes] = await Promise.all([
    db.from('courses')
      .select('id, name, location, county, website, card_verified, created_at')
      .is('trip_id', null)
      .order('name'),
    db.from('tees').select('course_id'),
    db.from('holes').select('course_id'),
  ])

  const readError = [coursesRes, teesRes, holesRes].find(r => r.error)?.error
  if (readError) console.error('AdminCoursesPage read failed:', readError)

  const all = (coursesRes.data ?? []) as CourseRow[]
  const courses = filterCourses(all, q, null) as CourseRow[]

  const teeCount = new Map<string, number>()
  for (const t of (teesRes.data ?? []) as { course_id: string }[]) {
    teeCount.set(t.course_id, (teeCount.get(t.course_id) ?? 0) + 1)
  }
  const holeCount = new Map<string, number>()
  for (const h of (holesRes.data ?? []) as { course_id: string }[]) {
    holeCount.set(h.course_id, (holeCount.get(h.course_id) ?? 0) + 1)
  }

  const verified = all.filter(c => c.card_verified).length

  return (
    <AdminShell
      active="courses"
      subtitle={`${all.length} courses · ${verified} verified`}
    >
      {readError && (
        <p className="text-rust-deep text-sm mb-4">
          Could not load the courses — refresh to try again.
        </p>
      )}

      <form method="GET" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or county"
          className="w-full sm:max-w-sm bg-surface border border-bark/25 rounded-xl px-4 py-3 text-ink placeholder:text-ink/65 focus:outline-none focus:border-accent transition-colors"
        />
      </form>

      {courses.length === 0 ? (
        <div className="border border-bark/12 rounded-xl py-16 text-center">
          <p className="text-ink/65 text-sm">
            {q ? `Nothing matches “${q}”.` : 'No courses yet.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {courses.map(c => {
            const holes = holeCount.get(c.id) ?? 0
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/courses/${c.id}`}
                  className="block bg-surface border border-bark/12 rounded-2xl px-4 py-3.5 hover:border-bark/25 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-display)] text-base leading-tight truncate">
                        {c.name}
                      </p>
                      <p className="text-ink/65 text-[13px] mt-0.5">
                        {countyOf(c) ?? 'No county'}
                        {' · '}
                        {teeCount.get(c.id) ?? 0} tees
                        {' · '}
                        {holes === 18 ? '18 holes' : holes === 0 ? 'no holes' : `${holes} holes`}
                      </p>
                    </div>
                    <Badge tone={c.card_verified ? 'win' : 'neutral'} className="flex-shrink-0">
                      {c.card_verified ? 'Verified' : 'Unverified'}
                    </Badge>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </AdminShell>
  )
}
