// The service-role store behind /api/entry (./entry.ts) — and behind any
// other route that checks an event's PIN on the server, which shares
// `entry_attempts` and its retry limit through `checkPin`.

import { parseClubAccess } from '@/lib/clubs'
import { retagSummaries } from '../stats/retag'
import type { NextRequest } from 'next/server'
import type { createAdminClient } from '@/lib/supabase-admin'
import { fieldOpenEnded, type AttemptWindow, type Membership } from '@/lib/membership'
import type { EntryStore, EntryTrip } from './entry'
import type { ActionStore } from '../event/actions'

/**
 * The club an event belongs to, who changes it, and the accounts that run
 * it through the club — a verified club's owners and admins, linked and not
 * removed (D139). Fail-soft: before migration 086, or on a failed read, no
 * club.
 */
export async function eventClub(db: ReturnType<typeof createAdminClient>, tripId: string): Promise<Pick<EntryTrip, 'clubId' | 'clubName' | 'clubAccess' | 'clubAdminIds'>> {
  const none = { clubId: null, clubName: null, clubAccess: null, clubAdminIds: [] }
  const priv = await db.from('trip_private').select('club_id, club_access').eq('trip_id', tripId).maybeSingle()
  const p = (priv.error ? null : priv.data) as { club_id?: string | null; club_access?: string | null } | null
  if (!p?.club_id) return none
  const [club, admins] = await Promise.all([
    db.from('clubs').select('name, verified_at').eq('id', p.club_id).maybeSingle(),
    db.from('club_members').select('user_id').eq('club_id', p.club_id).in('role', ['owner', 'admin'])
      .is('removed_at', null).not('user_id', 'is', null),
  ])
  const c = (club.error ? null : club.data) as { name?: string; verified_at?: string | null } | null
  return {
    clubId: p.club_id,
    clubName: c?.name ?? null,
    clubAccess: parseClubAccess(p.club_access),
    clubAdminIds: c?.verified_at && !admins.error ? ((admins.data ?? []) as { user_id: string }[]).map(r => r.user_id) : [],
  }
}

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
      // The public PIN, and what says whether the field may still add
      // rounds, each in its own query, as the trip layout reads them
      // (kind.ts): columns the main select must never depend on.
      const row = data as { id: string; end_date: string | null; settings_passcode_hash: string | null }
      // The owner and D107's answer (migration 085) in a query of their own
      // too: before 085 there is no owner, and nothing changes.
      const [pub, shape, priv, club, comp] = await Promise.all([
        db.from('trips').select('public_passcode_hash').eq('id', row.id).maybeSingle(),
        db.from('trips').select('kind, bracket_setup, event_permissions').eq('id', row.id).maybeSingle(),
        db.from('trip_private').select('owner_id, settings_by').eq('trip_id', row.id).maybeSingle(),
        // The event's club (migration 086) in a query of its own: before
        // 086 there is no club, and nothing changes.
        eventClub(db, row.id),
        // A club competition (089) in a query of its own: none before it.
        db.from('trips').select('competition').eq('id', row.id).maybeSingle(),
      ])
      const p = (priv.error ? null : priv.data) as { owner_id?: string | null; settings_by?: string | null } | null
      const s = (shape.error ? null : shape.data) as { kind?: unknown; bracket_setup?: unknown; event_permissions?: unknown } | null
      return {
        id: row.id,
        code,
        endDate: row.end_date ?? null,
        adminHash: row.settings_passcode_hash || null,
        publicHash: pub.error ? null : ((pub.data as { public_passcode_hash?: string | null } | null)?.public_passcode_hash || null),
        openEnded: fieldOpenEnded({ kind: s?.kind, bracketSetup: s?.bracket_setup, eventPermissions: s?.event_permissions }),
        ownerId: p?.owner_id ?? null,
        settingsBy: p?.settings_by === 'owner' || p?.settings_by === 'anyone' ? p.settings_by : null,
        ...club,
        competition: !comp.error && (comp.data as { competition?: string | null } | null)?.competition === 'club',
      }
    },
    async bookedPlayer(tripId, clubId, userId) {
      // Every read fails soft: before 089 nobody is booked from a list.
      const rows = await db.from('club_members').select('id').eq('club_id', clubId).eq('user_id', userId).is('removed_at', null)
      const ids = rows.error ? [] : (rows.data ?? []).map(r => (r as { id: string }).id)
      if (!ids.length) return null
      const ps = await db.from('players').select('id').eq('trip_id', tripId).in('club_member_id', ids)
      const pids = ps.error ? [] : (ps.data ?? []).map(r => (r as { id: string }).id)
      if (!pids.length) return null
      const ta = await db.from('tee_assignments').select('player_id').eq('trip_id', tripId).in('player_id', pids).limit(1)
      return ta.error ? null : ((ta.data ?? [])[0] as { player_id?: string } | undefined)?.player_id ?? null
    },
    async linkPlayer(userId, tripId, playerId) {
      // Only a Green Dot member — a confirmed email, never an anonymous phone.
      const { data, error } = await db.auth.admin.getUserById(userId)
      const u = error ? null : data.user
      if (!u || u.is_anonymous || !u.email || !(u.email_confirmed_at ?? u.confirmed_at)) return
      // One account per player: somebody else's link is left alone (UNIQUE
      // player_id refuses it anyway). One player per account per event: a new
      // claim replaces this account's old one here.
      const { data: held } = await db.from('account_players').select('user_id').eq('player_id', playerId).maybeSingle()
      const holder = (held as { user_id?: string } | null)?.user_id
      if (holder && holder !== userId) return
      const { error: e } = await db.from('account_players')
        .upsert({ user_id: userId, trip_id: tripId, player_id: playerId, linked_at: new Date().toISOString() }, { onConflict: 'user_id,trip_id' })
      if (e && e.code !== '23505' && e.code !== '42P01' && e.code !== 'PGRST205') throw e
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
    async upgradePin(tripId, kind, hash) {
      const column = kind === 'admin' ? 'settings_passcode_hash' : 'public_passcode_hash'
      const { error } = await db.from('trips').update({ [column]: hash }).eq('id', tripId)
      if (error) throw error
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

/** The same store, with the event row's own reads and writes (../event/actions.ts). */
export function actionStore(db: ReturnType<typeof createAdminClient>): ActionStore {
  return {
    ...serviceStore(db),
    async adminClubs(userId) {
      const rows = await db.from('club_members').select('club_id').eq('user_id', userId)
        .in('role', ['owner', 'admin']).is('removed_at', null)
      // Before migration 086 nobody runs a club.
      if (rows.error || !rows.data?.length) return []
      const { data, error } = await db.from('clubs').select('id, name')
        .in('id', (rows.data as { club_id: string }[]).map(r => r.club_id)).not('verified_at', 'is', null).order('name')
      if (error) throw error
      return (data ?? []) as { id: string; name: string }[]
    },
    async clubMember(tripId, userId) {
      // Fails soft: before 086 no event is a club's.
      const priv = await db.from('trip_private').select('club_id').eq('trip_id', tripId).maybeSingle()
      const clubId = priv.error ? null : (priv.data as { club_id?: string | null } | null)?.club_id
      if (!clubId) return false
      const [club, row] = await Promise.all([
        db.from('clubs').select('verified_at').eq('id', clubId).maybeSingle(),
        db.from('club_members').select('id').eq('club_id', clubId).eq('user_id', userId).is('removed_at', null).limit(1),
      ])
      const verified = !club.error && !!(club.data as { verified_at?: string | null } | null)?.verified_at
      return verified && !row.error && (row.data ?? []).length > 0
    },
    async setEventClub(tripId, clubId, access) {
      const now = new Date().toISOString()
      const { error } = await db.from('trip_private')
        .upsert({ trip_id: tripId, club_id: clubId, club_access: access, updated_at: now }, { onConflict: 'trip_id' })
      if (error) throw error
      // Its signed cards told whether they are club rounds now (D122).
      await retagSummaries(db, [tripId]).catch(e => console.error('summary retag failed:', e))
    },
    async tripColumns(tripId, columns) {
      const { data, error } = await db.from('trips').select(columns.join(', ')).eq('id', tripId).maybeSingle()
      return error || !data ? null : (data as unknown as Record<string, unknown>)
    },
    async updateTrip(tripId, patch) {
      const { error } = await db.from('trips').update(patch).eq('id', tripId)
      if (error) throw error
    },
    async leadPlayerId(tripId) {
      const { data, error } = await db.from('players')
        .select('id').eq('trip_id', tripId).eq('is_lead', true).limit(1).maybeSingle()
      return error || !data ? null : (data as { id: string }).id
    },
    async playerLinks(tripId) {
      const { data, error } = await db.from('account_players').select('player_id').eq('trip_id', tripId)
      // Before migration 085 nobody is linked.
      if (error) return []
      const ids = ((data ?? []) as { player_id: string }[]).map(r => r.player_id)
      if (ids.length === 0) return []
      const { data: ps, error: e } = await db.from('players').select('id, name').in('id', ids)
      if (e) throw e
      return ((ps ?? []) as { id: string; name: string }[]).sort((a, b) => a.name.localeCompare(b.name))
    },
    async removePlayerLink(tripId, playerId) {
      const { error } = await db.from('account_players').delete().eq('trip_id', tripId).eq('player_id', playerId)
      if (error) throw error
    },
    async endOrganisers(tripId) {
      const { error } = await db.from('trip_members')
        .update({ organiser_until: null, updated_at: new Date().toISOString() })
        .eq('trip_id', tripId).not('organiser_until', 'is', null)
      if (error) throw error
    },
  }
}
