import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { entryCookie } from '@/lib/publicPin'
import type { AttemptWindow, Membership } from '@/lib/membership'
import { runEntry, type EntryStore } from './entry'

// GET  /api/entry — is migration 068 in? The browser signs nobody in until it
//      is (lib/entryClient.ts): a signed-in phone is the `authenticated` role,
//      and the match play card tables answer that role only once 068 has
//      granted it. Checks `entry_attempts`, the last table 068 makes, which
//      it makes after the grants.
// POST /api/entry — enter an event: `{ code, playerId?, adminPin?, publicPin? }`
//      with the phone's Supabase token as `Authorization: Bearer …`. The rules
//      are ./entry.ts; this file is the service-role store and the plumbing.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    const db = createAdminClient()
    const { error } = await db.from('entry_attempts').select('key', { head: true, count: 'exact' }).limit(1)
    return NextResponse.json({ ready: !error }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ ready: false }, { headers: NO_STORE })
  }
}

function serviceStore(db: ReturnType<typeof createAdminClient>): EntryStore {
  return {
    async userFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      return error ? null : data.user?.id ?? null
    },
    async tripByCode(code) {
      const { data, error } = await db.from('trips')
        .select('id, end_date, settings_passcode_hash').eq('trip_code', code).maybeSingle()
      if (error || !data) return null
      // The public PIN in its own query, as the trip layout reads it
      // (kind.ts): a column the main select must never depend on.
      const pub = await db.from('trips').select('public_passcode_hash').eq('id', data.id).maybeSingle()
      const row = data as { id: string; end_date: string | null; settings_passcode_hash: string | null }
      return {
        id: row.id,
        endDate: row.end_date ?? null,
        adminHash: row.settings_passcode_hash || null,
        publicHash: pub.error ? null : ((pub.data as { public_passcode_hash?: string | null } | null)?.public_passcode_hash || null),
      }
    },
    async claimedPlayer(tripId, playerId) {
      const { data, error } = await db.from('players')
        .select('id, claimed').eq('trip_id', tripId).eq('id', playerId).maybeSingle()
      return !error && (data as { claimed?: boolean | null } | null)?.claimed === true
    },
    async readMembership(userId, tripId) {
      const { data, error } = await db.from('trip_members')
        .select('role, player_id, organiser_until').eq('trip_id', tripId).eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (!data) return null
      const r = data as { role: Membership['role']; player_id: string | null; organiser_until: string | null }
      return { role: r.role, playerId: r.player_id, organiserUntil: r.organiser_until }
    },
    async writeMembership(userId, tripId, m) {
      const { error } = await db.from('trip_members').upsert({
        user_id: userId, trip_id: tripId, role: m.role, player_id: m.playerId,
        organiser_until: m.organiserUntil, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,trip_id' })
      if (error) throw error
    },
    async readAttempts(keys) {
      const out = new Map<string, AttemptWindow>()
      const { data, error } = await db.from('entry_attempts')
        .select('key, failures, window_started').in('key', keys)
      if (error) throw error
      for (const r of (data ?? []) as { key: string; failures: number; window_started: string }[]) {
        out.set(r.key, { failures: r.failures, windowStarted: r.window_started })
      }
      return out
    },
    async writeAttempt(key, tripId, w) {
      const { error } = await db.from('entry_attempts').upsert(
        { key, trip_id: tripId, failures: w.failures, window_started: w.windowStarted },
        { onConflict: 'key' })
      if (error) throw error
    },
  }
}

/** The caller's address as Vercel hands it on: the first hop. Only ever stored hashed. */
function addressOf(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'No event code.' }, { status: 400, headers: NO_STORE })
  }
  const auth = req.headers.get('authorization') ?? ''
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1] ?? null
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''

  try {
    const db = createAdminClient()
    const out = await runEntry({
      token,
      code: body.code,
      playerId: body.playerId,
      adminPin: body.adminPin,
      publicPin: body.publicPin,
      entryCookie: code ? req.cookies.get(entryCookie(code))?.value ?? null : null,
      address: addressOf(req),
    }, serviceStore(db), new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('entry failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not enter — try again.' }, { status: 503, headers: NO_STORE })
  }
}
