/**
 * /api/interclub — an interclub tie set up and run by the clubs' team
 * captains (D352–D362, docs/interclub.md). The logic, on a store it is
 * handed (`store.ts` is the service role's), so `test:interclub-tie` runs
 * it against a stand-in. The rules are lib/interclubTie.ts's; this asks
 * them and reads and writes.
 *
 * Every captain's write is the server's, on the service role: a tie's
 * players, its matches' sides, a result settled by hand, the playoff. So the
 * event's own row-level security is never widened — and anybody with the
 * event's link still scores its matches on its own pages, as a member of any
 * event does (`score_session_matches`).
 */

import { clubMay, credentialsOf } from '@/lib/clubMay'
import { isAccount, type AuthUser } from '@/lib/account'
import { irishToday } from '@/lib/clubs'
import { NO_FORMATS } from '@/lib/formats'
import { toItemRow } from '@/lib/itinerarySync'
import { readIndex } from '@/lib/handicapIndex'
import { PROVINCES, type ProvinceKey } from '@/lib/interclub'
import {
  TIE_COLOURS, TIE_PERMISSIONS, MAX_SIDE_PLAYERS, clubOf, clubSide, drawNameIssue, drawNameOf, formatIssue,
  maySide, mayRun, playerIssue, playoffIssue, readFormat, settleIssue, sideIssue, takeableSide, tieBoards,
  tieName, tieOutcome, tieScore, withPlayoff, type Settled, type Side, type TieFormat, type TieMatch,
} from '@/lib/interclubTie'
import { runCreate, type CreateStore } from '../trip/create/create'
import type { ClubRecord, MemberRecord } from '../club/club'

// ─── The store ─────────────────────────────────────────────────

export type TieRecord = {
  id: string
  competitionId: string
  province: ProvinceKey
  competitionSlug: string
  competitionName: string
  round: number
  slot: number
  tripId: string
  code: string
  date: string | null
  roundId: string
  nameA: string
  nameB: string
  clubA: string | null
  clubB: string | null
  tagA: string
  tagB: string
  format: TieFormat
  settled: Settled | null
  playoffRoundId: string | null
}

export type TiePlayer = { id: string; name: string; handicap: number | null; teamId: string | null; gender: 'M' | 'F' }
export type TieMatchRow = TieMatch & { id: string }

/** A match on the national draw, as the server reads it at the moment of setting one up. */
export type DrawMatchRead = {
  competition: { id: string; name: string; slug: string; province: ProvinceKey }
  a: string | null
  b: string | null
  /** The round's play-by date, the tie's day by default. */
  by: string | null
}

export interface InterclubStore {
  userFromToken(token: string): Promise<AuthUser | null>
  clubsOf(userId: string): Promise<{ club: ClubRecord; row: MemberRecord }[]>
  /** Each club's name in the draws (108) — null where it has none; 'not_ready' before 108. */
  drawNames(clubIds: string[]): Promise<Map<string, string | null> | 'not_ready'>
  setDrawName(clubId: string, name: string | null): Promise<'ok' | 'not_ready'>
  readDrawMatch(province: ProvinceKey, slug: string, round: number, slot: number, today: string): Promise<DrawMatchRead | null | 'unreachable'>
  tiesFor(competitionId: string): Promise<TieRecord[] | 'not_ready'>
  tieByCode(code: string): Promise<TieRecord | null | 'not_ready'>
  tieAt(competitionId: string, round: number, slot: number): Promise<TieRecord | null | 'not_ready'>
  /** The ties a club is in, set up or taken. */
  tiesOfClubs(clubIds: string[]): Promise<TieRecord[] | 'not_ready'>

  // Making the event — the create route's own store, then its round, tags and the tie's row.
  create: CreateStore
  newCode(): string
  newId(): string
  insertItem(row: ReturnType<typeof toItemRow>): Promise<string>
  insertRound(row: Record<string, unknown>): Promise<void>
  insertTags(tripId: string, tags: { id: string; name: string; color: string }[]): Promise<void>
  insertTie(row: Record<string, unknown>): Promise<'ok' | 'clash' | 'not_ready'>
  deleteTrip(tripId: string): Promise<void>
  updateTie(id: string, patch: Record<string, unknown>): Promise<void>

