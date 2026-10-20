import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { playerCookieName, readPlayerId } from '@/lib/playerCookie'
import { parseLeagueSetup } from '@/lib/leagueSetup'
import {
  type ClubAccess, type GolfIrelandRules, type MemberLink, readsGolfIreland,
} from '@/lib/golfIreland'
import { TRIP_CODE } from '../run/runner'

/**
 * The questions every Golf Ireland route asks first — which league, which
 * player, which clubs, which links — answered once, on the service role.
 * The four Golf Ireland tables are closed to the browser (migration 056),
 * so this is the only way anything reads them.
 *
 * The player is **the one this phone claimed**: the player cookie, matched
 * against the league's roster. The platform's soft identity
 * (lib/currentPlayer.ts) — not a security boundary, which is why no card is
 * read for a link until the organiser has confirmed it.
 */

export type GiTrip = { id: string; trip_code: string; start_date: string | null; end_date: string | null }
export type LoadedLeague = { trip: GiTrip; rules: GolfIrelandRules }

/** The league with this code if it reads Golf Ireland; null for a bad code or any other event. */
export async function loadLeague(admin: SupabaseClient, tripCodeRaw: unknown): Promise<LoadedLeague | null> {
  const tripCode = String(tripCodeRaw ?? '').toUpperCase().trim()
  if (!TRIP_CODE.test(tripCode)) return null
  const [tripRes, setupRes] = await Promise.all([
    admin.from('trips').select('id, trip_code, start_date, end_date').eq('trip_code', tripCode).single(),
    admin.from('trips').select('bracket_setup').eq('trip_code', tripCode).single(),
  ])
  const trip = tripRes.data as GiTrip | null
  const setup = parseLeagueSetup((setupRes.data as { bracket_setup?: unknown } | null)?.bracket_setup)
  if (!trip || !setup?.golfIreland || !readsGolfIreland(setup.scoreSource)) return null
  return { trip, rules: setup.golfIreland }
}

/** The player this phone claimed in this league, or null. */
export async function cookiePlayer(admin: SupabaseClient, trip: GiTrip): Promise<string | null> {
  const jar = await cookies()
  const playerId = readPlayerId(jar.get(playerCookieName(trip.trip_code))?.value)
  if (!playerId) return null
  const { data } = await admin.from('players').select('id')
    .eq('id', playerId).eq('trip_id', trip.id).maybeSingle()
  return data ? playerId : null
}

type ClubRow = { club_id: string; name: string; granted_at: string; withdrawn_at: string | null }

/** Clubs as `clubIssue` reads them. Withdrawn ones included — the reason is theirs to say. */
export async function loadClubs(admin: SupabaseClient, ids?: readonly string[]): Promise<ClubAccess[]> {
  let q = admin.from('golf_ireland_clubs').select('club_id, name, granted_at, withdrawn_at')
  if (ids) q = q.in('club_id', [...ids])
  const { data, error } = await q.order('name')
  if (error) throw error
  return ((data ?? []) as ClubRow[]).map(c => ({
    clubId: c.club_id, name: c.name, grantedAt: c.granted_at, withdrawnAt: c.withdrawn_at,
  }))
}

type LinkRow = {
  player_id: string; member_id: string; consented_at: string; confirmed_at: string | null
  golf_ireland_members: { club_id: string; name: string } | { club_id: string; name: string }[] | null
}

export type StoredLink = MemberLink & { memberName: string }

/** Every link in this league, with the member's club and name. */
export async function loadLinks(admin: SupabaseClient, tripId: string): Promise<StoredLink[]> {
  const { data, error } = await admin
    .from('golf_ireland_links')
    .select('player_id, member_id, consented_at, confirmed_at, golf_ireland_members(club_id, name)')
    .eq('trip_id', tripId)
  if (error) throw error
  return ((data ?? []) as unknown as LinkRow[]).map(r => {
    const m = Array.isArray(r.golf_ireland_members) ? r.golf_ireland_members[0] : r.golf_ireland_members
    return {
      playerId: r.player_id,
      memberId: r.member_id,
      clubId: m?.club_id ?? '',
      memberName: m?.name ?? '',
      consentedAt: r.consented_at,
      confirmedAt: r.confirmed_at,
    }
  })
}

/**
 * A player's link and every card read for it, gone — unlinking, a refused
 * request, the club withdrawing. The cards first and explicitly: nothing
 * cascades from a link row, and a card left behind would still count.
 */
export async function removeLink(admin: SupabaseClient, tripId: string, playerId: string): Promise<void> {
  const cards = await admin.from('golf_ireland_cards').delete().eq('trip_id', tripId).eq('player_id', playerId)
  if (cards.error) throw cards.error
  const link = await admin.from('golf_ireland_links').delete().eq('trip_id', tripId).eq('player_id', playerId)
  if (link.error) throw link.error
}
