import { createAdminClient } from '@/lib/supabase-admin'
import { TEST_CLUB_NOT_READY } from '@/lib/testClub'
import { cardClass } from '@/app/components/ui'
import { requireAdmin } from '../adminGate'
import AdminLogin from '../AdminLogin'
import AdminShell from '../AdminShell'
import { testClubs, wipeStore } from './store'
import TestClubPanel from './TestClubPanel'

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
          <TestClubPanel key={c.id} club={c} keep={keeps[i].map(k => k.username ?? '').filter(Boolean)} />
        ))}
      </div>
    </AdminShell>
  )
}
