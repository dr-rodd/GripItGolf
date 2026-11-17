import { createAdminClient } from '@/lib/supabase-admin'
import { clubStatus, CLUB_STATUS_WORDS } from '@/lib/clubs'
import { Pill, cardClass } from '@/app/components/ui'
import { requireAdmin } from '../adminGate'
import AdminLogin from '../AdminLogin'
import AdminShell from '../AdminShell'
import ClubDecision from './ClubDecision'
import NewClub from './NewClub'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

type ClubRow = { id: string; slug: string; name: string; created_by: string | null; verified_at: string | null; refused_at: string | null; created_at: string }

/**
 * Setting a club up (only here — members no longer can), then clubs waiting
 * to be checked, first; then every other club. Verifying a
 * club gives its owners and admins its events and its people their list
 * of them (stage (c)). Who set it up is shown by email so it can be checked
 * against the club — never anything from its list.
 */
export default async function AdminClubsPage() {
  if (!(await requireAdmin())) return <AdminLogin />
  const db = createAdminClient()
  const { data, error } = await db.from('clubs')
    .select('id, slug, name, created_by, verified_at, refused_at, created_at').order('created_at', { ascending: false })
  const clubs = (error ? [] : data ?? []) as ClubRow[]
  const [counts, makers] = await Promise.all([
    Promise.all(clubs.map(c => db.from('club_members').select('id', { count: 'exact', head: true }).eq('club_id', c.id).is('removed_at', null))),
    Promise.all(clubs.map(c => (c.created_by ? db.auth.admin.getUserById(c.created_by) : Promise.resolve(null)))),
  ])
  const order = { pending: 0, verified: 1, refused: 2 } as const
  const rows = clubs.map((c, i) => ({
    c, status: clubStatus({ verifiedAt: c.verified_at, refusedAt: c.refused_at }),
    listed: counts[i].count ?? 0,
    maker: makers[i] && 'data' in makers[i]! ? makers[i]!.data.user?.email ?? null : null,
  })).sort((a, b) => order[a.status] - order[b.status])

  return (
    <AdminShell active="clubs" subtitle={error ? 'Could not read the clubs (is migration 086 in?)' : `${clubs.length} clubs`}>
      <NewClub />
      {rows.length === 0 && <p className="text-ink/65">No club has been set up yet.</p>}
      <div className="space-y-3">
        {rows.map(({ c, status, listed, maker }) => (
          <div key={c.id} className={`${cardClass()} p-4 flex flex-col sm:flex-row sm:items-start gap-3 justify-between`}>
            <div className="min-w-0">
              <p className="t-card text-ink">{c.name}</p>
              <p className="t-cap text-ink/65 mt-0.5">
                {CLUB_STATUS_WORDS[status]} · {listed} on the list · set up {new Date(c.created_at).toLocaleDateString('en-IE')}
                {maker ? ` by ${maker}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {status === 'verified' && <Pill tone="win">Verified</Pill>}
              <ClubDecision clubId={c.id} verified={status === 'verified'} />
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  )
}
