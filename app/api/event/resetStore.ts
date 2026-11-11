// The service-role store behind Forgot PIN (./pinReset.ts) — `pin_resets`
// (migration 072), the event's row and its address, `trip_members`, and the
// email. Built on /api/entry's store so the memberships and the per-network
// counts are written exactly as everywhere else.

import { Resend } from 'resend'
import type { createAdminClient } from '@/lib/supabase-admin'
import { CONFIRMATION_FROM } from '@/lib/confirmationEmail'
import { serviceStore } from '../entry/store'
import type { ResetStore, ResetTrip } from './pinReset'

/** Longer than a healthy send, shorter than the function's own limit. */
const SEND_TIMEOUT_MS = 8_000

export function resetStore(db: ReturnType<typeof createAdminClient>): ResetStore {
  const base = serviceStore(db)

  async function trip(column: 'trip_code' | 'id', value: string): Promise<ResetTrip | null> {
    const { data, error } = await db.from('trips')
      .select('id, trip_code, name, lead_email').eq(column, value).maybeSingle()
    if (error || !data) return null
    const row = data as { id: string; trip_code: string; name: string; lead_email: string | null }
    // The kind and the public PIN in their own queries, fail-soft, as the
    // trip layout reads them: columns the main select must never depend on.
    const [k, pub] = await Promise.all([
      db.from('trips').select('kind').eq('id', row.id).maybeSingle(),
      db.from('trips').select('public_passcode_hash').eq('id', row.id).maybeSingle(),
    ])
    return {
      id: row.id,
      code: row.trip_code,
      name: row.name,
      kind: k.error ? null : ((k.data as { kind?: string | null } | null)?.kind ?? null),
      email: row.lead_email || null,
      publicHash: pub.error ? null : ((pub.data as { public_passcode_hash?: string | null } | null)?.public_passcode_hash || null),
    }
  }

  return {
    userFromToken: base.userFromToken,
    readMembership: base.readMembership,
    writeMembership: base.writeMembership,
    readAttempts: base.readAttempts,
    writeAttempt: base.writeAttempt,
    tripByCode: code => trip('trip_code', code),
    tripById: id => trip('id', id),
    async countResets(tripId, since) {
      const { count, error } = await db.from('pin_resets')
        .select('token_hash', { count: 'exact', head: true }).eq('trip_id', tripId).gte('created_at', since)
      if (error) throw error
      return count ?? 0
    },
    async insertReset(r) {
      const { error } = await db.from('pin_resets').insert({ token_hash: r.tokenHash, trip_id: r.tripId, expires_at: r.expiresAt })
      if (error) throw error
    },
    async findReset(tokenHash) {
      const { data, error } = await db.from('pin_resets')
        .select('trip_id, expires_at, used_at').eq('token_hash', tokenHash).maybeSingle()
      if (error) throw error
      if (!data) return null
      const r = data as { trip_id: string; expires_at: string; used_at: string | null }
      return { tripId: r.trip_id, expiresAt: r.expires_at, usedAt: r.used_at }
    },
    async claimReset(tokenHash, now) {
      const { data, error } = await db.from('pin_resets')
        .update({ used_at: now }).eq('token_hash', tokenHash).is('used_at', null).gt('expires_at', now)
        .select('token_hash')
      if (error) throw error
      return (data ?? []).length === 1
    },
    async setAdminHash(tripId, hash) {
      const { error } = await db.from('trips').update({ settings_passcode_hash: hash }).eq('id', tripId)
      if (error) throw error
    },
    async endOrganisers(tripId) {
      const { error } = await db.from('trip_members')
        .update({ organiser_until: null, updated_at: new Date().toISOString() })
        .eq('trip_id', tripId).not('organiser_until', 'is', null)
      if (error) throw error
    },
    async sendEmail(to, subject, html, text) {
      const key = process.env.RESEND_API_KEY
      if (!key) return false
      const send = new Resend(key).emails.send({ from: CONFIRMATION_FROM, to, subject, html, text })
      const result = await Promise.race([
        send,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('send timed out')), SEND_TIMEOUT_MS)),
      ])
      if (result.error) throw result.error
      return true
    },
  }
}
