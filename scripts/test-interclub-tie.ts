/**
 * An interclub tie (lib/interclubTie.ts, app/api/interclub/interclub.ts —
 * D353–D362). Run with: npm run test:interclub-tie
 *
 * The rules pure, the sudden-death card, and the route's logic on a store
 * held in memory: who may set a match up, fill which side, settle and start
 * a playoff — and that a tie is the Ryder Cup event already built.
 */

import {
  MARGINS, MAX_TIE_MATCHES, clubSide, competitionFormat, mayFollowTie, readMargin, tieLive, drawNameIssue, drawNameOf, formatIssue, formatLine, holesUp,
  interclubAllowance, mayRun, maySide, playerIssue, playoffIssue, points, readFormat, sideIssue, takeableSide,
  tieBoards, tieOutcome, tieScore, withPlayoff, type TieMatch,
} from '../lib/interclubTie'
import {
  cardState, markIssue, plainHoles, playSessionCard, readHoleMarks, sessionResult, withHoleMark, type CardHole,
} from '../lib/matchCard'
import type { SessionMatchResult } from '../lib/sessions'
import { parseLeaderboards } from '../lib/leaderboards'
import { runInterclub, womensCompetition, type InterclubStore, type TieRecord, type TiePlayer, type TieMatchRow } from '../app/api/interclub/interclub'
import type { CreateStore } from '../app/api/trip/create/create'

// The PIN hash a made event is keyed by (lib/pinHash.ts) — read when an event is made, so a stand-in will do.
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-only-key'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}
const section = (n: string) => console.log(`\n${n}`)

// ─── What a competition plays ──────────────────────────────────

section('What a competition plays, from its name — a suggestion the captain changes')
{
  const f = (n: string) => { const x = competitionFormat(n); return `${x.matches} ${x.match} ${x.tie}${x.holes ? ' holes' : ''}` }
  eq(f('AIG Barton Shield (Leinster North)'), '2 foursomes half holes', 'the Barton Shield: two foursomes, holes up beside (D362)')
  eq(f("AIG Men's Senior Cup"), '5 singles extra', 'a Senior Cup: five singles, played on after 18')
  eq(f("AIG Women's Junior Cup (Ulster South)"), '5 singles extra', 'a Junior Cup the same')
  eq(f('AIG Jimmy Bruen Shield'), '4 foursomes half', 'the Jimmy Bruen: four foursomes')
  eq(f('AIG Senior Foursomes'), '3 foursomes extra', 'Senior Foursomes: three, played on')
  eq(f('Revive Active Four-Ball (w)'), '4 fourball half', 'a four-ball: four')
  eq(f('Girls Inter-Club'), '3 singles extra', 'girls: three singles')
  eq(f('Something New'), '5 singles half', 'a name it does not know: five singles')
  eq([interclubAllowance('singles'), interclubAllowance('fourball'), interclubAllowance('foursomes')], [100, 75, 50], 'Golf Ireland’s 2026 allowances')
  eq(formatLine(competitionFormat('AIG Barton Shield')), '2 foursomes · halved after 18 · 50% handicap · holes up beside', 'said in a line')
  eq(formatIssue({ match: 'singles', matches: MAX_TIE_MATCHES + 1, tie: 'half', holes: false }), `Between 1 and ${MAX_TIE_MATCHES} matches.`, 'no more than ten matches')
  eq(readFormat({ match: 'triples', matches: 3 }), null, 'a format it cannot play is no format')
  eq(readFormat({ match: 'fourball', matches: 4, tie: 'extra', holes: 'yes' }), { match: 'fourball', matches: 4, tie: 'extra', holes: false }, 'read whole and strict')
  ok(womensCompetition("AIG Women's Senior Cup") && womensCompetition('Connacht Trophy (w)') && !womensCompetition('AIG Barton Shield'), 'a women’s competition starts its players on the ladies’ tees')
}

// ─── Clubs and sides ───────────────────────────────────────────

