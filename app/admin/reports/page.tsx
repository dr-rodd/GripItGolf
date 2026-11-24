import { createAdminClient } from '@/lib/supabase-admin'
import { cardClass } from '@/app/components/ui'
import { openReports } from '@/app/api/feed/store'
import { requireAdmin } from '../adminGate'
import AdminLogin from '../AdminLogin'
import AdminShell from '../AdminShell'
import ReportDecision from './ReportDecision'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

const KIND: Record<string, string> = { card: 'A card’s status', comment: 'A comment', highlight: 'A highlight', board_move: 'A leaderboard move', match_result: 'A match result' }

/**
 * Reports on the feed that belong to Green Dot (D303): anything not on a
 * club's card — a club card's report goes to that club's Clubhouse instead.
 */
export default async function AdminReportsPage() {
  if (!(await requireAdmin())) return <AdminLogin />
  const reports = await openReports(createAdminClient(), null)
  const items = [...new Map(reports.map(r => [r.itemId, r])).values()]
  return (
    <AdminShell active="reports" subtitle={`${items.length} waiting — feed reports outside any club`}>
      {items.length === 0 && <p className="text-ink/65">Nothing waiting (or migration 102 is not in yet).</p>}
      <div className="space-y-3">
        {items.map(r => (
          <div key={r.itemId} className={`${cardClass()} p-4 flex flex-col sm:flex-row sm:items-start gap-3 justify-between`}>
            <div className="min-w-0">
              <p className="t-cap text-ink/65">{KIND[r.item.kind] ?? 'An item'}{r.item.event ? ` · ${r.item.event}` : ''}</p>
              <p className="t-label text-ink mt-1">{r.item.name}</p>
              {r.item.text && <p className="text-ink text-[15px] mt-1 break-words">“{r.item.text}”</p>}
              <ul className="mt-2 space-y-0.5">
                {reports.filter(x => x.itemId === r.itemId).map(x => (
                  <li key={x.id} className="t-cap text-ink/80">Reported by {x.reporter}{x.reason ? `: ${x.reason}` : ''}</li>
                ))}
              </ul>
            </div>
            <ReportDecision itemId={r.itemId} />
          </div>
        ))}
      </div>
    </AdminShell>
  )
}
