/**
 * Live score reconciliation. Run with: npm run test:live-scores
 *
 * The data-loss bug this exists to prevent, in full:
 *
 *   1. A group scores nine holes. Every one is written to `live_scores` as
 *      it is entered, so the round is safe on the server.
 *   2. Somebody leaves the card and comes back.
 *   3. The resume read `live_scores` naming a `no_return` column that only
 *      exists on `scores`. The select failed, the error was swallowed by a
 *      `?? []`, and the card came back empty — hole 1, blank.
 *   4. They re-enter three holes and submit. Commit trusted the card in
 *      memory, treated every hole missing from it as a no return, and
 *      deleted the round's committed scores first.
 *
 *   Holes 4–18: written off as NRs with a max score. Silently.
 *
 * Steps 1 and 3 are queries and are pinned in test:scorecard. This file is
 * step 4 — the reconciliation that makes a partial card unable to destroy a
 * complete one, whatever the reason it arrived partial.
 */

import fs from 'fs'
import { liveRoundPresence } from '../lib/rowContext'
import {
  isScored, mergeSaved, anyScored, holesScored,
  type Card, type SavedScore,
} from '../lib/liveScores'
import {
  cardsToClose, deadScoreKeys, lastActivity,
  EMPTY_AFTER_HOURS, ABANDONED_AFTER_HOURS, RESIDUE_AFTER_HOURS,
  type LiveCard, type CardLock, type ScoreActivity,
} from '../lib/staleLive'

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

// ─── Fixtures ──────────────────────────────────────────────────

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)

const score = (gross: number | null, isNR = false, putts: number | null = null) =>
  ({ gross, isNR, stableford: gross == null ? null : 2, putts, fairway: null })

const saved = (
  playerId: string, holeNumber: number, gross: number, putts: number | null = null,
): SavedScore =>
  ({
    player_id: playerId, hole_number: holeNumber, gross_score: gross,
    stableford_points: 2, putts, fairway_hit: putts == null ? null : 'fairway',
  })

// ─── What counts as an answer ──────────────────────────────────

section('A hole either has an answer or it does not')
{
  ok(isScored(score(5)), 'a gross score is an answer')
  ok(isScored(score(null, true)), 'and so is a pick-up — somebody decided that')
  ok(!isScored(score(null)), 'an empty slot is not')
  ok(!isScored(undefined), 'and neither is a hole nobody has reached')
}

// ─── The bug ───────────────────────────────────────────────────

section('A half-remembered card cannot erase a full one')
{
  // Nine holes played and saved. The card comes back holding only three,
  // which is exactly what a failed resume followed by re-entry looks like.
  const savedRows = HOLES.slice(0, 9).map(h => saved('p1', h, 5))
  const partial: Card = {
    0: { p1: score(4) },
    1: { p1: score(6) },
    2: { p1: score(5) },
  }

  const merged = mergeSaved(partial, savedRows, HOLES)

  eq(holesScored(merged, 'p1'), 9,
    'all nine come back, not the three that were re-entered')

  // The three re-entered holes are the newer answer and must win
  eq(merged[0].p1.gross, 4, 're-entered holes keep the value just typed')
  eq(merged[1].p1.gross, 6, '  …all of them')
  eq(merged[2].p1.gross, 5, '  …including one that matches what was saved')

  // The six that were not re-entered come back from the server
  for (const idx of [3, 4, 5, 6, 7, 8]) {
    eq(merged[idx]?.p1?.gross, 5, `hole ${idx + 1} is restored from what was saved`)
  }

  // And the nine never played stay empty, so they are still genuine NRs
  for (const idx of [9, 12, 17]) {
    ok(!isScored(merged[idx]?.p1), `hole ${idx + 1} was never played and stays blank`)
  }
}