section('Which side a club is, and who may fill it (D353, D358)')
{
  const match = { a: 'Co. Sligo', b: 'Strandhill' }
  eq(clubSide('Co. Sligo', match), 'a', 'by its name in the draws')
  eq(clubSide(drawNameOf({ name: 'County Sligo Golf Club', interclubName: null }), match), 'a', '"County Sligo Golf Club" is "Co. Sligo"')
  eq(clubSide('Galway', { a: 'Galway Bay', b: 'Athenry' }), null, 'never a stem: Galway is not Galway Bay')
  eq(drawNameOf({ name: 'Rosses Point', interclubName: 'Co. Sligo' }), 'Co. Sligo', 'its own name for the draws wins')
  eq([drawNameIssue(''), drawNameIssue('x'.repeat(81))], [null, 'Keep it to 80 characters.'], 'blank is the club’s own name')

  const t = { clubA: 'sligo', clubB: null }
  ok(maySide(t, ['sligo'], 'a') && maySide(t, ['sligo'], 'b'), 'the captain who set it up fills both sides while the other club has no captain on it')
  ok(!maySide(t, ['strandhill'], 'b'), 'a captain of the other club fills nothing until they take their side')
  const both = { clubA: 'sligo', clubB: 'strandhill' }
  ok(maySide(both, ['strandhill'], 'b') && !maySide(both, ['sligo'], 'b') && !maySide(both, ['strandhill'], 'a'), 'once taken, each club fills its own')
  ok(mayRun(both, ['strandhill']) && mayRun(both, ['sligo']) && !mayRun(both, ['lahinch']), 'either club’s captains settle it; nobody else')
  eq(takeableSide(t, match, { id: 'strandhill', drawName: 'Strandhill' }), 'b', 'the other club takes its side')
  eq(takeableSide(both, match, { id: 'other', drawName: 'Strandhill' }), null, 'never a side already taken')
  eq(takeableSide(t, match, { id: 'sligo', drawName: 'Co. Sligo' }), null, 'nor a club already on it')
}

section('Players and sides')
{
  eq([playerIssue({ name: '', index: 4 }), playerIssue({ name: 'Ross', index: 60 }), playerIssue({ name: 'Ross', index: null })],
    ['Give the player’s name.', 'An index between +10 and 54.', null], 'a name, and an index typed or not (D355)')
  const side = new Set(['p1', 'p2', 'p3'])
  eq(sideIssue(['p1'], 'singles', side, new Set()), null, 'a single')
  eq(sideIssue(['p1'], 'foursomes', side, new Set()), 'Two players a side.', 'a pair for foursomes')
  eq(sideIssue([], 'foursomes', side, new Set()), null, 'or nobody, to empty it')
  eq(sideIssue(['p9'], 'singles', side, new Set()), 'Pick from this side’s players.', 'only the side’s own')
  eq(sideIssue(['p1'], 'singles', side, new Set(['p1'])), 'That player is already in another match.', 'nobody twice')
}

// ─── The event ─────────────────────────────────────────────────

section('A tie is the Ryder Cup model: the Overall over the two clubs, one Matches session')
{
  const boards = tieBoards(competitionFormat('Revive Active Four-Ball'), 'r1')
  const [overall, session] = boards
  eq([overall.competition, overall.overall?.ranks, overall.teamSet, overall.overall?.slots], ['overall', 'tags', 'main', { r1: 4 }], 'the Overall ranks the tags, four matches')
  eq([session.competition, session.matchFormat, session.handicapAllowance, session.roundIds, session.matchTie],
    ['matches', 'fourball', 75, ['r1'], undefined], 'a fourball session at 75%, halved after 18')
  eq(tieBoards(competitionFormat("AIG Men's Senior Cup"), 'r1')[1].matchTie, 'extra', 'a Senior Cup plays on')
  eq(parseLeaderboards(boards).length, 2, 'both boards read back as stored')
  const po = withPlayoff(boards, competitionFormat('Revive Active Four-Ball'), 'r2')
  eq([po[0].overall?.names?.r2, po[0].overall?.slots?.r2, po[0].overall?.feeds?.r2, po[2].matchTie, po[2].roundIds],
    ['Playoff', 1, { kind: 'none' }, 'sudden', ['r2']], 'the playoff: one match, sudden death, worth nothing on the Overall (D360)')
  eq(parseLeaderboards(po)[2]?.matchTie, 'sudden', 'and read back as sudden death')
}

section('Sudden death: the first hole won settles it (D360)')
{
  const holes18: CardHole[] = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 }))
  const A = { id: 'A', players: [{ id: 'pa', gender: 'M', receives: 0 }] }
  const B = { id: 'B', players: [{ id: 'pb', gender: 'M', receives: 0 }] }
  const card = (a: number[], b: number[]) => new Map([
    ['pa', new Map(a.map((g, i) => [i + 1, g]))], ['pb', new Map(b.map((g, i) => [i + 1, g]))],
  ])
  const start = playSessionCard(holes18, A, B, card([], []), 'sudden')
  eq([start.holes.length, start.state.settled, start.state.progress], [1, false, 'Not started'], 'one hole to start')
  const halved = playSessionCard(holes18, A, B, card([4], [4]), 'sudden')
  eq([halved.holes.length, halved.state.settled, halved.state.progress], [2, false, 'All square thru 1'], 'a halved hole brings the next')
  const won = playSessionCard(holes18, A, B, card([4, 4, 3], [4, 4, 4]), 'sudden')
  eq([won.holes.length, won.state.settled, won.state.leader, won.state.result], [3, true, 'A', 'at 3rd'], 'won at the 3rd')
  eq(won.holes.map(h => h.strokeIndex), [1, 2, 3], 'off the course’s holes in order')
  const round = playSessionCard(holes18, A, B, card(Array(19).fill(4), [...Array(18).fill(4), 5]), 'sudden')
  eq([round.holes[18]?.strokeIndex, round.state.result], [1, 'at 19th'], 'round again after the 18th')
}

