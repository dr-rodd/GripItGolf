// The address an event was made with — row-level security, stage 5 (D62;
// Ross, 11 Nov 2026). **Server only**, on the service role: from migration
// 078 it lives in `trip_private`, a table no phone can read, instead of on
// `trips`, which every member reads. Before 078 the table is not there and
// both halves fall back to `trips.lead_email`, so the code can deploy first.
//
// Four readers — the confirmation email, Forgot PIN, the admin trips list —
// and one writer, `/api/trip/create`. Never imported by a browser file
// (`test:client-boundary`).

import type { createAdminClient } from './supabase-admin'

type Db = ReturnType<typeof createAdminClient>

/** No such table (Postgres 42P01, PostgREST PGRST205): migration 078 is not in yet. */
function noTable(error: { code?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205')
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** One event's address, or null. */
export async function readLeadEmail(db: Db, tripId: string): Promise<string | null> {
  const { data, error } = await db.from('trip_private').select('lead_email').eq('trip_id', tripId).maybeSingle()
  if (!error) {
    const kept = clean((data as { lead_email?: unknown } | null)?.lead_email)
    if (kept) return kept
  } else if (!noTable(error)) {
    throw error
  }
  // Before 078, or a row made before it and not yet moved: the old column,
  // fail-soft in its own query (it is gone from phones once 078 is in).
  const old = await db.from('trips').select('lead_email').eq('id', tripId).maybeSingle()
  return old.error ? null : clean((old.data as { lead_email?: unknown } | null)?.lead_email)
}

/** Every event's address, for the admin list — one query each, keyed by trip id. */
export async function readAllLeadEmails(db: Db): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const old = await db.from('trips').select('id, lead_email').not('lead_email', 'is', null)
  if (!old.error) for (const r of (old.data ?? []) as { id: string; lead_email: unknown }[]) {
    const e = clean(r.lead_email); if (e) out.set(r.id, e)
  }
  const kept = await db.from('trip_private').select('trip_id, lead_email')
  if (!kept.error) for (const r of (kept.data ?? []) as { trip_id: string; lead_email: unknown }[]) {
    const e = clean(r.lead_email); if (e) out.set(r.trip_id, e)
  }
  return out
}

/** Keep a new event's address where no phone can read it — on the old column only before 078. */
export async function writeLeadEmail(db: Db, tripId: string, email: string): Promise<void> {
  const { error } = await db.from('trip_private')
    .upsert({ trip_id: tripId, lead_email: email, updated_at: new Date().toISOString() }, { onConflict: 'trip_id' })
  if (!error) return
  if (!noTable(error)) throw error
  const old = await db.from('trips').update({ lead_email: email }).eq('id', tripId)
  if (old.error) throw old.error
}
