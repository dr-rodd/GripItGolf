import type { createAdminClient } from '@/lib/supabase-admin'
import { myClubMatch, readClubMatchPlay, type ClubMatchPlay, type MyClubMatch } from '@/lib/clubMatchPlay'
import { drawDeadlines } from '@/lib/bracketSetup'
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

/**
 * This list row's place in each of a club's match plays (stage 3, D266) —
 * one read of the draws, their players and their deadlines, for the
 * members home's Matches and next match. Every read fails soft: nothing
 * drawn, nothing to show.
 */
export async function readMyClubMatches(db: Db, rowId: string, codes: string[]): Promise<MyClubMatch[]> {
  if (!codes.length) return []
  const { data: ts } = await db.from('trips').select('id, trip_code, name, bracket_setup').in('trip_code', codes)
  const trips = (ts ?? []) as { id: string; trip_code: string; name: string; bracket_setup: unknown }[]
  if (!trips.length) return []
  const ids = trips.map(t => t.id)
  const [{ data: mine }, { data: ms }] = await Promise.all([
    db.from('players').select('id, trip_id').in('trip_id', ids).eq('club_member_id', rowId),
    db.from('matchplay_matches').select('id, trip_id, round_number, round_name, player_a_id, player_b_id, winner_player_id, result').in('trip_id', ids),
  ])
  const meOf = new Map(((mine ?? []) as { id: string; trip_id: string }[]).map(p => [p.trip_id, p.id]))
  const rows = (ms ?? []) as { id: string; trip_id: string; round_number: number; round_name: string; player_a_id: string | null; player_b_id: string | null; winner_player_id: string | null; result: string | null }[]
  const others = [...new Set(rows.filter(r => meOf.get(r.trip_id) && (r.player_a_id === meOf.get(r.trip_id) || r.player_b_id === meOf.get(r.trip_id)))
    .flatMap(r => [r.player_a_id, r.player_b_id]).filter((x): x is string => !!x))]
  const { data: ps } = others.length ? await db.from('players').select('id, name').in('id', others) : { data: [] }
  const names = Object.fromEntries(((ps ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
  const out: MyClubMatch[] = []
  for (const t of trips) {
    const me = meOf.get(t.id)
    if (!me) continue
    const inTrip = rows.filter(r => r.trip_id === t.id)
    const rounds = [...new Set(inTrip.map(r => r.round_number))].sort((a, b) => a - b)
    const deadlines = drawDeadlines(readClubMatchPlay(t.bracket_setup)?.deadlines ?? [], rounds.length)
    const m = myClubMatch({ code: t.trip_code, name: t.name }, inTrip.map(r => ({
      id: r.id, roundNumber: r.round_number, roundName: r.round_name, sideA: r.player_a_id, sideB: r.player_b_id,
      winner: r.winner_player_id, result: r.result, deadline: deadlines[rounds.indexOf(r.round_number)] ?? null,
    })), me, names)
    if (m) out.push(m)
  }
  // Matches to play first, soonest due first; then results.
  return out.sort((a, b) => Number(a.state !== 'next') - Number(b.state !== 'next') || (a.playBy ?? '9999').localeCompare(b.playBy ?? '9999'))
}