// ─── The result ────────────────────────────────────────────────

section('The result: points, holes up beside, a playoff, a captain’s word')
{
  eq([holesUp('3&2'), holesUp('2 up'), holesUp('at 19th'), holesUp('W/O'), holesUp(null)], [3, 2, 1, 0, 0], 'holes up off a margin')
  const m = (slot: number, result: TieMatch['result'], margin: string | null = null): TieMatch => ({ slot, sideA: ['a' + slot], sideB: ['b' + slot], result, margin })
  const s = tieScore([m(0, 'a', '3&2'), m(1, 'halved'), m(2, 'b', '1 up'), m(3, null)])
  eq(s, { a: 1.5, b: 1.5, decided: 3, holesA: 3, holesB: 1 }, 'a win one, a half each a half, holes beside')
  eq(points(2.5), '2½', 'two and a half')
  const names = { a: 'Ballinrobe', b: 'Castlebar' }
  const out = (score = s, extra: Partial<Parameters<typeof tieOutcome>[0]> = {}) =>
    tieOutcome({ names, score, matches: 4, settled: null, playoff: null, holes: false, ...extra })
  eq(out().state, 'in_play', 'in play while a match is to finish')
  eq(out(tieScore([m(0, null)]), { matches: 1 }).line, 'To play', 'nothing yet')
  const done = tieScore([m(0, 'a', '3&2'), m(1, 'a', '2 up'), m(2, 'b', '1 up'), m(3, 'halved')])
  eq(out(done, { holes: true }), { winner: 'a', state: 'won', line: 'Ballinrobe win 2½–1½ (holes 5–1)' }, 'won, the Barton Shield’s holes beside (D362)')
  const level = tieScore([m(0, 'a'), m(1, 'b'), m(2, 'halved'), m(3, 'halved')])
  eq(out(level).state, 'level', 'level after every match: pick the playoff')
  eq(out(level, { playoff: 'open' }).state, 'playoff', 'the playoff under way')
  eq(out(level, { playoff: 'b' }), { winner: 'b', state: 'won', line: 'Castlebar win on the playoff (2–2)' }, 'its winner goes through')
  eq(out(done, { settled: { winner: 'b', note: 'Conceded', byName: 'Ross', at: 'now' } }).line, 'Settled: Castlebar go through', 'a captain’s word over everything (D361)')

  const matches = [m(0, 'a'), m(1, 'b'), { slot: 2, sideA: ['x', 'y'], sideB: ['p', 'q'], result: 'halved' as const, margin: null }]
  eq(playoffIssue({ level: false, started: false, format: 'singles', a: ['a0'], b: ['b0'], matches }), 'A playoff is only for a tie level after every match.', 'only when level')
  eq(playoffIssue({ level: true, started: false, format: 'singles', a: ['a0'], b: ['b1'], matches }), null, 'a player a side who played')
  eq(playoffIssue({ level: true, started: false, format: 'singles', a: ['zz'], b: ['b1'], matches }), 'Pick from those who played.', 'never somebody who did not')
  eq(playoffIssue({ level: true, started: false, format: 'foursomes', a: ['x', 'y'], b: ['p', 'q'], matches }), null, 'a pair who played together')
  eq(playoffIssue({ level: true, started: false, format: 'foursomes', a: ['x', 'a0'], b: ['p', 'q'], matches }), 'A pair must have played together in the tie.', 'never a pair made up')
  eq(playoffIssue({ level: true, started: true, format: 'singles', a: ['a0'], b: ['b0'], matches }), 'The playoff has started already.', 'one playoff')
}

