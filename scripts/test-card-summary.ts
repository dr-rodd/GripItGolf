/**
 * Stage (f): a summary row per signed card — the rule (lib/cardSummary.ts),
 * the writer on a stand-in (app/api/stats/summaries.ts), migration 088, and
 * every place a card changes asking for its summary again.
 *
 *   npx tsx scripts/test-card-summary.ts
 */
import fs from 'fs'
import type { HoleStat } from '../lib/holeStats'
import { CARD_SUMMARY_RULES, seasonOf, selfClaimedLine, summariseRound, type CardSummary, type SeasonRow } from '../lib/cardSummary'
import { writeRoundSummaries, type SummaryDeps } from '../app/api/stats/summaries'

let passed = 0, failed = 0
const failures: string[] = []
function ok(c: boolean, label: string) {
  if (c) { passed++; return }
  failed++; failures.push(label); console.log(`  ✗ ${label}`)
}
function eq<T>(a: T, b: T, label: string) {
  const same = JSON.stringify(a) === JSON.stringify(b)
  if (!same) console.log(`    got      ${JSON.stringify(a)}\n    expected ${JSON.stringify(b)}`)
  ok(same, label)
}
function section(s: string) { console.log(`\n${s}`) }
const read = (f: string) => fs.readFileSync(f, 'utf8')
const NOW = new Date('2026-11-15T12:00:00Z')

/** A hole as lib/holeStats.ts hands it over. */
function hole(o: Partial<HoleStat> & { playerId: string; holeNumber: number; gross: number }): HoleStat {
  const par = o.par ?? 4
  const putts = o.putts === undefined ? 2 : o.putts
  const toGreen = putts == null ? null : o.gross - putts
  return {
    roundId: 'r1', holeId: `h${o.holeNumber}`, courseId: 'c1', par, strokeIndex: o.holeNumber,
    points: Math.max(0, par + 2 - o.gross), handicap: 12, live: false,
    putts, fairway: par >= 4 ? 'fairway' : null, strokesToGreen: toGreen,
    gir: toGreen == null ? null : toGreen <= par - 2, fairwayCounted: par >= 4, noReturn: false,
    ...o,
  } as HoleStat
}

function ruleTests() {
  section('A signed card summed up (D121)')
  const ross = Array.from({ length: 18 }, (_, i) => hole({ playerId: 'ross', holeNumber: i + 1, gross: i === 0 ? 3 : i === 1 ? 6 : 4 }))
  const dave = [hole({ playerId: 'dave', holeNumber: 1, gross: 5 }), hole({ playerId: 'dave', holeNumber: 2, gross: 9, noReturn: true, points: 0, putts: null })]
  const liveOnly = [hole({ playerId: 'ann', holeNumber: 1, gross: 4, live: true })]
  const otherRound = [hole({ playerId: 'ross', holeNumber: 1, gross: 4, roundId: 'r2' })]
  const facts = { tripId: 't1', roundId: 'r1', courseId: 'c1', playedOn: '2026-11-14', clubId: null, teeOf: new Map([['ross', 'tee-white']]), now: NOW }
  const rows = summariseRound([...ross, ...dave, ...liveOnly, ...otherRound], facts)
  eq(rows.map(r => r.player_id), ['dave', 'ross'], 'one row per player with a signed card — a card still open has none')
  const r = rows.find(x => x.player_id === 'ross')!
  eq([r.holes, r.gross, r.par, r.points], [18, 73, 72, 2 + 3 + 0 + 15 * 2], 'holes, gross, par and Stableford points added up')
  eq([r.birdies, r.pars, r.doubles, r.eagles, r.bogeys], [1, 16, 1, 0, 0], 'birdies, pars and doubles counted as the stats hub counts them')
  eq([r.putts, r.putts_holes, r.fairways_hit, r.fairways_tried], [36, 18, 18, 18], 'putts and fairways, with what they were counted over')
  eq([r.gir, r.gir_holes], [17, 18], 'greens in regulation from lib/holeStats.ts, never a second copy')
  eq([r.tee_id, r.course_handicap, r.played_on, r.course_id], ['tee-white', 12, '2026-11-14', 'c1'], 'the tee, the handicap, the day and the course')
  eq([r.origin, r.club_id, r.rules_version], ['self_claimed', null, CARD_SUMMARY_RULES], 'an open event’s round is self-claimed (D122)')
  const d = rows.find(x => x.player_id === 'dave')!
  eq([d.holes, d.no_returns, d.gross, d.points, d.doubles], [2, 1, null, 1, 0], 'a no return: counted as a hole, no gross for the card, a real zero in the points, never a double')
  const club = summariseRound(ross, { ...facts, clubId: 'club-1' })
  eq([club[0].origin, club[0].club_id], ['club', 'club-1'], 'a verified club’s event is a club round')

  section('A golfer’s season (D143)')
  const row = (o: Partial<SeasonRow>): SeasonRow => ({ round_id: 'x', trip_id: 't', played_on: '2026-05-01', holes: 18, gross: 80, par: 72, points: 34, origin: 'club', club_id: 'c', course_id: 'c1', ...o })
  const season = seasonOf([row({ points: 30 }), row({ points: 38, origin: 'self_claimed' }), row({ holes: 9, points: 20 })])
  eq(season, { rounds: 3, averagePoints: 34, bestPoints: 38, selfClaimed: 1 }, 'rounds, the average and best over full rounds only, and how many are self-claimed')
  ok(/1 of these is a round from open events, self-claimed — never counted for Lahinch honours\./.test(selfClaimedLine(season, 'Lahinch') ?? ''), 'the self-claimed line says what they are (D122)')
  eq(selfClaimedLine(seasonOf([row({})]), 'Lahinch'), null, '…and is not drawn when every round was a club round')
  eq(seasonOf([]), { rounds: 0, averagePoints: null, bestPoints: null, selfClaimed: 0 }, 'no rounds: nothing to average')
}