  players(tripId: string): Promise<TiePlayer[]>
  addPlayer(tripId: string, p: { name: string; handicap: number | null; teamId: string; gender: 'M' | 'F'; clubMemberId: string | null }): Promise<string>
  updatePlayer(tripId: string, id: string, patch: { name?: string; handicap?: number | null }): Promise<void>
  removePlayer(tripId: string, id: string): Promise<void>
  matches(tripId: string, roundId: string): Promise<TieMatchRow[]>
  matchScored(tripId: string, matchId: string): Promise<boolean>
  setMatchSide(tripId: string, roundId: string, slot: number, side: Side, ids: string[]): Promise<void>
  setMatchResult(tripId: string, roundId: string, slot: number, result: 'a' | 'b' | 'halved' | null, margin: string | null): Promise<void>
  readBoards(tripId: string): Promise<unknown>
  writeBoards(tripId: string, boards: unknown): Promise<void>
  insertPlayoffRound(tripId: string, round: { id: string; courseId: string; date: string | null; itemRow: ReturnType<typeof toItemRow> }): Promise<void>
  roundCourse(roundId: string): Promise<string | null>
  /** A club's list, searched by name, for picking a side's players. */
  searchMembers(clubId: string, q: string): Promise<{ id: string; name: string; index: number | null; gender: 'M' | 'F' | null }[]>
}

export type InterclubOutcome =
  | { status: 200; body: Record<string, unknown> }
  | { status: 400 | 401 | 403 | 404 | 409 | 503; body: { ok: false; error: string } }

const fail = (status: 400 | 401 | 403 | 404 | 409 | 503, error: string): InterclubOutcome => ({ status, body: { ok: false, error } })
const NOT_READY = 'Interclub isn’t set up yet — try again later.'
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const CODE = /^[A-Z0-9]{6}$/

/** A competition for women only: its players start on the ladies' tees. */
export function womensCompetition(name: string): boolean {
  return /\((w|l)\)|women|ladies|girls/i.test(name)
}

// ─── The route ─────────────────────────────────────────────────