section('Merging never invents, loses or reorders anything')
{
  const savedRows = [saved('p1', 1, 5), saved('p2', 1, 6), saved('p2', 2, 4)]
  const merged = mergeSaved({}, savedRows, HOLES)

  eq(merged[0].p1.gross, 5, 'each player keeps their own score on a shared hole')
  eq(merged[0].p2.gross, 6, '  …and the other keeps theirs')
  eq(merged[1].p2.gross, 4, 'a hole only one of them played is still restored')
  ok(!isScored(merged[1]?.p1), '  …without inventing one for the other')

  // A hole the card holds as an EMPTY slot is not an answer, and must still
  // be filled from what was saved. The card carries a slot for every player
  // on every hole it has visited, so "present but empty" is a real state and
  // is not the same as "answered".
  const emptySlot: Card = { 0: { p1: score(null) } }
  const filled = mergeSaved(emptySlot, [saved('p1', 1, 5)], HOLES)
  eq(filled[0].p1.gross, 5, 'an empty slot is filled from what was saved')
  ok(isScored(filled[0].p1), '  …and becomes a real answer')

  // An explicit pick-up in memory is an answer, so the server must not
  // overwrite it with the max-gross row it was stored as
  const pickedUp: Card = { 0: { p1: score(null, true) } }
  const afterMerge = mergeSaved(pickedUp, [saved('p1', 1, 9)], HOLES)
  ok(afterMerge[0].p1.isNR, 'a pick-up on this device survives the merge')
  eq(afterMerge[0].p1.gross, null, '  …and is not given the score it was saved as')

  // A row for a hole this course does not have is dropped, not crashed on
  const strays = mergeSaved({}, [saved('p1', 99, 5)], HOLES)
  eq(Object.keys(strays).length, 0, 'a row for an unknown hole is ignored')

  // Nulls in the saved data are not answers
  const nulls = mergeSaved({}, [
    { player_id: 'p1', hole_number: 1, gross_score: null, stableford_points: null },
  ], HOLES)
  ok(!isScored(nulls[0]?.p1), 'a saved row with no gross is not an answer either')

  // The input is not mutated — the card is React state
  const original: Card = { 0: { p1: score(4) } }
  const snapshot = JSON.stringify(original)
  mergeSaved(original, [saved('p1', 2, 5)], HOLES)
  eq(JSON.stringify(original), snapshot, 'the card handed in is left alone')
}

section('Putts and fairways travel with the hole they belong to')
{
  // The unit is the hole, not the field. A saved row that fills a gap arrives
  // whole — its stats included — which is the only reason a resume keeps
  // them. Leave them out of the merge and every stat entered before an
  // interruption is silently dropped, then written over by the next submit.
  const filled = mergeSaved({}, [saved('p1', 1, 4, 2)], HOLES)
  eq(filled[0].p1.putts, 2, 'a restored hole brings its putt count back')
  eq(filled[0].p1.fairway, 'fairway', '  …and which way the tee shot went')

  // A saved row with no stats restores nulls rather than nothing, so the
  // shape is the same either way.
  const bare = mergeSaved({}, [saved('p1', 1, 4)], HOLES)
  eq(bare[0].p1.putts, null, 'a hole saved before stats existed restores as null')
  eq(bare[0].p1.fairway, null, '  …on both fields, never as zero')

  // Where memory has an answer it keeps its own stats, even where they are
  // null and the saved row has some. The card in front of somebody is what
  // they last said about that hole, and half-taking a saved row would leave a
  // hole holding one person's gross and another's putts.
  const remembered: Card = { 0: { p1: score(5) } }
  const kept = mergeSaved(remembered, [saved('p1', 1, 4, 3)], HOLES)
  eq(kept[0].p1.gross, 5, 'memory wins the gross, as before')
  eq(kept[0].p1.putts, null, '  …and wins the putts with it, rather than borrowing')

  // The other direction: memory holds the stats, the saved row is older.
  const withStats: Card = { 0: { p1: score(4, false, 2) } }
  const unchanged = mergeSaved(withStats, [saved('p1', 1, 4, 3)], HOLES)
  eq(unchanged[0].p1.putts, 2, 'a stat typed on this device is not overwritten')
}

