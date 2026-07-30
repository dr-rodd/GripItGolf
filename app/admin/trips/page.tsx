import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import {
  ADMIN_COOKIE, adminPassword, isAdminConfigured, verifySession,
} from '@/lib/adminAuth'
import { tripState, todayString } from '@/lib/tripStatus'
import AdminLogin from './AdminLogin'
import { logout } from './actions'

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
  setup_status: string | null
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AdminTripsPage() {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value ?? null

  if (!verifySession(token, adminPassword(), Date.now())) {
    return <AdminLogin />
  }

  // Belt and braces: verifySession already fails closed on a null secret,
  // but say so out loud rather than rendering an empty page.
  if (!isAdminConfigured()) return <AdminLogin />

  const { data, error } = await supabase
    .from('trips')
    .select('id, name, trip_code, lead_email, created_at, start_date, end_date, setup_status')
    .order('created_at', { ascending: false })

  if (error) console.error('AdminTripsPage trips query failed:', error)
  const trips = (data ?? []) as TripRow[]

  // One query for the counts rather than one per trip. Composite players are
  // synthetic scorecards, not people, so they are not part of a headcount.
  const { data: playerRows, error: playersError } = trips.length > 0
    ? await supabase
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
    <main className="min-h-dvh bg-[#0a1a0e] text-white">

      <div className="border-b border-[#1e3d28]">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-playfair)] text-xl tracking-wide">
              Trips
            </h1>
            <p className="text-white/35 text-xs mt-0.5">
              {trips.length} total · {withEmail} with an email
            </p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex-shrink-0 px-4 h-11 rounded-xl border border-white/15 bg-white/[0.04] text-white/60 text-xs tracking-[0.18em] uppercase hover:text-white hover:border-white/30 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <p className="text-amber-400 text-sm mb-4">
            Could not load trips — refresh to try again.
          </p>
        )}

        {trips.length === 0 ? (
          <div className="border border-[#1e3d28] rounded-xl py-16 text-center">
            <p className="text-white/30 text-sm">No trips yet.</p>
          </div>
        ) : (
          <>
            {/* Cards on a phone, a table from sm up. The same data either way —
                this is read on a phone as often as anywhere else. */}
            <div className="hidden sm:block border border-[#1e3d28] rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[46rem]">
                <thead>
                  <tr className="border-b border-[#1e3d28] text-left">
                    {['Trip', 'Code', 'Created', 'Lead email', 'Players', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-[10px] tracking-[0.2em] uppercase text-white/30 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trips.map(t => {
                    const state = tripState(t, today)
                    return (
                      <tr key={t.id} className="border-b border-[#1e3d28] last:border-0">
                        <td className="px-4 py-3 font-[family-name:var(--font-playfair)] text-base">
                          {t.name}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#C9A84C]">
                          {t.trip_code ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-white/50 whitespace-nowrap">
                          {formatDateTime(t.created_at)}
                        </td>
                        <td className="px-4 py-3 text-white/70 break-all">
                          {t.lead_email ?? <span className="text-white/20">—</span>}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-white/70">
                          {playerCount.get(t.id) ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill label={state.label} open={state.open} />
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
                  <div key={t.id} className="border border-[#1e3d28] rounded-xl px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-[family-name:var(--font-playfair)] text-base leading-tight truncate">
                          {t.name}
                        </p>
                        <p className="text-[#C9A84C] text-xs tabular-nums mt-0.5">
                          {t.trip_code ?? 'no code'}
                        </p>
                      </div>
                      <StatusPill label={state.label} open={state.open} />
                    </div>

                    <div className="mt-3 flex flex-col gap-1 text-xs">
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
      </div>
    </main>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="text-white/30 w-16 flex-shrink-0">{label}</span>
      <span className={value ? 'text-white/70 break-all' : 'text-white/20'}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function StatusPill({ label, open }: { label: string; open: boolean }) {
  return (
    <span
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] tracking-[0.15em] uppercase ${
        open
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-white/15 bg-white/[0.04] text-white/40'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-emerald-400' : 'bg-white/30'}`} />
      {label}
    </span>
  )
}
