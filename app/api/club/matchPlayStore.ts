import type { createAdminClient } from '@/lib/supabase-admin'
import { readClubMatchPlay, type ClubMatchPlay } from '@/lib/clubMatchPlay'
import { entryLine, readEntryRules, type EntryRules } from '@/lib/clubMembership'
import { readEntryRulesOf } from './entryRules'
import { readCategories } from './store'

// A club match play read on the service role (Ross, 17 Nov 2026) — the
// members' Summary and the Clubhouse's page both start here. A verified
// club's match play by its code, with its setup, its allowance, who may
// enter, how many have entered, and whether it is drawn or won — or null.

type Db = ReturnType<typeof createAdminClient>

export interface MatchPlayComp {
  tripId: string
  code: string
  name: string
  clubId: string
  publicHash: string | null
  setup: ClubMatchPlay
  allowance: number
  entryLine: string | null
  /** Who may enter (094's trip_private.entry_rules) — null, everybody. */
  entry: EntryRules | null
  entered: number
  drawn: boolean
  won: boolean
  qualifierName: string | null
  endDate: string | null
}

export async function readMatchPlayComp(db: Db, code: string): Promise<MatchPlayComp | null> {
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return null
  const { data: t, error } = await db.from('trips')
    .select('id, trip_code, name, competition, public_passcode_hash, bracket_setup, leaderboards, end_date').eq('trip_code', code).maybeSingle()
  const trip = (error ? null : t) as {
    id: string; trip_code: string; name: string; competition?: string | null; public_passcode_hash?: string | null
    bracket_setup?: unknown; leaderboards?: unknown; end_date: string | null
  } | null
  if (!trip || trip.competition !== 'club') return null
  const setup = readClubMatchPlay(trip.bracket_setup)
  if (!setup) return null
  const [{ data: priv }, entry, players, matches, qualifier] = await Promise.all([
    db.from('trip_private').select('club_id').eq('trip_id', trip.id).maybeSingle(),
    readEntryRulesOf(db, trip.id),
    db.from('players').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id),
    db.from('matchplay_matches').select('next_match_id, winner_player_id, winner_team_id').eq('trip_id', trip.id),
    setup.qualifierCode
      ? db.from('trips').select('name').eq('trip_code', setup.qualifierCode).maybeSingle().then(r => (r.data as { name: string } | null)?.name ?? null)
      : Promise.resolve(null),
  ])
  const clubId = (priv as { club_id?: string | null } | null)?.club_id
  if (!clubId) return null
  const [{ data: club }, cats] = await Promise.all([
    db.from('clubs').select('verified_at').eq('id', clubId).maybeSingle(),
    readCategories(db, clubId),
  ])
  if (!(club as { verified_at?: string | null } | null)?.verified_at) return null
  const rows = (matches.data ?? []) as { next_match_id: string | null; winner_player_id: string | null; winner_team_id?: string | null }[]
  const board = (Array.isArray(trip.leaderboards) ? trip.leaderboards : []).find(b => (b as { competition?: string }).competition === 'matchplay') as { handicapAllowance?: unknown } | undefined
  return {
    tripId: trip.id, code: trip.trip_code, name: trip.name, clubId, publicHash: trip.public_passcode_hash ?? null, setup,
    allowance: typeof board?.handicapAllowance === 'number' ? board.handicapAllowance : 100,
    entryLine: entryLine(readEntryRules(entry), cats),
    entry: readEntryRules(entry),
    entered: players.count ?? 0,
    drawn: rows.length > 0,
    won: rows.some(r => !r.next_match_id && !!(r.winner_player_id || r.winner_team_id)),
    qualifierName: qualifier,
    endDate: trip.end_date,
  }
}

/**
 * Each entrant's handicap made the one index as it stands (D179) — before a
 * club match play's draw, so "seeded by handicap index" seeds on today's
 * index rather than the one held when they entered. A row with an account
 * takes the account's, any other its own. Changes only those that differ.
 */
export async function refreshEntrantIndexes(db: Db, tripId: string): Promise<number> {
  const { data: ps, error } = await db.from('players').select('id, handicap, club_member_id').eq('trip_id', tripId).not('club_member_id', 'is', null)
  if (error || !ps?.length) return 0
  const players = ps as { id: string; handicap: number | null; club_member_id: string }[]
  const { data: rs } = await db.from('club_members').select('id, user_id, handicap_index').in('id', players.map(p => p.club_member_id))
  const rows = new Map(((rs ?? []) as { id: string; user_id: string | null; handicap_index: unknown }[]).map(r => [r.id, r]))
  const users = [...new Set([...rows.values()].map(r => r.user_id).filter((u): u is string => !!u))]
  const { data: hs } = users.length ? await db.from('account_handicaps').select('user_id, handicap_index').in('user_id', users) : { data: [] }
  const account = new Map(((hs ?? []) as { user_id: string; handicap_index: unknown }[]).map(h => [h.user_id, h.handicap_index]))
  const num = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  let changed = 0
  for (const p of players) {
    const r = rows.get(p.club_member_id)
    if (!r) continue
    const now = r.user_id ? num(account.get(r.user_id)) : num(r.handicap_index)
    if (now === (p.handicap === null ? null : Number(p.handicap))) continue
    const { error: e } = await db.from('players').update({ handicap: now }).eq('id', p.id)
    if (!e) changed++
  }
  return changed
}