section('Hole numbers are not assumed to be positions')
{
  // A nine-hole course starting at the tenth. The card is keyed by position
  // and live_scores by the number on the flag; conflating them would file
  // every score against the wrong hole.
  const back9 = [10, 11, 12, 13, 14, 15, 16, 17, 18]
  const merged = mergeSaved({}, [saved('p1', 10, 4), saved('p1', 18, 6)], back9)

  eq(merged[0].p1.gross, 4, 'the tenth is the first position on this card')
  eq(merged[8].p1.gross, 6, 'and the eighteenth is the ninth')
  ok(!isScored(merged[9]?.p1), 'with nothing filed past the end of the course')
}

// ─── The guard ─────────────────────────────────────────────────

section('A blank card is never submitted')
{
  ok(!anyScored({}), 'an empty card has nothing on it')
  ok(!anyScored({ 0: {} }), 'nor has one with an empty hole')
  ok(!anyScored({ 0: { p1: score(null) } }), 'nor one with an empty slot')

  ok(anyScored({ 0: { p1: score(4) } }), 'one real score is enough to submit')
  ok(anyScored({ 0: { p1: score(null, true) } }),
    'and so is a single pick-up — a card of nothing but NRs is a real card')

  // The case the guard exists for: nothing typed, nothing saved. Submitting
  // would write eighteen no returns per player over whatever was there.
  ok(!anyScored(mergeSaved({}, [], HOLES)),
    'a card that is blank after merging is still blank, and is refused')
}

section('Counting a player\'s answers')
{
  const card: Card = {
    0: { p1: score(4), p2: score(5) },
    1: { p1: score(null, true) },
    2: { p2: score(null) },
  }
  eq(holesScored(card, 'p1'), 2, 'a pick-up counts towards a player\'s holes')
  eq(holesScored(card, 'p2'), 1, 'an empty slot does not')
  eq(holesScored(card, 'nobody'), 0, 'and somebody not on the card has none')
}

// ─── Cards nobody came back to ─────────────────────────────
//
// The other half of the same table. Above is what happens when a part-played
// card is picked back up; this is what happens when it never is.

const NOW = new Date('2026-08-13T20:00:00Z')
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString()

const card = (id: string, over: Partial<LiveCard> = {}): LiveCard => ({
  id, roundId: 'r1', status: 'active', activatedAt: hoursAgo(1), ...over,
})
const lock = (liveRoundId: string, playerId: string): CardLock =>
  ({ liveRoundId, playerId })
const hole = (playerId: string, roundId: string, h: number): ScoreActivity =>
  ({ playerId, roundId, submittedAt: hoursAgo(h) })

section('The thresholds are the ones written down')
{
  eq(EMPTY_AFTER_HOURS, 2, 'an empty card is given two hours')
  eq(ABANDONED_AFTER_HOURS, 12, 'a part-played one is given twelve, so it crosses a night')
  eq(RESIDUE_AFTER_HOURS, 48, 'and its rows survive a day and a half beyond that')
  ok(RESIDUE_AFTER_HOURS > ABANDONED_AFTER_HOURS,
    'closing always comes first — a card is never erased in the run that closes it')
}

section('A card with nothing on it closes on the old rule, unchanged')
{
  const fresh = [card('c1', { activatedAt: hoursAgo(1) })]
  eq(cardsToClose(fresh, [], [], NOW), [], 'a card opened an hour ago is left alone')

  const stale = [card('c1', { activatedAt: hoursAgo(3) })]
  eq(cardsToClose(stale, [], [], NOW), [{ id: 'c1', reason: 'empty' }],
    'and one opened three hours ago with nothing on it is closed')

  // The original job treated a card with no locks as empty. It still does.
  const locked = [card('c1', { activatedAt: hoursAgo(3) })]
  eq(cardsToClose(locked, [lock('c1', 'p1')], [], NOW),
    [{ id: 'c1', reason: 'empty' }],
    'a card with players selected but no hole entered is empty too')
}

