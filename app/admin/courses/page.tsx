import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  countyOf, filterCourses, type DirectoryCourse,
} from '@/lib/courseDirectory'
import { cardState, CARD_STATE_LABEL, CARD_STATE_TONE, type CardState } from '@/lib/courseCard'
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
 *
 * The card state is `cardState` from lib/courseCard — three states, not the
 * two `card_verified` suggests. The one that matters is `none`: a course with
 * no holes **cannot be scored**, where a researched course with eighteen plays
 * perfectly well, and grouping those two under one grey "Unverified" is how a
 * course nobody can play gets picked for a trip.
 */
export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

type CourseRow = DirectoryCourse & { created_at: string }

/**
 * A ceiling well above any plausible course count, so the tee and hole tallies
 * are never silently truncated. Supabase's own default is 1000 rows.
 */
const ROW_CEILING = 50_000

/** The filter chips. The empty key is All, and is the fallback for anything unrecognised. */
const STATE_FILTERS: readonly { key: '' | CardState; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'confirmed', label: CARD_STATE_LABEL.confirmed },
  { key: 'researched', label: CARD_STATE_LABEL.researched },
  { key: 'none', label: CARD_STATE_LABEL.none },
]

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>
}) {
  if (!(await requireAdmin())) return <AdminLogin />

  const { q = '', state = '' } = await searchParams
  const db = createAdminClient()

  const coursesRes = await db.from('courses')
    .select('id, name, location, county, website, card_verified, created_at')
    .is('trip_id', null)
    .order('name')

  const all = (coursesRes.data ?? []) as CourseRow[]
  const ids = all.map(c => c.id)

  // Scoped to these courses and given an explicit ceiling, rather than reading
  // the whole table. Supabase caps a select at 1000 rows by default, and
  // `holes` passes that at about 56 courses — after which the counts would go
  // quietly wrong, and the badge below is built on them. Costs one sequential
  // round trip on a page only the owner sees.
  const [teesRes, holesRes] = ids.length > 0
    ? await Promise.all([
        db.from('tees').select('course_id').in('course_id', ids).limit(ROW_CEILING),
        db.from('holes').select('course_id').in('course_id', ids).limit(ROW_CEILING),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]

  const readError = [coursesRes, teesRes, holesRes].find(r => r.error)?.error
  if (readError) console.error('AdminCoursesPage read failed:', readError)

  const teeCount = new Map<string, number>()
  for (const t of (teesRes.data ?? []) as { course_id: string }[]) {
    teeCount.set(t.course_id, (teeCount.get(t.course_id) ?? 0) + 1)
  }
  const holeCount = new Map<string, number>()
  for (const h of (holesRes.data ?? []) as { course_id: string }[]) {
    holeCount.set(h.course_id, (holeCount.get(h.course_id) ?? 0) + 1)
  }

  const stateOf = (c: CourseRow) => cardState(holeCount.get(c.id) ?? 0, c.card_verified)
  const tally = (s: CardState) => all.filter(c => stateOf(c) === s).length

  const wanted = (STATE_FILTERS.find(f => f.key === state) ?? STATE_FILTERS[0]).key
  const courses = (filterCourses(all, q, null) as CourseRow[])
    .filter(c => wanted === '' || stateOf(c) === wanted)

  return (
    <AdminShell
      active="courses"
      subtitle={`${all.length} courses · ${tally('confirmed')} verified · ` +
        `${tally('researched')} awaiting photo · ${tally('none')} no scorecard`}
    >
      {readError && (
        <p className="text-rust-deep text-sm mb-4">
          Could not load the courses — refresh to try again.
        </p>
      )}

      <form method="GET" className="mb-3">
        {/* The state travels with the search, so typing a name does not throw
            away the chip that is selected. */}
        {wanted !== '' && <input type="hidden" name="state" value={wanted} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or county"
          className="w-full sm:max-w-sm bg-surface border border-bark/25 rounded-xl px-4 py-3 text-ink placeholder:text-ink/65 focus:outline-none focus:border-accent transition-colors"
        />
      </form>

      {/* Links rather than a second form: a chip keeps the search it was
          clicked under, and the whole thing stays a GET the browser can
          bookmark and the back button can retrace. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATE_FILTERS.map(f => {
          const params = new URLSearchParams()
          if (q) params.set('q', q)
          if (f.key) params.set('state', f.key)
          const href = params.toString() ? `/admin/courses?${params}` : '/admin/courses'
          const count = f.key === '' ? all.length : tally(f.key)
          const active = f.key === wanted
          return (
            <Link
              key={f.key || 'all'}
              href={href}
              aria-current={active ? 'true' : undefined}
              className={`px-3 py-1.5 border rounded-full text-sm tracking-wider uppercase transition-colors ${
                active
                  ? 'border-accent text-accent-deep bg-accent/[0.08]'
                  : 'border-bark/12 text-ink/65 hover:border-bark/25'
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count}</span>
            </Link>
          )
        })}
      </div>

      {courses.length === 0 ? (
        <div className="border border-bark/12 rounded-xl py-16 text-center">
          <p className="text-ink/65 text-sm">
            {q
              ? `Nothing matches “${q}”${wanted ? ' under that filter' : ''}.`
              : wanted
                ? `No courses are ${CARD_STATE_LABEL[wanted].toLowerCase()}.`
                : 'No courses yet.'}
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
                    <Badge tone={CARD_STATE_TONE[stateOf(c)]} className="flex-shrink-0">
                      {CARD_STATE_LABEL[stateOf(c)]}
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
