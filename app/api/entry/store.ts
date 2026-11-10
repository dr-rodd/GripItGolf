// The service-role store behind /api/entry (./entry.ts) — and behind any
// other route that checks an event's PIN on the server, which shares
// `entry_attempts` and its retry limit through `checkPin`.

import type { NextRequest } from 'next/server'
import type { createAdminClient } from '@/lib/supabase-admin'
import type { AttemptWindow, Membership } from '@/lib/membership'
import type { EntryStore } from './entry'

export function serviceStore(db: ReturnType<typeof createAdminClient>): EntryStore {
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
export function addressOf(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || req.headers.get('x-real-ip')?.trim() || 'unknown'
}
