import type { createAdminClient } from '@/lib/supabase-admin'
import { writeLeadEmail } from '@/lib/leadEmail'
import { actionStore } from '@/app/api/entry/store'
import type { CreateStore } from './create'

// The service-role store `/api/trip/create` runs on — and the club
// competition route (stage (d2)), which makes its event through exactly the
// same checks rather than a second copy of them.

export function createStore(db: ReturnType<typeof createAdminClient>): CreateStore {
  // The user the token names, kept for the member check — one read, not two.
  let user: { id: string; is_anonymous?: boolean; email?: string; email_confirmed_at?: string; confirmed_at?: string } | null = null
  // The club's own reads and writes, the organiser area's (Q3, D153).
  const clubs = actionStore(db)
  return {
    async userFromToken(t) {
      const { data, error } = await db.auth.getUser(t)
      user = error ? null : data.user ?? null
      return user?.id ?? null
    },
    async isMember(userId) {
      const u = user
      if (!u || u.id !== userId) return false
      return !u.is_anonymous && !!u.email && !!(u.email_confirmed_at ?? u.confirmed_at)
    },
    async insertTrip(row) {
      const { data, error } = await db.from('trips').insert(row).select('id').single()
      if (error || !data) return { error: { message: error?.message ?? 'No row came back.', code: error?.code } }
      return { id: (data as { id: string }).id }
    },
    async writeMembership(userId, tripId, m) {
      const { error } = await db.from('trip_members').upsert({
        user_id: userId, trip_id: tripId, role: m.role, player_id: m.playerId,
        organiser_until: m.organiserUntil, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,trip_id' })
      if (error) throw error
    },
    writeLeadEmail: (tripId, email) => writeLeadEmail(db, tripId, email),
    async deleteTrip(tripId) {
      await db.from('trips').delete().eq('id', tripId)
    },
    async recordOwner(userId, tripId) {
      const { data, error } = await db.auth.admin.getUserById(userId)
      const u = error ? null : data.user
      if (!u || u.is_anonymous || !u.email || !(u.email_confirmed_at ?? u.confirmed_at)) return
      const now = new Date().toISOString()
      const { error: e } = await db.from('trip_private')
        .upsert({ trip_id: tripId, owner_id: userId, owner_claimed_at: now, updated_at: now }, { onConflict: 'trip_id' })
      // Before migration 085 there is no owner column: the event is made all the same.
      if (e && e.code !== '42703' && e.code !== 'PGRST204') throw e
    },
    adminClubs: clubs.adminClubs,
    async setEventClub(tripId, clubId, access) { await clubs.setEventClub!(tripId, clubId, access) },
  }
}