section('Holes marked by hand: who won it, no scores (D363)')
{
  const A = { id: 'A', players: [{ id: 'pa', gender: 'M', receives: 0 }] }
  const B = { id: 'B', players: [{ id: 'pb', gender: 'M', receives: 0 }] }
  const holes18 = plainHoles()
  eq(withHoleMark(null, 1, 'A'), { 1: 'a' }, 'a mark stored as a side')
  eq(withHoleMark({ 1: 'a', 2: 'halved' }, 2, null), { 1: 'a' }, 'and taken off')
  eq([...readHoleMarks({ 1: 'b', 2: 'halved', 40: 'a', x: 'a', 3: 'nobody' })], [[1, 'B'], [2, 'halved']], 'only holes 1–36 and the three answers read back')
  const marked = playSessionCard(holes18, A, B, new Map(), 'half', readHoleMarks({ 1: 'a', 2: 'a', 3: 'halved' }))
  eq([marked.state.progress, marked.state.leader, marked.outcomes[2].marked], ['2 up thru 3', 'A', true], 'marks make the standing')
  const scored = new Map([['pa', new Map([[1, 5]])], ['pb', new Map([[1, 4]])]])
  const both = playSessionCard(holes18, A, B, scored, 'half', readHoleMarks({ 1: 'a', 2: 'b' }))
  eq([both.outcomes[0].winner, both.outcomes[0].marked, both.outcomes[1].winner], ['B', undefined, 'B'], 'a hole’s scores decide it over its mark; a hole without them takes its mark')
  const s3 = cardState(marked.outcomes)
  eq(markIssue(marked.outcomes, s3, 4, 'B'), null, 'the next hole')
  eq(markIssue(marked.outcomes, s3, 2, 'B'), null, 'or one before it, to amend')
  eq(markIssue(marked.outcomes, s3, 6, 'B'), 'Mark the 4th first.', 'never ahead of the next')
  eq(markIssue(marked.outcomes, s3, 2, null), 'Take marks off from the last hole back.', 'taken off from the last hole back')
  eq(markIssue(marked.outcomes, s3, 3, null), null, 'the last one comes off')
  eq(markIssue(both.outcomes, cardState(both.outcomes), 1, 'A'), 'That hole has scores on the card — change them there.', 'a hole its scores decide is the card’s')
  const all: Record<string, 'a'> = {}
  for (let h = 1; h <= 10; h++) all[h] = 'a'
  const won = playSessionCard(holes18, A, B, new Map(), 'half', readHoleMarks(all))
  eq([won.state.settled, won.state.result, sessionResult(won.state)], [true, '10&8', { result: 'a', margin: '10&8' }], 'ten up with eight to play: settled')
  eq(markIssue(won.outcomes, cardState(won.outcomes), 11, 'B'), 'The match is already decided.', 'nothing marked past the hole that settled it')
  const level: Record<string, 'halved'> = {}
  for (let h = 1; h <= 18; h++) level[h] = 'halved'
  eq(sessionResult(playSessionCard(holes18, A, B, new Map(), 'half', readHoleMarks(level)).state), { result: 'halved', margin: 'A/S' }, 'all square after 18 a half')
  const extra = playSessionCard(holes18, A, B, new Map(), 'extra', readHoleMarks({ ...level, 19: 'b' }))
  eq(sessionResult(extra.state), { result: 'b', margin: 'at 19th' }, 'played on: won at the 19th')
  eq(playSessionCard(holes18, A, B, new Map(), 'sudden', readHoleMarks({ 1: 'halved', 2: 'a' })).state.result, 'at 2nd', 'a playoff marked: the first hole won')
}

section('Following a tie, live, and a result without its holes (D363)')
{
  eq([mayFollowTie({ clubA: 'x', clubB: null }, ['x']), mayFollowTie({ clubA: 'x', clubB: 'y' }, ['z']), mayFollowTie({ clubA: null, clubB: 'y' }, ['y'])],
    [true, false, true], 'either club’s list follows it')
  eq([tieLive({ state: 'to_play', anyLive: false, date: '2026-08-10', today: '2026-08-10' }), tieLive({ state: 'to_play', anyLive: false, date: '2026-08-09', today: '2026-08-10' }),
    tieLive({ state: 'to_play', anyLive: true, date: '2026-08-09', today: '2026-08-10' }), tieLive({ state: 'level', anyLive: false, date: null, today: '2026-08-10' }),
    tieLive({ state: 'won', anyLive: true, date: '2026-08-10', today: '2026-08-10' })], [true, false, true, true, false], 'live: on the day, on the course, or waiting on a playoff — never once won')
  eq([readMargin('3 & 2'), readMargin('1 UP'), readMargin(''), readMargin('9&10'), readMargin('at 19th')], ['3&2', '1 up', null, undefined, 'at 19th'], 'a margin read, left out, or refused')
  ok(MARGINS.includes('10&8') && !MARGINS.includes('11&8') && MARGINS[0] === '1 up', 'the margins run 1 up to 10&8')
}

// ─── The route, on a store in memory ───────────────────────────

const user = (id: string) => ({ id, isAnonymous: false, email: `${id}@example.invalid`, emailConfirmed: true })
const club = (id: string, name: string) => ({ id, slug: id, name, verifiedAt: '2026-01-01', refusedAt: null, homeCourseId: 'course' })
const row = (clubId: string, name: string, teamCaptain: boolean) => ({
  id: `${clubId}-row`, clubId, name, memberNumber: null, guiNumber: null, email: null, role: 'member' as const,
  userId: null, removedAt: null, onBoards: true, officer: false, clubhouse: false, teamCaptain,
})