export async function runInterclub(
  input: { token: string | null; body: Record<string, unknown> },
  store: InterclubStore,
  now: Date,
): Promise<InterclubOutcome> {
  const b = input.body
  const action = str(b.action)

  // Public: the ties set up in a competition, for its draw page.
  if (action === 'ties') {
    const id = str(b.competitionId)
    if (!/^\d{6,24}$/.test(id)) return fail(400, 'Which competition?')
    const ties = await store.tiesFor(id)
    if (ties === 'not_ready') return { status: 200, body: { ok: true, ties: [] } }
    return { status: 200, body: { ok: true, ties: ties.map(t => ({ round: t.round, slot: t.slot, code: t.code, nameA: t.nameA, nameB: t.nameB, taken: { a: !!t.clubA, b: !!t.clubB } })) } }
  }

  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const rows = await store.clubsOf(user.id)
  const verified = rows.filter(r => r.club.verifiedAt && !r.row.removedAt)
  const captainOf = verified.filter(r => clubMay('run_interclub', { row: credentialsOf(r.row) })).map(r => r.club.id)
  const byName = (clubId: string | null) => verified.find(r => r.club.id === clubId)?.row.name ?? 'A team captain'

  // The clubs this account captains, with their names in the draws.
  if (action === 'mine') {
    const clubs = verified.filter(r => captainOf.includes(r.club.id)).map(r => r.club)
    const names = clubs.length ? await store.drawNames(clubs.map(c => c.id)) : new Map<string, string | null>()
    const ties = clubs.length ? await store.tiesOfClubs(clubs.map(c => c.id)) : []
    return {
      status: 200,
      body: {
        ok: true,
        clubs: clubs.map(c => ({
          id: c.id, name: c.name, slug: c.slug, homeCourseId: c.homeCourseId ?? null,
          drawName: drawNameOf({ name: c.name, interclubName: names === 'not_ready' ? null : names.get(c.id) ?? null }),
        })),
        ties: ties === 'not_ready' ? [] : ties.map(t => ({
          code: t.code, competitionName: t.competitionName, province: t.province, competitionSlug: t.competitionSlug,
          nameA: t.nameA, nameB: t.nameB, date: t.date,
        })),
        ready: names !== 'not_ready',
      },
    }
  }

  // The members app's Interclub page (stage 3, D357): a club's ties for anybody on its list, each with where it stands.
  if (action === 'club') {
    const mine = verified.find(r => r.club.slug === str(b.slug))
    if (!mine) return fail(403, 'Only the club’s members see its interclub matches.')
    const captain = captainOf.includes(mine.club.id)
    const ties = await store.tiesOfClubs([mine.club.id])
    if (ties === 'not_ready') return { status: 200, body: { ok: true, ready: false, captain, clubId: mine.club.id, ties: [] } }
    const rows = await Promise.all(ties.slice(0, 20).map(async t => {
      const [matches, playoff] = await Promise.all([
        store.matches(t.tripId, t.roundId),
        t.playoffRoundId ? store.matches(t.tripId, t.playoffRoundId) : Promise.resolve([] as TieMatchRow[]),
      ])
      const off = playoff[0]
      const outcome = tieOutcome({
        names: { a: t.nameA, b: t.nameB }, score: tieScore(matches), matches: t.format.matches, settled: t.settled,
        playoff: !t.playoffRoundId ? null : off?.result === 'a' || off?.result === 'b' ? off.result : 'open', holes: t.format.holes,
      })
      return {
        code: t.code, competitionName: t.competitionName, nameA: t.nameA, nameB: t.nameB, date: t.date,
        line: outcome.line, state: outcome.state, side: t.clubA === mine.club.id ? 'a' : 'b',
      }
    }))
    return { status: 200, body: { ok: true, ready: true, captain, clubId: mine.club.id, ties: rows } }
  }

  // A club's name in the draws: its Clubhouse or its team captains (D358).
  if (action === 'name.get' || action === 'name.set') {
    const mine = verified.find(r => r.club.id === str(b.clubId))
    const asker = { row: mine ? credentialsOf(mine.row) : null }
    if (!mine || !(clubMay('set_look', asker) || clubMay('run_interclub', asker))) return fail(403, 'Only the club’s Clubhouse or its team captains change this.')
    if (action === 'name.get') {
      const names = await store.drawNames([mine.club.id])
      return { status: 200, body: { ok: true, ready: names !== 'not_ready', name: names === 'not_ready' ? null : names.get(mine.club.id) ?? null, clubName: mine.club.name } }
    }
    const name = str(b.name)
    const issue = drawNameIssue(name)
    if (issue) return fail(400, issue)
    const out = await store.setDrawName(mine.club.id, name && name !== mine.club.name ? name : null)
    if (out === 'not_ready') return fail(503, NOT_READY)
    return { status: 200, body: { ok: true, name: name && name !== mine.club.name ? name : null } }
  }

  if (action === 'setup') return setUp(b, store, input.token, user, verified, captainOf, now)

  // Everything else is one tie, by its event's code.
  const code = str(b.code).toUpperCase()
  if (!CODE.test(code)) return fail(400, 'Which match?')
  const tie = await store.tieByCode(code)
  if (tie === 'not_ready') return fail(503, NOT_READY)
  if (!tie) return fail(404, 'No such interclub match.')

  if (action === 'tie') return { status: 200, body: { ok: true, tie: await view(store, tie, captainOf) } }

  // A captain of the other club takes their side (D353).
  if (action === 'take') {
    const clubId = str(b.clubId)
    if (!captainOf.includes(clubId)) return fail(403, 'Only a team captain of that club takes its side.')
    const names = await store.drawNames([clubId])
    const club = verified.find(r => r.club.id === clubId)!.club
    const drawName = drawNameOf({ name: club.name, interclubName: names === 'not_ready' ? null : names.get(clubId) ?? null })
    const side = takeableSide(tie, { a: tie.nameA, b: tie.nameB }, { id: clubId, drawName })
    if (!side) return fail(409, 'Your club isn’t the other side of this match, or its side is taken.')
    await store.updateTie(tie.id, { [side === 'a' ? 'club_a' : 'club_b']: clubId })
    return { status: 200, body: { ok: true, tie: await view(store, { ...tie, [side === 'a' ? 'clubA' : 'clubB']: clubId }, captainOf) } }
  }

  if (action === 'members') {
    const side = b.side === 'a' || b.side === 'b' ? b.side : null
    if (!side || !maySide(tie, captainOf, side)) return fail(403, 'Only that club’s team captains pick its players.')
    const own = clubOf(tie, side)
    if (!own) return { status: 200, body: { ok: true, members: [] } }
    const q = str(b.q)
    return { status: 200, body: { ok: true, members: q.length < 2 ? [] : await store.searchMembers(own, q.slice(0, 40)) } }
  }

  if (action === 'player.add') {
    const side = b.side === 'a' || b.side === 'b' ? b.side : null
    if (!side || !maySide(tie, captainOf, side)) return fail(403, 'Only that club’s team captains add its players.')
    const index = b.index === null || b.index === undefined || b.index === '' ? null : readIndex(String(b.index))
    if (index && !index.ok) return fail(400, index.why)
    const p = { name: str(b.name), index: index ? (index.ok ? index.value ?? null : null) : null }
    const issue = playerIssue(p)
    if (issue) return fail(400, issue)
    const players = await store.players(tie.tripId)
    const tag = side === 'a' ? tie.tagA : tie.tagB
    if (players.filter(x => x.teamId === tag).length >= MAX_SIDE_PLAYERS) return fail(409, `A side has ${MAX_SIDE_PLAYERS} players at most.`)
    if (players.some(x => x.name.toLowerCase() === p.name.toLowerCase())) return fail(409, 'Somebody of that name is already in this match.')
    const gender = b.gender === 'F' || b.gender === 'M' ? b.gender : womensCompetition(tie.competitionName) ? 'F' : 'M'
    const memberId = typeof b.memberId === 'string' && b.memberId && clubOf(tie, side) ? b.memberId : null
    await store.addPlayer(tie.tripId, { name: p.name, handicap: p.index, teamId: tag, gender, clubMemberId: memberId })
    return { status: 200, body: { ok: true, tie: await view(store, tie, captainOf) } }
  }

  if (action === 'player.update' || action === 'player.remove') {
    const players = await store.players(tie.tripId)
    const player = players.find(x => x.id === str(b.playerId))
    if (!player) return fail(404, 'No such player in this match.')
    const side: Side | null = player.teamId === tie.tagA ? 'a' : player.teamId === tie.tagB ? 'b' : null
    if (!side || !maySide(tie, captainOf, side)) return fail(403, 'Only that club’s team captains change its players.')
    const matches = await store.matches(tie.tripId, tie.roundId)
    if (action === 'player.remove') {
      if (matches.some(m => [...m.sideA, ...m.sideB].includes(player.id))) return fail(409, 'Take them out of their match first.')
      await store.removePlayer(tie.tripId, player.id)
    } else {
      const patch: { name?: string; handicap?: number | null } = {}
      if (b.name !== undefined) patch.name = str(b.name)
      if (b.index !== undefined) {
        if (b.index === null || b.index === '') patch.handicap = null
        else {
          const r = readIndex(String(b.index))
          if (!r.ok) return fail(400, r.why)
          patch.handicap = r.value ?? null
        }
      }
      const issue = playerIssue({ name: patch.name ?? player.name, index: patch.handicap !== undefined ? patch.handicap : player.handicap })
      if (issue) return fail(400, issue)
      await store.updatePlayer(tie.tripId, player.id, patch)
    }
    return { status: 200, body: { ok: true, tie: await view(store, tie, captainOf) } }
  }

  if (action === 'match.side') {
    const side = b.side === 'a' || b.side === 'b' ? b.side : null
    const slot = Number(b.slot)
    if (!side || !maySide(tie, captainOf, side)) return fail(403, 'Only that club’s team captains set its players.')
    if (!Number.isInteger(slot) || slot < 0 || slot >= tie.format.matches) return fail(400, 'Which match?')
    const ids = Array.isArray(b.playerIds) ? b.playerIds.filter((x): x is string => typeof x === 'string') : []
    const [players, matches] = await Promise.all([store.players(tie.tripId), store.matches(tie.tripId, tie.roundId)])
    const tag = side === 'a' ? tie.tagA : tie.tagB
    const here = matches.find(m => m.slot === slot)
    if (here && (here.result || await store.matchScored(tie.tripId, here.id))) return fail(409, 'This match has started — settle it instead.')
    const elsewhere = new Set(matches.filter(m => m.slot !== slot).flatMap(m => (side === 'a' ? m.sideA : m.sideB)))
    const issue = sideIssue(ids, tie.format.match, new Set(players.filter(p => p.teamId === tag).map(p => p.id)), elsewhere)
    if (issue) return fail(400, issue)
    await store.setMatchSide(tie.tripId, tie.roundId, slot, side, ids)
    return { status: 200, body: { ok: true, tie: await view(store, tie, captainOf) } }
  }

  // D361, a match: a captain's result by hand — a walkover against a vacant side (D354), a concession, a ruling.
  if (action === 'match.settle') {
    if (!mayRun(tie, captainOf)) return fail(403, 'Only the clubs’ team captains settle a match.')
    const slot = Number(b.slot)
    const roundId = b.playoff === true ? tie.playoffRoundId : tie.roundId
    if (!roundId) return fail(409, 'There is no playoff yet.')
    if (!Number.isInteger(slot) || slot < 0 || slot >= (b.playoff === true ? 1 : tie.format.matches)) return fail(400, 'Which match?')
    const result = b.result === 'a' || b.result === 'b' || b.result === 'halved' ? b.result : b.result === null ? null : undefined
    if (result === undefined) return fail(400, 'Who won the match?')
    if (b.playoff === true && result === 'halved') return fail(400, 'A playoff has a winner.')
    const margin = str(b.margin).slice(0, 20) || null
    const matches = await store.matches(tie.tripId, roundId)
    const m = matches.find(x => x.slot === slot)
    const vacant = !m || (result === 'a' ? m.sideB.length === 0 : result === 'b' ? m.sideA.length === 0 : false)
    await store.setMatchResult(tie.tripId, roundId, slot, result, result === null ? null : margin ?? (vacant ? 'W/O' : 'Settled'))
    return { status: 200, body: { ok: true, tie: await view(store, tie, captainOf) } }
  }

  // D361, the tie: a captain's result over the cards, or taken off again.
  if (action === 'settle') {
    if (!mayRun(tie, captainOf)) return fail(403, 'Only the clubs’ team captains settle the match.')
    if (b.winner === null) {
      await store.updateTie(tie.id, { settled: null })
      return { status: 200, body: { ok: true, tie: await view(store, { ...tie, settled: null }, captainOf) } }
    }
    const issue = settleIssue(b.winner, b.note)
    if (issue) return fail(400, issue)
    const ownClub = [tie.clubA, tie.clubB].find(c => c && captainOf.includes(c)) ?? null
    const settled: Settled = { winner: b.winner as Side, note: str(b.note) || null, byName: byName(ownClub), at: now.toISOString() }
    await store.updateTie(tie.id, { settled })
    return { status: 200, body: { ok: true, tie: await view(store, { ...tie, settled }, captainOf) } }
  }

  // D360: the playoff — a player or pair a side, picked from those who played.
  if (action === 'playoff') {
    if (!mayRun(tie, captainOf)) return fail(403, 'Only the clubs’ team captains start a playoff.')
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
    const a = ids(b.a), bb = ids(b.b)
    const matches = await store.matches(tie.tripId, tie.roundId)
    const score = tieScore(matches)
    const issue = playoffIssue({
      level: score.decided >= tie.format.matches && score.a === score.b,
      started: !!tie.playoffRoundId, format: tie.format.match, a, b: bb, matches,
    })
    if (issue) return fail(409, issue)
    const courseId = await store.roundCourse(tie.roundId)
    if (!courseId) return fail(503, 'Could not start the playoff — try again.')
    const roundId = store.newId()
    await store.insertPlayoffRound(tie.tripId, {
      id: roundId, courseId, date: tie.date,
      itemRow: toItemRow(tie.tripId, { id: 'tmp-golf', dayIndex: 0, position: 1, kind: 'golf', courseId, teeTime: '', teeCount: 1 }),
    })
    const boards = await store.readBoards(tie.tripId)
    await store.writeBoards(tie.tripId, withPlayoff(Array.isArray(boards) ? boards : [], tie.format, roundId))
    await store.setMatchSide(tie.tripId, roundId, 0, 'a', a)
    await store.setMatchSide(tie.tripId, roundId, 0, 'b', bb)
    await store.updateTie(tie.id, { playoff_round_id: roundId })
    return { status: 200, body: { ok: true, tie: await view(store, { ...tie, playoffRoundId: roundId }, captainOf) } }
  }

  return fail(400, 'Unknown request.')
}

