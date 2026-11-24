import { createAdminClient } from '@/lib/supabase-admin'
import { TEST_CLUB_NOT_READY, readCharacters, readWeek, weekSteps, weekStatus } from '@/lib/testClub'
import charactersFile from '@/data/test-club/characters.json'
import { WEEKS } from '@/data/test-club/weeks'
import { irishToday } from '@/lib/clubs'
import { cardClass } from '@/app/components/ui'
import { requireAdmin } from '../adminGate'
import AdminLogin from '../AdminLogin'
import AdminShell from '../AdminShell'
import { testClubs, wipeStore } from './store'
import TestClubPanel, { type WeekRow } from './TestClubPanel'

export const dynamic = 'force-dynamic'
// The wipe runs as a server action on this page; it stops itself at about
// 45 seconds and is pressed again to carry on.
export const maxDuration = 60

export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

/**
 * The test club (D308–D317): a club played by fictional characters beside
 * Ross and a few real friends. Its keep-list, and the wipe. A club is a test
 * club only by migration 103's `is_test`, set by hand — Pints is the one.
 */
export default async function AdminTestClubPage() {
  if (!(await requireAdmin())) return <AdminLogin />
  const db = createAdminClient()
  const clubs = await testClubs(db).catch(e => { console.error('test clubs not read:', e); return [] })
  const store = wipeStore(db)
  const keeps = await Promise.all(clubs.map(c => store.keepList(c.id).catch(() => [])))

  // The week files, and where each stands at each club (D312).
  const cast = readCharacters(charactersFile, [])
  const today = irishToday(new Date())
  const recordedAt = await Promise.all(clubs.map(async c => {
    const { data } = await db.from('test_week_loads').select('week, step, detail').eq('club_id', c.id)
    const by = new Map<string, Map<string, string>>()
    for (const r of (data ?? []) as { week: string; step: string; detail: { hash?: string } | null }[]) {
      const m = by.get(r.week) ?? new Map<string, string>()
      m.set(r.step, r.detail?.hash ?? '')
      by.set(r.week, m)
    }
    return by
  }))
  const weeksFor = (i: number): WeekRow[] => Object.keys(WEEKS).sort().reverse().map(week => {
    const parsed = cast.ok ? readWeek((WEEKS as Record<string, unknown>)[week], cast.cast) : { ok: false as const, error: cast.ok ? '' : cast.error }
    if (!parsed.ok) return { week, title: `Week of ${week}`, error: parsed.error, competitions: 0, casual: 0, state: 'none', done: 0, total: 0, waitingFor: null }
    const w = parsed.week
    const status = weekStatus(weekSteps(w), recordedAt[i].get(week) ?? new Map(), today)
    return { week, title: w.title, error: null, competitions: w.competitions.length, casual: w.casual.length, ...status }
  })

  return (
    <AdminShell active="test-club" subtitle={clubs.length ? `${clubs.length} test club${clubs.length === 1 ? '' : 's'}` : undefined}>
      {clubs.length === 0 && (
        <div className={`${cardClass()} p-4`}>
          <p className="t-card text-ink">No test club</p>
          <p className="t-cap text-ink/65 mt-1">{TEST_CLUB_NOT_READY} It switches Pints Golf Club on as the test club.</p>
        </div>
      )}
      <div className="space-y-6">
        {clubs.map((c, i) => (
          <TestClubPanel key={c.id} club={c} keep={keeps[i].map(k => k.username ?? '').filter(Boolean)} weeks={weeksFor(i)} />
        ))}
      </div>
    </AdminShell>
  )
}