function memoryStore(o: { draw?: { a: string; b: string } } = {}) {
  const ties: TieRecord[] = []
  const players: (TiePlayer & { tripId: string })[] = []
  const matches: (TieMatchRow & { tripId: string; roundId: string })[] = []
  const boards = new Map<string, unknown>()
  const marks = new Map<string, unknown>()
  const feed: { key: string; line: string; club: string | null }[][] = []
  let n = 0
  const id = () => `id${++n}`
  const memberships: Record<string, { club: ReturnType<typeof club>; row: ReturnType<typeof row> }[]> = {
    ross: [{ club: club('sligo', 'County Sligo Golf Club'), row: row('sligo', 'Ross', true) }],
    dave: [{ club: club('strand', 'Strandhill Golf Club'), row: row('strand', 'Dave', true) }],
    mary: [{ club: club('sligo', 'County Sligo Golf Club'), row: row('sligo', 'Mary', false) }],
  }
  let made: Record<string, unknown> | null = null
  const create: CreateStore = {
    userFromToken: async (t: string) => t,
    isMember: async () => true,
    insertTrip: async (r: unknown) => { made = r as Record<string, unknown>; boards.set('trip1', (r as { leaderboards: unknown }).leaderboards); return { id: 'trip1' } },
    writeMembership: async () => undefined,
    writeLeadEmail: async () => undefined,
    deleteTrip: async () => undefined,
    setEventClub: async () => undefined,
    recordOwner: async () => undefined,
  } as unknown as CreateStore
  const store: InterclubStore = {
    userFromToken: async t => user(t),
    clubsOf: async u => (memberships[u] ?? []) as never,
    drawNames: async ids => new Map(ids.map(i => [i, i === 'sligo' ? 'Co. Sligo' : null])),
    setDrawName: async () => 'ok',
    readDrawMatch: async () => ({ competition: { id: '12642291381881043035', name: 'Connacht Shield (m)', slug: 'connacht-shield-m', province: 'connacht' }, a: o.draw?.a ?? 'Co. Sligo', b: o.draw?.b ?? 'Strandhill', by: '2026-08-10' }),
    tiesFor: async c => ties.filter(t => t.competitionId === c),
    tieByCode: async c => ties.find(t => t.code === c) ?? null,
    tieAt: async (c, r, s) => ties.find(t => t.competitionId === c && t.round === r && t.slot === s) ?? null,
    tiesOfClubs: async ids => ties.filter(t => ids.includes(t.clubA ?? '') || ids.includes(t.clubB ?? '')),
    create,
    newCode: () => 'ABC123',
    newId: id,
    insertItem: async () => 'item1',
    insertRound: async () => undefined,
    insertTags: async () => undefined,
    async insertTie(r) {
      ties.push({
        id: 'tie1', competitionId: r.competition_id as string, province: 'connacht', competitionSlug: r.competition_slug as string,
        competitionName: r.competition_name as string, round: r.draw_round as number, slot: r.draw_slot as number, tripId: r.trip_id as string,
        code: 'ABC123', date: '2026-08-10', roundId: r.round_id as string, nameA: r.name_a as string, nameB: r.name_b as string,
        clubA: r.club_a as string | null, clubB: r.club_b as string | null, tagA: r.tag_a as string, tagB: r.tag_b as string,
        format: r.format as TieRecord['format'], settled: null, playoffRoundId: null,
      })
      return 'ok'
    },
    deleteTrip: async () => undefined,
    async updateTie(tid, patch) {
      const t = ties.find(x => x.id === tid)!
      if ('club_a' in patch) t.clubA = patch.club_a as string
      if ('club_b' in patch) t.clubB = patch.club_b as string
      if ('settled' in patch) t.settled = patch.settled as TieRecord['settled']
      if ('playoff_round_id' in patch) t.playoffRoundId = patch.playoff_round_id as string
    },
    players: async trip => players.filter(p => p.tripId === trip),
    async addPlayer(trip, p) { const pid = id(); players.push({ tripId: trip, id: pid, name: p.name, handicap: p.handicap, teamId: p.teamId, gender: p.gender }); return pid },
    async updatePlayer(trip, pid, patch) { Object.assign(players.find(p => p.id === pid)!, patch) },
    async removePlayer(trip, pid) { players.splice(players.findIndex(p => p.id === pid), 1) },
    matches: async (trip, rid) => matches.filter(m => m.tripId === trip && m.roundId === rid),
    matchScored: async () => false,
    async setMatchSide(trip, rid, slot, side, ids) {
      let m = matches.find(x => x.tripId === trip && x.roundId === rid && x.slot === slot)
      if (!m) { m = { tripId: trip, roundId: rid, id: id(), slot, sideA: [], sideB: [], result: null, margin: null }; matches.push(m) }
      if (side === 'a') m.sideA = ids; else m.sideB = ids
    },
    async setMatchResult(trip, rid, slot, result, margin) {
      let m = matches.find(x => x.tripId === trip && x.roundId === rid && x.slot === slot)
      if (!m) { m = { tripId: trip, roundId: rid, id: id(), slot, sideA: [], sideB: [], result: null, margin: null }; matches.push(m) }
      m.result = result; m.margin = margin
    },
    readBoards: async trip => boards.get(trip),
    writeBoards: async (trip, b) => { boards.set(trip, b) },
    insertPlayoffRound: async () => undefined,
    roundCourse: async () => 'course',
    searchMembers: async () => [{ id: 'm1', name: 'Seán Kelly', index: 8.2, gender: 'M' }],
    // A tie's cards as sessionMatches.ts reads them: holes marked by hand, nobody's scores.
    tieCards: async t => matches.filter(m => m.tripId === t.tripId).map(m => {
      const r: SessionMatchResult = { id: m.id, roundId: m.roundId, slot: m.slot, sideA: [...m.sideA], sideB: [...m.sideB], result: m.result, margin: m.margin }
      const mk = readHoleMarks(marks.get(m.id))
      if (mk.size === 0) return r
      const side = (key: string, ids: string[]) => ({ id: key, name: key, players: ids.map(pid => ({ id: pid, name: pid, gender: 'M', receives: 0 })) })
      const [A, B] = [side('A', [...m.sideA]), side('B', [...m.sideB])]
      const played = playSessionCard(plainHoles(), A, B, new Map(), m.roundId === t.playoffRoundId ? 'sudden' : t.format.tie, mk)
      if (!m.result) {
        Object.assign(r, {
          live: true, leader: played.state.leader === 'A' ? 'a' : played.state.leader === 'B' ? 'b' : null,
          progress: played.state.progress, up: played.state.up, thru: played.state.thru,
          decided: played.state.settled, final: sessionResult(played.state),
        })
      }
      r.detail = { holes: played.holes, outcomes: played.outcomes, a: A, b: B, scores: {} }
      return r
    }),
    async markHole(trip, mid, hole, w) { marks.set(mid, withHoleMark(marks.get(mid), hole, w)); return 'ok' },
    async noteFeed(t, results) { feed.push(results); return results.length },
  }
  return { store, ties, players, matches, boards, marks, feed, made: () => made }
}