/** Set up this match (stage 2): the draw read again, the captain's club one side of it, the event made. */
async function setUp(
  b: Record<string, unknown>, store: InterclubStore, token: string, user: AuthUser,
  verified: { club: ClubRecord; row: MemberRecord }[], captainOf: string[], now: Date,
): Promise<InterclubOutcome> {
  const province = PROVINCES.find(p => p.key === b.province)?.key
  const slug = str(b.slug)
  const round = Number(b.round), slot = Number(b.slot)
  if (!province || !slug || !Number.isInteger(round) || !Number.isInteger(slot) || round < 0 || slot < 0) return fail(400, 'Which match?')
  const clubId = str(b.clubId)
  if (!captainOf.includes(clubId)) return fail(403, 'Only a team captain sets up the club’s interclub matches.')
  const club = verified.find(r => r.club.id === clubId)!.club
  const format = readFormat(b.format)
  if (!format) return fail(400, formatIssue((b.format ?? {}) as TieFormat) ?? 'Choose the format.')
  const courseId = str(b.courseId)
  if (!courseId) return fail(400, 'Choose where it is played.')
  const date = str(b.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'Choose the day.')
  const time = /^\d{2}:\d{2}$/.test(str(b.time)) ? str(b.time) : ''

  const today = irishToday(now)
  const read = await store.readDrawMatch(province, slug, round, slot, today)
  if (read === 'unreachable') return fail(503, 'Could not reach the draw just now — try again.')
  if (!read || !read.a || !read.b) return fail(404, 'That match isn’t on the draw with both clubs known.')
  const names = await store.drawNames([clubId])
  const drawName = drawNameOf({ name: club.name, interclubName: names === 'not_ready' ? null : names.get(clubId) ?? null })
  const side = clubSide(drawName, { a: read.a, b: read.b })
  if (!side) return fail(403, `${club.name} isn’t in that match on the draw — set the club’s name in the draws in Club settings if the draw spells it differently.`)
  const already = await store.tieAt(read.competition.id, round, slot)
  if (already === 'not_ready') return fail(503, NOT_READY)
  if (already) return fail(409, `This match is already set up — ${already.code}.`)

  const roundId = store.newId()
  const tagA = store.newId(), tagB = store.newId()
  let made: { tripId: string; code: string } | null = null
  for (let attempt = 0; attempt < 4 && !made; attempt++) {
    const code = store.newCode()
    const out = await runCreate({
      token, row: {
        name: tieName(read.a, read.b),
        slug: code.toLowerCase(),
        trip_code: code,
        status: 'upcoming',
        start_date: date,
        end_date: date,
        kind: 'tournament',
        description: read.competition.name,
        formats: { ...NO_FORMATS, league: { ...NO_FORMATS.league }, matchplay: { ...NO_FORMATS.matchplay } },
        leaderboards: tieBoards(format, roundId),
        bracket_setup: { format: 'league', entry: 'organiser' },
        event_permissions: { ...TIE_PERMISSIONS },
      }, adminPin: null, trustedClub: { id: club.id, name: club.name },
    }, store.create, now)
    if (out.status === 409) continue
    if (out.status !== 200) return fail(out.status === 400 ? 400 : 503, out.body.error?.message ?? 'Could not set up the match — try again.')
    made = { tripId: out.body.data.id, code }
  }
  if (!made) return fail(503, 'Could not set up the match — try again.')

  try {
    const itemId = await store.insertItem(toItemRow(made.tripId, {
      id: 'tmp-golf', dayIndex: 0, position: 0, kind: 'golf', courseId, teeTime: time, teeCount: 1,
    }))
    await store.insertRound({
      id: roundId, trip_id: made.tripId, course_id: courseId, round_number: 1, status: 'upcoming',
      itinerary_item_id: itemId, scheduled_date: date,
    })
    await store.insertTags(made.tripId, [
      { id: tagA, name: read.a, color: TIE_COLOURS[0] },
      { id: tagB, name: read.b, color: TIE_COLOURS[1] },
    ])
    const row = await store.insertTie({
      competition_id: read.competition.id, province, competition_slug: read.competition.slug,
      competition_name: read.competition.name, draw_round: round, draw_slot: slot,
      trip_id: made.tripId, round_id: roundId, name_a: read.a, name_b: read.b,
      club_a: side === 'a' ? clubId : null, club_b: side === 'b' ? clubId : null,
      tag_a: tagA, tag_b: tagB, format, created_by: user.id,
    })
    if (row !== 'ok') {
      await store.deleteTrip(made.tripId).catch(() => undefined)
      return row === 'clash' ? fail(409, 'This match was set up a moment ago — open it from the draw.') : fail(503, NOT_READY)
    }
  } catch (e) {
    console.error('interclub setup failed:', e)
    await store.deleteTrip(made.tripId).catch(() => undefined)
    return fail(503, 'Could not set up the match — try again.')
  }
  return { status: 200, body: { ok: true, code: made.code } }
}

