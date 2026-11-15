// The service-role store behind /api/account (./account.ts).

import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { createAdminClient } from '@/lib/supabase-admin'
import type { AuthUser } from '@/lib/account'
import type { AttemptWindow, Membership } from '@/lib/membership'
import type { MyEvent } from '@/lib/account'
import type { AccountStore } from './account'
import { serviceStore } from '../entry/store'

type Db = ReturnType<typeof createAdminClient>

function asUser(u: {
  id: string; is_anonymous?: boolean | null; email?: string | null
  email_confirmed_at?: string | null; confirmed_at?: string | null
  app_metadata?: Record<string, unknown> | null
} | null | undefined): AuthUser | null {
  if (!u) return null
  return {
    id: u.id,
    isAnonymous: u.is_anonymous === true,
    email: u.email ? u.email.toLowerCase() : null,
    emailConfirmed: !!(u.email_confirmed_at ?? u.confirmed_at),
    junior: u.app_metadata?.junior === true,
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

    // ─── Stage (a2): usernames, passwords, wrong tries (migration 084) ──

    async usernameOf(userId) {
      const { data, error } = await db.from('account_usernames').select('username').eq('user_id', userId).maybeSingle()
      if (error) throw error
      return (data as { username?: string } | null)?.username ?? null
    },
    async userIdByUsername(username) {
      const { data, error } = await db.from('account_usernames').select('user_id').eq('username', username).maybeSingle()
      if (error) throw error
      return (data as { user_id?: string } | null)?.user_id ?? null
    },
    async setUsername(userId, username) {
      const { error } = await db.from('account_usernames')
        .upsert({ user_id: userId, username, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (!error) return 'ok'
      if (error.code === '23505') return 'taken'
      throw error
    },
    async hasPassword(userId) {
      const { data, error } = await db.rpc('account_has_password', { uid: userId })
      if (error) throw error
      return data === true
    },
    async passwordSignIn(email, password) {
      // A client of its own, holding nothing between calls: the session it
      // makes is handed straight to the phone.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !anon) throw new Error('Missing Supabase environment variables')
      const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }).auth
      const { data, error } = await auth.signInWithPassword({ email, password })
      if (error || !data.session || !data.user) return null
      return { userId: data.user.id, accessToken: data.session.access_token, refreshToken: data.session.refresh_token }
    },
    async readAttempts(keys) {
      const out = new Map<string, AttemptWindow>()
      const { data, error } = await db.from('account_attempts').select('key, failures, window_started').in('key', keys)
      if (error) throw error
      for (const r of (data ?? []) as { key: string; failures: number; window_started: string }[]) {
        out.set(r.key, { failures: r.failures, windowStarted: r.window_started })
      }
      return out
    },
    async writeAttempt(key, w) {
      const { error } = await db.from('account_attempts')
        .upsert({ key, failures: w.failures, window_started: w.windowStarted }, { onConflict: 'key' })
      if (error) throw error
    },

    // ─── Stage (b1): owners and links (migration 085) ──────────

    async claimByEmail(userId, email) {
      if (!email) return 0
      const { data, error } = await db.rpc('claim_events_by_email', { uid: userId, email })
      // Best effort: My events still lists what it can.
      if (error) { console.error('claim by email failed:', error); return 0 }
      return typeof data === 'number' ? data : 0
    },
    async syncLinks(userId) {
      const { data, error } = await db.from('trip_members')
        .select('trip_id, player_id').eq('user_id', userId).not('player_id', 'is', null)
      if (error) return
      for (const r of (data ?? []) as { trip_id: string; player_id: string }[]) {
        const { data: held } = await db.from('account_players').select('user_id').eq('player_id', r.player_id).maybeSingle()
        const holder = (held as { user_id?: string } | null)?.user_id
        if (holder && holder !== userId) continue
        const { data: mine } = await db.from('account_players').select('player_id').eq('user_id', userId).eq('trip_id', r.trip_id).maybeSingle()
        // A link this account already has in the event stands: one player per
        // account per event, and unlinking takes it away deliberately.
        if (mine) continue
        await db.from('account_players').insert({ user_id: userId, trip_id: r.trip_id, player_id: r.player_id })
      }
    },
    async eventsFor(userId) {
      const [owned, entered, linked] = await Promise.all([
        db.from('trip_private').select('trip_id').eq('owner_id', userId),
        db.from('trip_members').select('trip_id').eq('user_id', userId),
        db.from('account_players').select('trip_id, player_id').eq('user_id', userId),
      ])
      if (entered.error) throw entered.error
      const ownedIds = new Set(((owned.error ? [] : owned.data) ?? []).map(r => (r as { trip_id: string }).trip_id))
      const links = new Map(((linked.error ? [] : linked.data) ?? []).map(r => {
        const x = r as { trip_id: string; player_id: string }
        return [x.trip_id, x.player_id] as const
      }))
      const ids = [...new Set([...ownedIds, ...links.keys(), ...(entered.data ?? []).map(r => (r as { trip_id: string }).trip_id)])]
      if (ids.length === 0) return []
      const [trips, players] = await Promise.all([
        db.from('trips').select('id, trip_code, name, kind, start_date, end_date').in('id', ids),
        links.size ? db.from('players').select('id, name').in('id', [...links.values()]) : Promise.resolve({ data: [], error: null }),
      ])
      if (trips.error) throw trips.error
      const names = new Map(((players.data ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
      return ((trips.data ?? []) as { id: string; trip_code: string; name: string; kind: string | null; start_date: string | null; end_date: string | null }[])
        .map((t): MyEvent => {
          const pid = links.get(t.id)
          return {
            code: t.trip_code,
            name: t.name,
            kind: t.kind === 'tournament' || t.kind === 'run' ? t.kind : 'trip',
            startDate: t.start_date,
            endDate: t.end_date,
            owned: ownedIds.has(t.id),
            player: pid ? { id: pid, name: names.get(pid) ?? '' } : null,
          }
        })
    },
    async unlinkPlayer(userId, code) {
      const { data } = await db.from('trips').select('id').eq('trip_code', code).maybeSingle()
      const id = (data as { id?: string } | null)?.id
      if (!id) return
      const { error } = await db.from('account_players').delete().eq('user_id', userId).eq('trip_id', id)
      if (error) throw error
    },
    async tripForClaim(code) {
      const { data, error } = await db.from('trips').select('id, settings_passcode_hash').eq('trip_code', code).maybeSingle()
      if (error || !data) return null
      const t = data as { id: string; settings_passcode_hash: string | null }
      const { data: p } = await db.from('trip_private').select('owner_id').eq('trip_id', t.id).maybeSingle()
      return { id: t.id, code, adminHash: t.settings_passcode_hash || null, ownerId: (p as { owner_id?: string | null } | null)?.owner_id ?? null }
    },
    async setOwner(tripId, userId) {
      const now = new Date().toISOString()
      // Only where nobody owns it: the update names owner_id IS NULL, so two
      // phones racing cannot both win.
      const { data, error } = await db.from('trip_private')
        .update({ owner_id: userId, owner_claimed_at: now, updated_at: now })
        .eq('trip_id', tripId).is('owner_id', null).select('trip_id')
      if (error) throw error
      if ((data ?? []).length === 1) return 'ok'
      const { data: row } = await db.from('trip_private').select('owner_id').eq('trip_id', tripId).maybeSingle()
      const owner = (row as { owner_id?: string | null } | null)?.owner_id
      if (row) return owner === userId ? 'ok' : 'taken'
      // No private row yet (an event made without an email): make one.
      const ins = await db.from('trip_private').insert({ trip_id: tripId, owner_id: userId, owner_claimed_at: now })
      if (!ins.error) return 'ok'
      if (ins.error.code === '23505') return 'taken'
      throw ins.error
    },
    pins: serviceStore(db),
  }
}
