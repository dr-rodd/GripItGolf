// The service-role store behind /api/account (./account.ts).

import { createHmac } from 'crypto'
import { readMemberHidden } from '@/lib/clubEvents'
import { missing095, writeMemberHidden } from '../club/notesStore'
import { createClient } from '@supabase/supabase-js'
import type { createAdminClient } from '@/lib/supabase-admin'
import type { AuthUser } from '@/lib/account'
import type { AttemptWindow, Membership } from '@/lib/membership'
import type { MyEvent } from '@/lib/account'
import { handicapStore } from '../handicaps/store'
import type { AccountStore } from './account'
import { serviceStore } from '../entry/store'
import { readSeason } from '../stats/season'
import { asRow, rowCols, withTicks, type RowRow } from '../club/rows'
import { clubMay, credentialsOf } from '@/lib/clubMay'

type Db = ReturnType<typeof createAdminClient>

export function asUser(u: {
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

/**
 * A phone's token checked here, without a round trip to Supabase Auth
 * (D195) — for the read-only home asks only. Where the project signs tokens
 * with its asymmetric keys, supabase-js checks the signature against the
 * project's published keys (fetched once, then kept by the server instance);
 * on a project still on the shared secret it asks Auth as before.
 *
 * What it gives up: a token stays good until it runs out (an hour at most)
 * even if that account signed out everywhere or was deleted meanwhile. Good
 * enough to read a home; every ask that changes something still asks Auth
 * (`userFromToken`). A confirmed email is read as an account's: Supabase
 * keeps an anonymous phone anonymous until its email is confirmed.
 */
export async function userFromClaims(db: Db, token: string): Promise<AuthUser | null> {
  try {
    const { data, error } = await db.auth.getClaims(token)
    if (error || !data?.claims?.sub) throw error ?? new Error('no claims')
    const c = data.claims as { sub: string; email?: string; is_anonymous?: boolean; app_metadata?: Record<string, unknown> }
    const anonymous = c.is_anonymous === true
    return {
      id: c.sub, isAnonymous: anonymous,
      email: c.email ? c.email.toLowerCase() : null,
      emailConfirmed: !anonymous && !!c.email,
      junior: c.app_metadata?.junior === true,
    }
  } catch {
    // The keys could not be read: Auth itself, as every other ask.
    const { data, error } = await db.auth.getUser(token)
    return error ? null : asUser(data.user)
  }
}

const asMembership = (r: { role: Membership['role']; player_id: string | null; organiser_until: string | null }): Membership =>
  ({ role: r.role, playerId: r.player_id, organiserUntil: r.organiser_until })

/**
 * The events of the verified clubs this account is on the list of, with the
 * club's name and whether the account runs them (owner or admin). Empty
 * before migration 086, or on any failed read — My events lists the rest.
 */
async function clubEvents(db: Db, userId: string): Promise<Map<string, { name: string; admin: boolean }>> {
  const out = new Map<string, { name: string; admin: boolean }>()
  const rows = await withTicks(t => db.from('club_members').select(rowCols(t)).eq('user_id', userId).is('removed_at', null))
  if (rows.error || !rows.data?.length) return out
  // Whether the account runs them: Officer (lib/clubMay.ts).
  const runs = new Map((rows.data as unknown as RowRow[]).map(r => [r.club_id, clubMay('run_events', { row: credentialsOf(asRow(r)) })]))
  const clubs = await db.from('clubs').select('id, name').in('id', [...runs.keys()]).not('verified_at', 'is', null)
  if (clubs.error || !clubs.data?.length) return out
  const names = new Map((clubs.data as { id: string; name: string }[]).map(c => [c.id, c.name]))
  const events = await db.from('trip_private').select('trip_id, club_id').in('club_id', [...names.keys()])
  if (events.error) return out
  for (const e of (events.data ?? []) as { trip_id: string; club_id: string }[]) {
    out.set(e.trip_id, { name: names.get(e.club_id) ?? '', admin: runs.get(e.club_id) ?? false })
  }
  return out
}

export function accountStore(db: Db): AccountStore {
  return {
    readerFromToken: token => userFromClaims(db, token),
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
    async soleOwnerOf(userId) {
      const mine = await db.from('club_members').select('club_id').eq('user_id', userId).eq('role', 'owner').is('removed_at', null)
      // Before migration 086 there are no clubs to hand on.
      if (mine.error || !mine.data?.length) return []
      const ids = (mine.data as { club_id: string }[]).map(r => r.club_id)
      const [owners, clubs] = await Promise.all([
        db.from('club_members').select('club_id').in('club_id', ids).eq('role', 'owner').is('removed_at', null),
        db.from('clubs').select('id, name').in('id', ids),
      ])
      if (owners.error || clubs.error) throw owners.error ?? clubs.error
      const count = new Map<string, number>()
      for (const r of (owners.data ?? []) as { club_id: string }[]) count.set(r.club_id, (count.get(r.club_id) ?? 0) + 1)
      return ((clubs.data ?? []) as { id: string; name: string }[]).filter(c => (count.get(c.id) ?? 0) <= 1).map(c => c.name)
    },
    async homeClubs(userId) {
      const rows = await db.from('club_members').select('club_id').eq('user_id', userId).is('removed_at', null)
      // Before migration 086 there are no clubs: a Dot member.
      if (rows.error || !rows.data?.length) return []
      const { data } = await db.from('clubs').select('slug, name')
        .in('id', (rows.data as { club_id: string }[]).map(r => r.club_id)).not('verified_at', 'is', null).order('name')
      return ((data ?? []) as { slug: string; name: string }[]).map(c => ({ slug: c.slug, name: c.name }))
    },
    handicaps: handicapStore(db),
    // Stage (m): the account's gender and date of birth (094's
    // account_details, else a linked row's own) and its membership at each
    // verified club — null before 094.
    async detailsOf(userId) {
      const [acct, rows] = await Promise.all([
        db.from('account_details').select('gender, birth_date').eq('user_id', userId).maybeSingle(),
        db.from('club_members').select('club_id, category_id, gender, birth_date').eq('user_id', userId).is('removed_at', null),
      ])
      if (rows.error) return null
      const list = (rows.data ?? []) as { club_id: string; category_id: string | null; gender: 'M' | 'F' | null; birth_date: string | null }[]
      const a = acct.error ? null : acct.data as { gender: 'M' | 'F' | null; birth_date: string | null } | null
      const catIds = [...new Set(list.map(r => r.category_id).filter((x): x is string => !!x))]
      const [clubs, cats] = await Promise.all([
        list.length ? db.from('clubs').select('id, name').in('id', list.map(r => r.club_id)).not('verified_at', 'is', null) : Promise.resolve({ data: [] }),
        catIds.length ? db.from('club_categories').select('id, name, days').in('id', catIds) : Promise.resolve({ data: [] }),
      ])
      const clubName = new Map(((clubs.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
      const cat = new Map(((cats.data ?? []) as { id: string; name: string; days: number[] }[]).map(c => [c.id, c]))
      return {
        gender: a?.gender ?? list.find(r => r.gender)?.gender ?? null,
        birthDate: a?.birth_date ?? list.find(r => r.birth_date)?.birth_date ?? null,
        memberships: list.filter(r => clubName.has(r.club_id) && r.category_id && cat.has(r.category_id))
          .map(r => ({ club: clubName.get(r.club_id)!, name: cat.get(r.category_id!)!.name, days: cat.get(r.category_id!)!.days ?? [] })),
      }
    },
    // Stage c1 (095): "From my clubs, show me".
    async eventHidden(userId) {
      const { data, error } = await db.from('account_event_prefs').select('hidden_types').eq('user_id', userId).maybeSingle()
      if (error) return missing095(error) ? null : []
      return readMemberHidden((data as { hidden_types?: unknown } | null)?.hidden_types)
    },
    async setEventHidden(userId, types) {
      await writeMemberHidden(db, userId, types)
    },
    async seasonFor(userId, year) {
      return readSeason(db, userId, year)
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
      const [owned, entered, linked, clubbed] = await Promise.all([
        db.from('trip_private').select('trip_id').eq('owner_id', userId),
        db.from('trip_members').select('trip_id').eq('user_id', userId),
        db.from('account_players').select('trip_id, player_id').eq('user_id', userId),
        clubEvents(db, userId),
      ])
      if (entered.error) throw entered.error
      const ownedIds = new Set(((owned.error ? [] : owned.data) ?? []).map(r => (r as { trip_id: string }).trip_id))
      const links = new Map(((linked.error ? [] : linked.data) ?? []).map(r => {
        const x = r as { trip_id: string; player_id: string }
        return [x.trip_id, x.player_id] as const
      }))
      // D120: a club's events are in its people's one list; its admins run them.
      for (const [tripId, c] of clubbed) if (c.admin) ownedIds.add(tripId)
      const ids = [...new Set([...ownedIds, ...links.keys(), ...clubbed.keys(), ...(entered.data ?? []).map(r => (r as { trip_id: string }).trip_id)])]
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
            club: clubbed.get(t.id)?.name ?? null,
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
