// The service-role store behind /api/account (./account.ts).

import { createHmac } from 'crypto'
import type { createAdminClient } from '@/lib/supabase-admin'
import type { AuthUser } from '@/lib/account'
import type { Membership } from '@/lib/membership'
import type { AccountStore } from './account'

type Db = ReturnType<typeof createAdminClient>

function asUser(u: {
  id: string; is_anonymous?: boolean | null; email?: string | null
  email_confirmed_at?: string | null; confirmed_at?: string | null
} | null | undefined): AuthUser | null {
  if (!u) return null
  return {
    id: u.id,
    isAnonymous: u.is_anonymous === true,
    email: u.email ? u.email.toLowerCase() : null,
    emailConfirmed: !!(u.email_confirmed_at ?? u.confirmed_at),
  }
}

const asMembership = (r: { role: Membership['role']; player_id: string | null; organiser_until: string | null }): Membership =>
  ({ role: r.role, playerId: r.player_id, organiserUntil: r.organiser_until })

export function accountStore(db: Db): AccountStore {
  return {
    async userFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      return error ? null : asUser(data.user)
    },
    async userById(id) {
      const { data, error } = await db.auth.admin.getUserById(id)
      if (error) {
        if (error.status === 404) return null
        throw error
      }
      return asUser(data.user)
    },
    async membershipsOf(userId) {
      const { data, error } = await db.from('trip_members')
        .select('trip_id, role, player_id, organiser_until').eq('user_id', userId)
      if (error) throw error
      return ((data ?? []) as { trip_id: string; role: Membership['role']; player_id: string | null; organiser_until: string | null }[])
        .map(r => ({ tripId: r.trip_id, m: asMembership(r) }))
    },
    async readMembership(userId, tripId) {
      const { data, error } = await db.from('trip_members')
        .select('role, player_id, organiser_until').eq('user_id', userId).eq('trip_id', tripId).maybeSingle()
      if (error) throw error
      return data ? asMembership(data as Parameters<typeof asMembership>[0]) : null
    },
    async writeMembership(userId, tripId, m) {
      const { error } = await db.from('trip_members').upsert({
        user_id: userId, trip_id: tripId, role: m.role, player_id: m.playerId,
        organiser_until: m.organiserUntil, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,trip_id' })
      if (error) throw error
    },
    async deleteUser(userId) {
      const { error } = await db.auth.admin.deleteUser(userId)
      if (error && error.status !== 404) throw error
    },
    ticketSecret() {
      // Its own key, made from the service-role key, so a ticket can never
      // pass for anything else sealed on this site.
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
      if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
      return createHmac('sha256', key).update('green-dot account merge ticket v1').digest('base64url')
    },
  }
}
