import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '../../adminGate'
import AdminLogin from '../../AdminLogin'
import AdminShell from '../../AdminShell'
import CourseEditor from './CourseEditor'

export const dynamic = 'force-dynamic'

/**
 * One course, opened up: name, county and website editable; the tees with
 * their pars, ratings and slopes editable; the card itself read-only.
 *
 * Holes are shown, never edited here. The scorecard photo check is the one
 * writer of pars and stroke indexes — it validates a stroke-index column as
 * a permutation of 1–18, offers a diff, and re-fires the Stableford trigger
 * on apply. A second editor without those rules would be how a course record
 * quietly rots.
 */
export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

type HoleRow = {
  hole_number: number
  par: number | null
  stroke_index: number | null
  par_ladies: number | null
  stroke_index_ladies: number | null
}

export default async function AdminCoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await requireAdmin())) return <AdminLogin />

  const { id } = await params
  const db = createAdminClient()

  const { data: course, error } = await db
    .from('courses')
    .select('id, name, county, location, website, card_verified, slug')
    .eq('id', id)
    .is('trip_id', null)
    .maybeSingle()
  if (error) console.error('AdminCoursePage course read failed:', error)
  if (!course) notFound()

  const [teesRes, holesRes] = await Promise.all([
    db.from('tees')
      .select('id, name, gender, par, course_rating, slope')
      .eq('course_id', id)
      .order('gender')
      .order('name'),
    db.from('holes')
      .select('hole_number, par, stroke_index, par_ladies, stroke_index_ladies')
      .eq('course_id', id)
      .order('hole_number'),
  ])
  if (teesRes.error) console.error('AdminCoursePage tees read failed:', teesRes.error)
  if (holesRes.error) console.error('AdminCoursePage holes read failed:', holesRes.error)

  const holes = (holesRes.data ?? []) as HoleRow[]
  const hasLadies = holes.some(h => h.par_ladies !== null)

  return (
    <AdminShell active="courses" subtitle={course.name as string}>
      <Link href="/admin/courses" className="text-ink/65 text-[13px] hover:text-ink transition-colors">
        ← All courses
      </Link>

      <div className="mt-4">
        <CourseEditor
          course={{
            id: course.id as string,
            name: course.name as string,
            county: (course.county as string | null) ?? null,
            website: (course.website as string | null) ?? null,
            card_verified: Boolean(course.card_verified),
          }}
          tees={(teesRes.data ?? []) as {
            id: string; name: string; gender: string
            par: number | null; course_rating: number | null; slope: number | null
          }[]}
          holeCount={holes.length}
        />
      </div>

      {/* The card, read-only. */}
      <section className="mt-6 bg-surface border border-bark/12 rounded-2xl px-4 py-4">
        <h2 className="font-[family-name:var(--font-display)] text-base mb-1">The card</h2>
        <p className="text-ink/65 text-[13px] mb-3 leading-snug">
          Pars and stroke indexes are corrected with a scorecard photo — the
          check on the pick-player screen — never by hand. A photo is validated
          hole by hole; a keyboard is not.
        </p>

        {holes.length === 0 ? (
          <p className="text-ink/65 text-sm">
            No holes yet. The first trusted scorecard photo creates the card.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm min-w-full">
              <thead>
                <tr className="border-b border-bark/12 text-left">
                  <th className="pr-3 py-2 text-[13px] tracking-[0.12em] uppercase text-ink/65 font-normal">Hole</th>
                  {holes.map(h => (
                    <th key={h.hole_number} className="px-1.5 py-2 text-center tabular-nums text-ink/65 font-normal">
                      {h.hole_number}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CardRow label="Par" values={holes.map(h => h.par)} />
                <CardRow label="SI" values={holes.map(h => h.stroke_index)} muted />
                {hasLadies && (
                  <>
                    <CardRow label="Par (L)" values={holes.map(h => h.par_ladies)} />
                    <CardRow label="SI (L)" values={holes.map(h => h.stroke_index_ladies)} muted />
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  )
}

function CardRow({
  label, values, muted = false,
}: {
  label: string
  values: (number | null)[]
  muted?: boolean
}) {
  return (
    <tr className="border-b border-bark/12 last:border-0">
      <td className="pr-3 py-1.5 text-[13px] text-ink/65 whitespace-nowrap">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-1.5 py-1.5 text-center tabular-nums ${muted ? 'text-ink/65' : 'text-ink/80'}`}>
          {v ?? '—'}
        </td>
      ))}
    </tr>
  )
}