section('A part-played card closes on the last hole entered, not on when it opened')
{
  const cards = [card('c1', { activatedAt: hoursAgo(72) })]
  const locks = [lock('c1', 'p1')]

  // The one that matters most. A long round, a card resumed the next
  // morning, a group that started three days ago and is playing right now —
  // all of them are still in play, and closing one takes the scores off the
  // board mid-round.
  eq(cardsToClose(cards, locks, [hole('p1', 'r1', 0.2)], NOW), [],
    'a card opened three days ago and scored ten minutes ago is still in play')
  eq(cardsToClose(cards, locks, [hole('p1', 'r1', 5)], NOW), [],
    'and one last touched five hours ago is a round still going')

  eq(cardsToClose(cards, locks, [hole('p1', 'r1', 13)], NOW),
    [{ id: 'c1', reason: 'abandoned' }],
    'thirteen hours since the last hole is a card nobody came back to')

  // The newest hole is what counts, not the oldest.
  eq(cardsToClose(cards, locks, [hole('p1', 'r1', 30), hole('p1', 'r1', 2)], NOW), [],
    'the most recent hole is what says whether anybody is still there')
}

section('Only an active card is ever closed')
{
  const locks = [lock('c1', 'p1')]
  const old = [hole('p1', 'r1', 200)]

  eq(cardsToClose([card('c1', { status: 'finalised' })], locks, old, NOW), [],
    'a finalised card is a signed scorecard and is never touched')
  eq(cardsToClose([card('c1', { status: 'closed' })], locks, old, NOW), [],
    'and a closed one is already closed')
}

section('A card only counts its own players, on its own round')
{
  const cards = [card('c1'), card('c2', { roundId: 'r2' })]
  const locks = [lock('c1', 'p1'), lock('c2', 'p2')]

  // p2 is playing right now, on another round. That must not hold c1 open.
  eq(lastActivity(cards[0], locks, [hole('p2', 'r2', 0.1)]), null,
    'another group\'s card is not this one\'s activity')
  // p1 scoring on a different round is not this card's activity either.
  eq(lastActivity(cards[0], locks, [hole('p1', 'r2', 0.1)]), null,
    'and neither is this player on a different round')
  ok(lastActivity(cards[0], locks, [hole('p1', 'r1', 0.1)]) !== null,
    'this player, this round, is')
}

section('A row is dead only when no card can reach it')
{
  const old = [hole('p1', 'r1', 100)]

  eq(deadScoreKeys(old, [card('c1')], [lock('c1', 'p1')], NOW), [],
    'an active card can be resumed, so its rows stay')
  eq(deadScoreKeys(old, [card('c1', { status: 'finalised' })], [lock('c1', 'p1')], NOW), [],
    'a finalised card keeps its locks so unfinalising works, so its rows stay too')

  eq(deadScoreKeys(old, [card('c1', { status: 'closed' })], [lock('c1', 'p1')], NOW),
    [{ playerId: 'p1', roundId: 'r1' }],
    'a closed card can be reached by nothing, so its rows go')
  eq(deadScoreKeys(old, [], [], NOW), [{ playerId: 'p1', roundId: 'r1' }],
    'and rows whose card was deleted outright go as well')
}

section('An unreachable row is still given a day and a half')
{
  const closed = [card('c1', { status: 'closed' })]
  const locks = [lock('c1', 'p1')]

  eq(deadScoreKeys([hole('p1', 'r1', 5)], closed, locks, NOW), [],
    'a card closed this morning keeps its scores — a wrong close is recoverable')
  eq(deadScoreKeys([hole('p1', 'r1', 47)], closed, locks, NOW), [],
    'so does one just under the two days')
  eq(deadScoreKeys([hole('p1', 'r1', 49)], closed, locks, NOW),
    [{ playerId: 'p1', roundId: 'r1' }],
    'past it, the rows are removed for good')

  // The whole card has to be old, not just its first hole.
  eq(deadScoreKeys([hole('p1', 'r1', 100), hole('p1', 'r1', 3)], closed, locks, NOW), [],
    'a card is residue only once all of it is old')
}

