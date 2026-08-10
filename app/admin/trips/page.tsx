import { createAdminClient } from '@/lib/supabase-admin'
import { tripState, todayString } from '@/lib/tripStatus'
import { Badge } from '@/app/components/ui'
import { requireAdmin } from '../adminGate'
import AdminLogin from '../AdminLogin'
import AdminShell from '../AdminShell'

export const dynamic = 'force-dynamic'

/**
 * Every trip on the platform, newest first.
 *
 * Not linked from anywhere and not indexed — you get here by typing the URL.
 * That is not the protection, though; the password is. Being unlinked only
 * means it does not turn up by accident.
 *
 * The trip query is below the cookie check on purpose. Nothing is fetched
 * until the session verifies, so a failed login never touches the data.
 * Reads use the service-role client: this page shows every trip whatever
 * row-level security says, because the password already answered who is asking.
 */
export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

type TripRow = {
  id: string
  name: string
  trip_code: string | null
  lead_email: string | null
  created_at: string
  start_date: string | null
  end_date: string | null
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AdminTripsPage() {
  if (!(await requireAdmin())) return <AdminLogin />

  const db = createAdminClient()

  const { data, error } = await db
    .from('trips')
    .select('id, name, trip_code, lead_email, created_at, start_date, end_date')
    .order('created_at', { ascending: false })

  if (error) console.error('AdminTripsPage trips query failed:', error)
  const trips = (data ?? []) as TripRow[]

  // One query for the counts rather than one per trip. Composite players are
  // synthetic scorecards, not people, so they are not part of a headcount.
  const { data: playerRows, error: playersError } = trips.length > 0
    ? await db
        .from('players')
        .select('trip_id')
        .in('trip_id', trips.map(t => t.id))
        .eq('is_composite', false)
    : { data: [], error: null }

  if (playersError) console.error('AdminTripsPage players query failed:', playersError)

  const playerCount = new Map<string, number>()
  for (const p of (playerRows ?? []) as { trip_id: string }[]) {
    playerCount.set(p.trip_id, (playerCount.get(p.trip_id) ?? 0) + 1)
  }

  const today = todayString(new Date())
  const withEmail = trips.filter(t => t.lead_email).length

  return (
    <AdminShell active="trips" subtitle={`${trips.length} trips · ${withEmail} with an email`}>
      {error && (
        <p className="text-rust-deep text-sm mb-4">
          Could not load trips — refresh to try again.
        </p>
      )}

      {trips.length === 0 ? (
        <div className="border border-bark/12 rounded-xl py-16 text-center">
          <p className="text-ink/65 text-sm">No trips yet.</p>
        </div>
      ) : (
        <>
          {/* Cards on a phone, a table from sm up. The same data either way —
              this is read on a phone as often as anywhere else. */}
          <div className="hidden sm:block border border-bark/12 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[46rem]">
              <thead>
                <tr className="border-b border-bark/12 text-left">
                  {['Trip', 'Code', 'Created', 'Lead email', 'Players', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-[13px] tracking-[0.2em] uppercase text-ink/65 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trips.map(t => {
                  const state = tripState(t, today)
                  return (
                    <tr key={t.id} className="border-b border-bark/12 last:border-0">
                      <td className="px-4 py-3 font-[family-name:var(--font-display)] text-base">
                        {t.name}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-accent">
                        {t.trip_code ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-ink/65 whitespace-nowrap">
                        {formatDateTime(t.created_at)}
                      </td>
                      <td className="px-4 py-3 text-ink/80 break-all">
                        {t.lead_email ?? <span className="text-ink/50">—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink/80">
                        {playerCount.get(t.id) ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={state.open ? 'win' : 'neutral'} live={state.key === 'active'}>
                          {state.label}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden flex flex-col gap-2">
            {trips.map(t => {
              const state = tripState(t, today)
              return (
                <div key={t.id} className="border border-bark/12 rounded-xl px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-display)] text-base leading-tight truncate">
                        {t.name}
                      </p>
                      <p className="text-accent text-[13px] tabular-nums mt-0.5">
                        {t.trip_code ?? 'no code'}
                      </p>
                    </div>
                    <Badge tone={state.open ? 'win' : 'neutral'} live={state.key === 'active'} className="flex-shrink-0">
                      {state.label}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-col gap-1 text-[13px]">
                    <Field label="Created" value={formatDateTime(t.created_at)} />
                    <Field label="Email" value={t.lead_email} />
                    <Field label="Players" value={String(playerCount.get(t.id) ?? 0)} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </AdminShell>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="text-ink/65 w-16 flex-shrink-0">{label}</span>
      <span className={value ? 'text-ink/80 break-all' : 'text-ink/50'}>
        {value ?? '—'}
      </span>
    </div>
  )
}