/** A tie as the captain's page draws it: sides, players, matches, the result, and what this account may do. */
async function view(store: InterclubStore, tie: TieRecord, captainOf: string[]) {
  const [players, matches, playoff] = await Promise.all([
    store.players(tie.tripId),
    store.matches(tie.tripId, tie.roundId),
    tie.playoffRoundId ? store.matches(tie.tripId, tie.playoffRoundId) : Promise.resolve([] as TieMatchRow[]),
  ])
  const score = tieScore(matches)
  const off = playoff[0]
  const outcome = tieOutcome({
    names: { a: tie.nameA, b: tie.nameB }, score, matches: tie.format.matches, settled: tie.settled,
    playoff: !tie.playoffRoundId ? null : off?.result === 'a' || off?.result === 'b' ? off.result : 'open', holes: tie.format.holes,
  })
  const bySlot = new Map(matches.map(m => [m.slot, m]))
  return {
    code: tie.code,
    competition: { name: tie.competitionName, province: tie.province, slug: tie.competitionSlug },
    names: { a: tie.nameA, b: tie.nameB },
    date: tie.date,
    format: tie.format,
    roundId: tie.roundId,
    playoffRoundId: tie.playoffRoundId,
    taken: { a: !!tie.clubA, b: !!tie.clubB },
    may: { a: maySide(tie, captainOf, 'a'), b: maySide(tie, captainOf, 'b'), run: mayRun(tie, captainOf) },
    players: players
      .filter(p => p.teamId === tie.tagA || p.teamId === tie.tagB)
      .map(p => ({ id: p.id, name: p.name, index: p.handicap, side: p.teamId === tie.tagA ? 'a' : 'b' })),
    matches: Array.from({ length: tie.format.matches }, (_, slot) => {
      const m = bySlot.get(slot)
      return { slot, a: m?.sideA ?? [], b: m?.sideB ?? [], result: m?.result ?? null, margin: m?.margin ?? null }
    }),
    playoff: off ? { a: off.sideA, b: off.sideB, result: off.result, margin: off.margin } : null,
    score,
    outcome,
    settled: tie.settled,
  }
}