async function writerTests() {
  section('Writing a round’s summaries')
  const written: CardSummary[][] = []
  const removed: { roundId: string; keep: string[] }[] = []
  const stats = [hole({ playerId: 'ross', holeNumber: 1, gross: 4 })]
  const deps: SummaryDeps = {
    async readRound(code, roundId) {
      return code === 'GX7K2P' ? { tripId: 't1', roundId, courseId: 'c1', playedOn: '2026-11-14', stats, teeOf: new Map() } : null
    },
    async verifiedClubOf(tripId) { return tripId === 't1' ? 'club-1' : null },
    async upsert(rows) { written.push(rows) },
    async removeOthers(roundId, keep) { removed.push({ roundId, keep }) },
  }
  eq(await writeRoundSummaries('NOPE00', 'r1', deps, NOW), { missing: true }, 'a round that is not the event’s writes nothing')
  eq(await writeRoundSummaries('GX7K2P', 'r1', deps, NOW), { written: 1 }, 'a round’s signed cards written')
  eq(written[0][0].origin, 'club', '…told whether the event is a verified club’s')
  eq(removed[0], { roundId: 'r1', keep: ['ross'] }, '…and any row for a card no longer signed — a void — let go')
  stats.length = 0
  eq(await writeRoundSummaries('GX7K2P', 'r1', deps, NOW), { written: 0 }, 'a voided round has no rows left')
  eq(removed[1], { roundId: 'r1', keep: [] }, '…every one of its rows taken away')
}

function wiringTests() {
  section('Migration 088')
  const sql = read('supabase/migrations/20260101000088_card_summaries.sql')
  const body = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  ok(/PRIMARY KEY \(round_id, player_id\)/.test(body), 'one row per player per round')
  ok(/origin\s+text\s+NOT NULL DEFAULT 'self_claimed' CHECK \(origin IN \('club', 'self_claimed'\)\)/.test(body), 'a round is a club round or self-claimed — nothing else')
  ok(/ENABLE ROW LEVEL SECURITY/.test(body) && /REVOKE ALL ON public\.card_summaries FROM anon, authenticated/.test(body) && !/CREATE POLICY/.test(body),
    'server only: RLS on, no policy, closed to phones by name')
  ok(/idx_card_summaries_player ON card_summaries\(player_id, played_on\)/.test(body) && /idx_card_summaries_club/.test(body), 'read by player and by club')
  ok(/-- ─── Undo/.test(sql) && /DROP TABLE IF EXISTS card_summaries/.test(sql), 'with its undo')

  section('Every change to a card asks for its summary again')
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  ok(/outbox\.discardRound\([\s\S]{0,300}summariseCard\(tripCode, roundId\)\s*\n\s*onBack\(\)/.test(flow), 'committing a card, once it is signed')
  ok((read('app/scoring/[slug]/CourseDashboardClient.tsx').match(/summariseCard\(tripCode/g) ?? []).length === 2, 'voiding a card, one or the round’s all')
  ok(/writeRoundSummaries\(code, roundId, summaryDeps\(db\)/.test(read('app/admin/live/actions.ts')), 'voiding from /admin')
  ok(/writeRoundSummaries\(tripCode, id, deps/.test(read('app/api/card-check/apply/route.ts')), 'a card check re-scoring a course')
  ok(/fillSummaries\(\{ limit: 40/.test(read('app/api/cleanup/route.ts')), 'the nightly backstop for anything a lost signal missed')
  ok(/retagSummaries\(db, \[tripId\]\)/.test(read('app/api/entry/store.ts')) && /retagSummaries\(/.test(read('app/admin/clubs/actions.ts')),
    'an event moving into or out of a club, or its club verified or not, retold — never re-read')
  ok(/backfillSummaries/.test(read('app/admin/trips/SummaryBackfill.tsx')), 'and the backfill on /admin for every round signed before')
  const entryClient = read('lib/entryClient.ts')
  ok(/export function summariseCard[\s\S]*?void ask\('\/api\/stats\/card'/.test(entryClient), 'the phone asks and never waits')
  ok(!/from\('card_summaries'\)/.test(entryClient + flow), 'no phone touches the table')
  ok(/trip_members[\s\S]*eq\('user_id', u\.user\.id\)/.test(read('app/api/stats/card/route.ts')), 'only a member of the event may ask for its summaries')

  section('Read where the plan says (D143)')
  ok(/const STATS_READY = true/.test(read('app/club/[slug]/ClubTabBar.tsx')), 'the club area’s Stats tab is on')
  ok(/m\.season\.length > 0 &&/.test(read('app/club/[slug]/ClubView.tsx')), 'Your season is drawn only when there is one')
  ok(/from\('account_players'\)[\s\S]{0,300}from\('card_summaries'\)/.test(read('app/api/club/store.ts')), 'a member reads only their own players’ rows')
  ok(/a short summary of each signed card/.test(read('app/privacy/page.tsx')), 'the privacy notice says a summary is kept')
}

async function main() {
  ruleTests()
  await writerTests()
  wiringTests()
  console.log(`\n${'─'.repeat(56)}`)
  if (failed > 0) {
    console.log(`✗ ${failed} failed, ${passed} passed`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log(`✓ all ${passed} checks passed`)
}

void main()
