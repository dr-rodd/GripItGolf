/**
 * The live cards summary. Run with: npm run test:admin-live
 *
 * `lib/adminLive.ts` arranges `lib/staleLive.ts`'s decisions for the admin
 * screen. The thresholds themselves are tested to their edges by
 * test:live-scores — what is checked here is that the arrangement does not
 * quietly disagree with the job it claims to mirror:
 *
 *   · a card the page flags "would close tonight" must be exactly a card
 *     the nightly job would close, reason and all
 *   · the hole count is scoped to the card's own players on its own round,
 *     so two groups on one round each count only their own holes
 *   · the ordering puts the card that needs a hand first, and never lets a
 *     finalised or closed card into the stale group
 */

import {
  EMPTY_AFTER_HOURS, ABANDONED_AFTER_HOURS, cardsToClose,
  type CardLock, type LiveCard, type ScoreActivity,
} from '../lib/staleLive'
import { summariseCards, orderCards, type CardSummary } from '../lib/adminLive'

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

const NOW = new Date('2026-08-10T12:00:00Z')
const hoursAgo = (h: number): string =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString()

const card = (id: string, over: Partial<LiveCard> = {}): LiveCard => ({
  id, roundId: 'r1', status: 'active', activatedAt: hoursAgo(1), ...over,
})
const lock = (liveRoundId: string, playerId: string): CardLock => ({ liveRoundId, playerId })
const holeAt = (playerId: string, roundId: string, h: number): ScoreActivity => ({
  playerId, roundId, submittedAt: hoursAgo(h),
})

const byId = (out: CardSummary[], id: string): CardSummary => {
  const found = out.find(s => s.id === id)
  if (!found) throw new Error(`no summary for ${id}`)
  return found
}

// ─── The verdict matches the nightly job ───────────────────────

section('"Would close tonight" is exactly what the job would close')
{
  const cards = [
    card('fresh-empty'),                                                    // opened an hour ago, nothing on it
    card('stale-empty', { activatedAt: hoursAgo(EMPTY_AFTER_HOURS + 1) }),  // empty past the threshold
    card('abandoned'),                                                      // holes on it, nobody back since yesterday
    card('in-play'),                                                        // holes on it, touched just now
    card('signed', { status: 'finalised', activatedAt: hoursAgo(30) }),
    card('done', { status: 'closed', activatedAt: hoursAgo(30) }),
  ]
  const locks = [
    lock('abandoned', 'p1'), lock('in-play', 'p2'),
    lock('signed', 'p3'), lock('done', 'p4'),
  ]
  const activity = [
    holeAt('p1', 'r1', ABANDONED_AFTER_HOURS + 1),
    holeAt('p2', 'r1', 0.1),
    holeAt('p3', 'r1', 26),
    holeAt('p4', 'r1', 26),
  ]

  const out = summariseCards(cards, locks, activity, NOW)
  eq(byId(out, 'fresh-empty').wouldClose, null, 'an hour-old empty card is left alone')
  eq(byId(out, 'stale-empty').wouldClose, 'empty', 'an empty card past two hours would close, as empty')
  eq(byId(out, 'abandoned').wouldClose, 'abandoned', 'a part-played card untouched overnight would close, as abandoned')
  eq(byId(out, 'in-play').wouldClose, null, 'a card being played right now is left alone')
  eq(byId(out, 'signed').wouldClose, null, 'a finalised card is never flagged — it is a signed scorecard')
  eq(byId(out, 'done').wouldClose, null, 'a closed card is never flagged — it is already closed')

  // The same inputs through the job itself must agree, id for id.
  const jobs = cardsToClose(cards, locks, activity, NOW)
  const flagged = out.filter(s => s.wouldClose !== null).map(s => ({ id: s.id, reason: s.wouldClose }))
  eq(flagged, jobs, 'the page and the nightly job name the same cards for the same reasons')
}

// ─── Scoping ───────────────────────────────────────────────────

section('Two groups on one round each count their own holes')
{
  const cards = [card('ours'), card('theirs')]
  const locks = [lock('ours', 'p1'), lock('ours', 'p2'), lock('theirs', 'p3')]
  const activity = [
    holeAt('p1', 'r1', 1), holeAt('p1', 'r1', 1.1), holeAt('p2', 'r1', 1.2),
    holeAt('p3', 'r1', 0.5),
  ]

  const out = summariseCards(cards, locks, activity, NOW)
  eq(byId(out, 'ours').holesEntered, 3, 'our card counts our three holes')
  eq(byId(out, 'theirs').holesEntered, 1, 'their card counts their one')
  eq(byId(out, 'ours').playerIds.length, 2, 'and the players listed are the locked ones')
  eq(byId(out, 'ours').lastActivity, hoursAgo(1), "our last activity is our players' newest hole, not theirs")
}

section('A hole on another round does not count')
{
  const cards = [card('c1', { roundId: 'r1' })]
  const locks = [lock('c1', 'p1')]
  const activity = [holeAt('p1', 'r2', 0.5)]

  const out = summariseCards(cards, locks, activity, NOW)
  eq(byId(out, 'c1').holesEntered, 0, "the same player's other round is not this card's activity")
  eq(byId(out, 'c1').lastActivity, null, 'and does not move its clock')
}

// ─── Ordering ──────────────────────────────────────────────────

section('The card that needs a hand comes first')
{
  const summaries: CardSummary[] = [
    { id: 'closed', roundId: 'r1', status: 'closed', activatedAt: hoursAgo(3), lastActivity: hoursAgo(0.1), playerIds: [], holesEntered: 4, wouldClose: null },
    { id: 'signed', roundId: 'r1', status: 'finalised', activatedAt: hoursAgo(3), lastActivity: hoursAgo(0.2), playerIds: ['p'], holesEntered: 18, wouldClose: null },
    { id: 'healthy', roundId: 'r1', status: 'active', activatedAt: hoursAgo(3), lastActivity: hoursAgo(24), playerIds: ['p'], holesEntered: 4, wouldClose: null },
    { id: 'hung', roundId: 'r1', status: 'active', activatedAt: hoursAgo(3), lastActivity: hoursAgo(48), playerIds: ['p'], holesEntered: 4, wouldClose: 'abandoned' },
  ]
  eq(orderCards(summaries).map(s => s.id), ['hung', 'healthy', 'signed', 'closed'],
    'stale active, then active, then finalised, then closed — however recently the others were touched')
}

section('Within a group, the most recently touched first')
{
  const active = (id: string, last: string | null, opened: string): CardSummary => ({
    id, roundId: 'r1', status: 'active', activatedAt: opened, lastActivity: last,
    playerIds: [], holesEntered: 0, wouldClose: null,
  })
  const summaries = [
    active('quiet', hoursAgo(1.5), hoursAgo(3)),
    active('busy', hoursAgo(0.1), hoursAgo(3)),
    active('never-touched', null, hoursAgo(0.5)),
  ]
  eq(orderCards(summaries).map(s => s.id), ['busy', 'never-touched', 'quiet'],
    'ordered by last touch, and a card never touched counts from when it was opened')
}

section('orderCards copies rather than reorders in place')
{
  const summaries = summariseCards([card('a'), card('b')], [], [], NOW)
  const before = summaries.map(s => s.id)
  orderCards(summaries)
  eq(summaries.map(s => s.id), before, 'the input array is left as it was')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) {
  console.log(`✓ all ${passed} checks passed`)
} else {
  console.log(`✗ ${failed} of ${passed + failed} failed`)
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