section('A card closed by this run counts as gone in the same run')
{
  const cards = [card('c1', { activatedAt: hoursAgo(72) })]
  const locks = [lock('c1', 'p1')]
  const activity = [hole('p1', 'r1', 60)]

  const closing = cardsToClose(cards, locks, activity, NOW)
  eq(closing, [{ id: 'c1', reason: 'abandoned' }], 'the card is abandoned and closes')

  // Without this the row would be reachable through the card the run is in
  // the middle of closing, and wait a further day for no reason.
  eq(deadScoreKeys(activity, cards, locks, NOW, new Set(closing.map(c => c.id))),
    [{ playerId: 'p1', roundId: 'r1' }],
    '  …and its sixty-hour-old rows go with it, not a day later')
  eq(deadScoreKeys(activity, cards, locks, NOW), [],
    'though on its own the card still reads as active')
}

section('Two groups on one round are separated')
{
  // The mistake lib/scorecardVoid.ts exists to warn about, on the other side:
  // deleting by round would take the group still playing with it.
  const cards = [card('live'), card('dead', { status: 'closed' })]
  const locks = [lock('live', 'p1'), lock('dead', 'p2')]
  const activity = [hole('p1', 'r1', 0.5), hole('p2', 'r1', 100)]

  eq(cardsToClose(cards, locks, activity, NOW), [],
    'the group still out is not closed by the abandoned one beside it')
  eq(deadScoreKeys(activity, cards, locks, NOW), [{ playerId: 'p2', roundId: 'r1' }],
    'and only the abandoned card\'s player loses their rows')
}

// ─── A vacant card puts nothing in play ────────────────────────

section('A round is in play only while somebody is locked on a card')
{
  // The complaint that made this a rule: every real card on the final round
  // was finalised, and the round stayed green — because one vacant card,
  // opened and abandoned before anyone picked a player, still sat active.
  // An open card is a claim that a group is out on the course; the locks
  // are the group.
  const vacant = { round_id: 'r1', live_player_locks: [] }
  const manned = { round_id: 'r2', live_player_locks: [{ player_id: 'p1' }, { player_id: 'p2' }] }
  const nullLocks = { round_id: 'r3', live_player_locks: null }

  eq(liveRoundPresence([vacant]), { activeRoundIds: [], livePlayerIds: [] },
    'a vacant card claims neither its round nor any player')
  eq(liveRoundPresence([nullLocks]), { activeRoundIds: [], livePlayerIds: [] },
    'locks that never came back read the same as none')
  eq(liveRoundPresence([vacant, manned]),
    { activeRoundIds: ['r2'], livePlayerIds: ['p1', 'p2'] },
    'a manned card beside it still puts its own round in play')
  eq(liveRoundPresence([manned, { round_id: 'r2', live_player_locks: [{ player_id: 'p1' }] }]),
    { activeRoundIds: ['r2'], livePlayerIds: ['p1', 'p2'] },
    'two cards on one round are one round in play, each player counted once')

  // Every screen that answers "is this round live?" derives through the one
  // copy, and fetches the locks it needs to. Deriving inline is how a fifth
  // answer starts to drift from the other four.
  for (const page of [
    'lib/hubStanding.ts',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/scoring/page.tsx',
    'app/trip/[tripCode]/matchplay/page.tsx',
  ]) {
    const src = fs.readFileSync(page, 'utf-8')
    ok(src.includes('liveRoundPresence('),
      `${page.split('/').pop()} derives in-play through liveRoundPresence`)
    ok(src.includes('live_player_locks(player_id)'),
      `  …and fetches the locks the rule reads`)
  }
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