async function main() {
  const now = new Date('2026-08-01T10:00:00Z')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ask = async (s: InterclubStore, who: string | null, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> }> =>
    runInterclub({ token: who, body }, s, now)
  const setupBody = { action: 'setup', province: 'connacht', slug: 'connacht-shield-m', round: 0, slot: 3, clubId: 'sligo', courseId: 'course', date: '2026-08-09', format: competitionFormat('Connacht Shield (m)') }

  section('Setting a match up (stage 2)')
  {
    const { store, ties, made } = memoryStore()
    eq((await ask(store, null, setupBody)).status, 401, 'signed out: refused')
    eq((await ask(store, 'mary', setupBody)).status, 403, 'a member who is no team captain: refused (D358)')
    eq((await ask(store, 'dave', { ...setupBody, clubId: 'sligo' })).status, 403, 'a captain of another club, for this one: refused')
    const out = await ask(store, 'ross', setupBody)
    eq([out.status, out.body.code], [200, 'ABC123'], 'a team captain of a club on the draw sets it up')
    const row = made()!
    eq([row.name, row.kind, row.description], ['Co. Sligo v Strandhill', 'tournament', 'Connacht Shield (m)'], 'the event: the two clubs, the competition beside')
    eq((row.event_permissions as Record<string, boolean>).score_session_matches, true, 'anybody with the link scores')
    eq([ties[0].clubA, ties[0].clubB], ['sligo', null], 'its club on its side, the other open')
    eq((await ask(store, 'ross', setupBody)).status, 409, 'a match is set up once')
    const pub = await ask(store, null, { action: 'ties', competitionId: '12642291381881043035' })
    eq((pub.body.ties as { code: string; taken: unknown }[]).map(t => [t.code, t.taken]), [['ABC123', { a: true, b: false }]], 'the draw page lists it for anybody')
  }
  {
    const { store } = memoryStore({ draw: { a: 'Ballina', b: 'Westport' } })
    const out = await ask(store, 'ross', setupBody)
    eq(out.status, 403, 'a club not in the match on the draw cannot set it up')
    ok(String(out.body.ok === false && out.body.error).includes('name in the draws'), '…and is told how to say the name the draws use')
  }

  section('Filling the sides, settling, the playoff')
  {
    const { store, ties } = memoryStore()
    await ask(store, 'ross', setupBody)
    const tie = (b: Record<string, unknown>, who = 'ross') => ask(store, who, { ...b, code: 'ABC123' })
    eq((await tie({ action: 'player.add', side: 'b', name: 'Dave', index: '6' }, 'dave')).status, 403, 'the other club’s captain fills nothing before taking the side')
    eq((await tie({ action: 'player.add', side: 'b', name: 'Visitor One', index: '9.1' })).status, 200, 'the captain who set it up fills the other side while it is open')
    eq((await tie({ action: 'take', clubId: 'strand' }, 'dave')).status, 200, 'the other club’s captain takes their side')
    eq(ties[0].clubB, 'strand', '…and it is theirs')
    eq((await tie({ action: 'player.add', side: 'b', name: 'Visitor Two', index: '4' })).status, 403, 'then only they fill it')
    for (const [who, side, name] of [['ross', 'a', 'Ross'], ['ross', 'a', 'Mary'], ['ross', 'a', 'Pat'], ['ross', 'a', 'Joe'], ['dave', 'b', 'Dave'], ['dave', 'b', 'Tom'], ['dave', 'b', 'Ann']] as const) {
      await tie({ action: 'player.add', side, name, index: '10' }, who)
    }
    const view = (await tie({ action: 'tie' })).body.tie as { players: { id: string; name: string; side: string }[]; may: unknown; format: { matches: number } }
    eq(view.may, { a: true, b: false, run: true }, 'what this captain may do')
    const idOf = (n: string) => view.players.find(p => p.name === n)!.id
    eq((await tie({ action: 'match.side', slot: 0, side: 'a', playerIds: [idOf('Ross')] })).status, 400, 'foursomes need a pair')
    eq((await tie({ action: 'match.side', slot: 0, side: 'a', playerIds: [idOf('Ross'), idOf('Mary')] })).status, 200, 'a pair a side')
    eq((await tie({ action: 'match.side', slot: 1, side: 'a', playerIds: [idOf('Ross'), idOf('Pat')] })).status, 400, 'nobody twice')
    eq((await tie({ action: 'match.side', slot: 0, side: 'b', playerIds: [idOf('Dave'), idOf('Tom')] })).status, 403, 'never the other club’s side')
    eq((await tie({ action: 'player.remove', playerId: idOf('Ross') })).status, 409, 'a player in a match stays until taken out of it')
    eq((await tie({ action: 'match.settle', slot: 3, result: 'a' }, 'mary')).status, 403, 'a member who is no captain settles nothing')
    const s = await tie({ action: 'match.settle', slot: 3, result: 'a' })
    eq((s.body.tie as { matches: { slot: number; margin: string | null }[] }).matches[3].margin, 'W/O', 'a match against a vacant side settled is a walkover (D354)')
    for (const [slot, result] of [[0, 'b'], [1, 'halved'], [2, 'halved']] as const) await tie({ action: 'match.settle', slot, result })
    const level = (await tie({ action: 'tie' })).body.tie as { outcome: { state: string } }
    eq(level.outcome.state, 'level', 'level after every match: 2–2')
    eq((await tie({ action: 'playoff', a: [idOf('Pat')], b: [idOf('Dave')] })).status, 409, 'a playoff pair must have played together')
    await tie({ action: 'match.side', slot: 0, side: 'b', playerIds: [idOf('Dave'), idOf('Tom')] }, 'dave')
    const po = await tie({ action: 'playoff', a: [idOf('Ross'), idOf('Mary')], b: [idOf('Dave'), idOf('Tom')] }, 'dave')
    eq(po.status, 409, 'a match with a result keeps its players — the playoff checks who played')
    const ok2 = await tie({ action: 'settle', winner: 'b', note: 'Conceded on the 18th green' }, 'dave')
    eq((ok2.body.tie as { outcome: { line: string } }).outcome.line, 'Settled: Strandhill go through', 'either captain settles the tie (D361)')
    eq((await tie({ action: 'settle', winner: null })).status, 200, 'and it can be taken off')

    section('The members app: a club’s ties for its members (D357)')
    eq((await ask(store, 'mary', { action: 'club', slug: 'nowhere' })).status, 403, 'a club this account is not on: refused')
    const seen = await ask(store, 'mary', { action: 'club', slug: 'sligo' })
    eq([seen.status, seen.body.captain, (seen.body.ties as { code: string; side: string }[]).map(t => [t.code, t.side])], [200, false, [['ABC123', 'a']]],
      'a member who is no captain sees the club’s tie, from its own side')
    ok(String((seen.body.ties as { line: string }[])[0].line).includes('2–2'), 'with where it stands')
    eq((await ask(store, 'dave', { action: 'club', slug: 'strand' })).body.captain, true, 'the other club’s captain sees it as theirs too')
  }

  section('The stream: live ties, holes marked, a result without its holes (D363)')
  {
    const { store, ties, feed } = memoryStore()
    await ask(store, 'ross', setupBody)
    const tie = (b: Record<string, unknown>, who = 'ross') => ask(store, who, { ...b, code: 'ABC123' })
    await tie({ action: 'take', clubId: 'strand' }, 'dave')
    for (const [who, side, name] of [['ross', 'a', 'Ross'], ['ross', 'a', 'Mary'], ['ross', 'a', 'Pat'], ['ross', 'a', 'Joe'], ['dave', 'b', 'Dave'], ['dave', 'b', 'Tom'], ['dave', 'b', 'Ann'], ['dave', 'b', 'Bob']] as const) {
      await tie({ action: 'player.add', side, name, index: '10' }, who)
    }
    const v = (await tie({ action: 'tie' })).body.tie as { players: { id: string; name: string }[] }
    const idOf = (nm: string) => v.players.find(p => p.name === nm)!.id
    await tie({ action: 'match.side', slot: 0, side: 'a', playerIds: [idOf('Ross'), idOf('Mary')] })
    await tie({ action: 'match.side', slot: 0, side: 'b', playerIds: [idOf('Dave'), idOf('Tom')] }, 'dave')
    await tie({ action: 'match.side', slot: 1, side: 'a', playerIds: [idOf('Pat'), idOf('Joe')] })
    await tie({ action: 'match.side', slot: 1, side: 'b', playerIds: [idOf('Ann'), idOf('Bob')] }, 'dave')
    ties[0].date = '2026-08-01'

    eq((await ask(store, null, { action: 'live' })).status, 401, 'signed out: nothing')
    const live = await ask(store, 'mary', { action: 'live', slug: 'sligo' })
    const lt = (live.body.ties as { code: string; mine: string; live: boolean; matches: { next: number | null; line: string }[] }[])
    eq([live.status, lt.map(t => [t.code, t.mine, t.live])], [200, [['ABC123', 'a', true]]], 'a member sees their club’s tie live on its day, from their side')
    eq([lt[0].matches[0].next, lt[0].matches[2].line], [1, 'To be set'], 'a match from the 1st; one with nobody in it to be set')
    eq((await ask(store, 'mary', { action: 'live', slug: 'strand' })).status, 403, 'never another club’s')
    eq((await ask(store, 'mary', { action: 'live', code: 'ABC123' })).status, 200, 'one tie by its code for its own stream')

    eq((await tie({ action: 'match.mark', slot: 0, hole: 1, winner: 'a' }, 'nobody')).status, 403, 'somebody on neither club’s list marks nothing from the stream')
    eq((await tie({ action: 'match.mark', slot: 2, hole: 1, winner: 'a' }, 'mary')).status, 409, 'a match with nobody in it takes no mark')
    eq((await tie({ action: 'match.mark', slot: 0, hole: 2, winner: 'a' }, 'mary')).status, 409, 'holes in order')
    let after = await tie({ action: 'match.mark', slot: 0, hole: 1, winner: 'a' }, 'mary')
    eq((after.body.tie as { matches: { line: string; next: number }[] }).matches[0].line, 'Co. Sligo 1 up thru 1', 'a member marks the 1st: 1 up thru 1')
    after = await tie({ action: 'match.mark', slot: 0, hole: 2, winner: 'halved' }, 'dave')
    eq((after.body.tie as { matches: { next: number }[] }).matches[0].next, 3, 'the other club’s member marks the 2nd halved — the 3rd next')
    after = await tie({ action: 'match.mark', slot: 0, hole: 1, winner: 'b' }, 'dave')
    eq((after.body.tie as { matches: { line: string }[] }).matches[0].line, 'Strandhill 1 up thru 2', 'an earlier hole amended')
    eq((await tie({ action: 'match.result', slot: 1, result: 'a', margin: '12&9' }, 'mary')).status, 400, 'a margin that cannot be is refused')
    const res = await tie({ action: 'match.result', slot: 1, result: 'a', margin: '3&2' }, 'mary')
    const rt = res.body.tie as { matches: { result: string; margin: string }[]; score: unknown }
    eq([rt.matches[1].result, rt.matches[1].margin, rt.score], ['a', '3&2', { a: '1', b: '0' }], 'the result alone, when the holes are not known')
    eq((await tie({ action: 'match.result', slot: 1, result: 'b' }, 'dave')).status, 409, 'a match with its result is a captain’s to change')
    const last = feed[feed.length - 1]
    eq(last.map(f => [f.key, f.line, f.club]), [['interclub:tie1:1', 'Match 2 · Co. Sligo won 3&2 — Co. Sligo 1–0 Strandhill', 'Co. Sligo']], 'the result into the stream, the clubs named, never the players')
    for (const [slot, result] of [[0, 'b'], [2, 'b'], [3, 'b']] as const) await tie({ action: 'match.settle', slot, result })
    const won = feed[feed.length - 1]
    ok(won.some(f => f.key === 'interclub:tie1:tie' && f.line.startsWith('Strandhill win 3–1')), 'the tie once won, into the stream')
    const gone = await ask(store, 'mary', { action: 'live', slug: 'sligo' })
    eq((gone.body.ties as unknown[]).length, 0, 'a tie won is no longer live')
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { console.log('\nFailures:\n  ' + failures.join('\n  ')); process.exit(1) }
}
void main()
