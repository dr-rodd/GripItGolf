/**
 * The score outbox. Run with: npm run test:score-outbox
 *
 * A hole entered on a phone with no signal has to survive, reach the server
 * exactly once, and never come back to life after somebody has erased it.
 * Everything below is one of those three, and each maps to a specific way of
 * getting it wrong — most of which the old fire-and-forget upsert got wrong
 * by construction, because it never looked at the answer at all.
 *
 * The queue is exercised for real here, not read as source: `createOutbox`
 * takes its writer, its clock, its timers and its storage, so a whole round
 * of patchy service runs in a few milliseconds with no database and no
 * browser. The structural checks at the bottom are only for the things a
 * behaviour test cannot see — that the call sites actually go through this.
 */

import { readFileSync } from 'fs'
import {
  createOutbox, mergeEntries, parseQueue, batchOf, keyOf,
  MAX_AGE_MS, BACKOFF_MS, STORAGE_KEY,
  type Batch, type Entry, type ScoreRow, type OutboxStorage,
} from '../lib/scoreOutbox'

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
const read = (p: string) => readFileSync(p, 'utf-8')

// ─── A phone, and the network it may or may not have ───────────

function memoryStore(): OutboxStorage & { raw: () => string | null } {
  let value: string | null = null
  return {
    getItem: () => value,
    setItem: (_k, v) => { value = v },
    removeItem: () => { value = null },
    raw: () => value,
  }
}

/** A fake radio: `up` decides whether a send succeeds, `sent` records each. */
function radio(up = true) {
  const sent: Batch[] = []
  const state = { up }
  return {
    sent, state,
    send: async (batch: Batch) => {
      sent.push(JSON.parse(JSON.stringify(batch)))
      if (!state.up) throw new Error('no signal')
    },
  }
}

/**
 * Timers under our control. `fire()` runs whatever is due, so a backoff can be
 * walked through without waiting seconds for each step.
 */
function clockwork() {
  let pending: (() => void)[] = []
  return {
    setTimer: (fn: () => void) => { pending.push(fn); return pending.length },
    clearTimer: () => { pending = [] },
    fire: () => { const due = pending; pending = []; for (const f of due) f() },
    waiting: () => pending.length,
  }
}

const row = (hole: number, gross = 4, over: Partial<ScoreRow> = {}): ScoreRow => ({
  player_id: 'p1', round_id: 'r1', hole_number: hole,
  gross_score: gross, stableford_points: 2,
  fairway_hit: null, putts: null, committed: false, ...over,
})

/** Lets each queued send settle before the next assertion. */
const settle = () => new Promise(r => setImmediate(r))

async function run() {

// ─── The point of the whole thing ──────────────────────────────

section('A hole entered with no signal is not lost')
{
  const net = radio(false)
  const store = memoryStore()
  const timers = clockwork()
  const box = createOutbox({ send: net.send, storage: store, ...timers })

  box.save([row(1), row(2)])
  await settle()

  eq(box.pending(), 2, 'both holes are still waiting after the send failed')
  ok(store.raw() !== null, 'and they are on the phone, not only in memory')
  ok(timers.waiting() > 0, 'with a retry booked')

  // The group walks onto the next tee and the signal comes back.
  net.state.up = true
  timers.fire()
  await settle()

  eq(box.pending(), 0, 'the retry clears the queue')
  eq(net.sent[net.sent.length - 1].saves.map(r => r.hole_number), [1, 2],
    'and both holes reach the server')
  eq(store.raw(), null, 'the phone stops holding what the server now has')
  box.stop()
}

section('A queue survives the app being closed')
{
  const store = memoryStore()
  const timers = clockwork()
  const first = createOutbox({ send: radio(false).send, storage: store, ...timers })
  first.save([row(7, 5)])
  await settle()
  first.stop()

  // Same phone, same storage, new session — a reload, or the app reopened.
  const net = radio(true)
  const second = createOutbox({ send: net.send, storage: store, ...clockwork() })
  eq(second.pending(), 1, 'the queue is read back on the next launch')
  await second.flush()
  eq(net.sent[0].saves[0].gross_score, 5, 'and the hole reaches the server unchanged')
  second.stop()
}

// ─── Sending exactly once, and the right value ─────────────────

section('The same hole entered twice sends once, at its newest value')
{
  const net = radio(false)
  const box = createOutbox({ send: net.send, storage: memoryStore(), ...clockwork() })

  box.save([row(3, 5)])
  await settle()
  box.save([row(3, 4)])   // corrected on the green
  await settle()

  eq(box.pending(), 1, 'one hole is queued, not two')
  net.state.up = true
  await box.flush()
  const last = net.sent[net.sent.length - 1]
  eq(last.saves.length, 1, 'one row goes out')
  eq(last.saves[0].gross_score, 4, 'carrying the correction, not the first answer')
  box.stop()
}

section('A hole corrected while its send is in flight is not thrown away')
{
  // The trap: a flush that succeeds and then clears "everything it found"
  // would drop a correction typed during the request, and the card would
  // silently revert to the value the server happened to get.
  let release: (() => void) | null = null
  const sent: Batch[] = []
  const box = createOutbox({
    send: async (batch) => {
      sent.push(JSON.parse(JSON.stringify(batch)))
      if (sent.length === 1) await new Promise<void>(r => { release = r })
    },
    storage: memoryStore(), ...clockwork(),
  })

  box.save([row(5, 6)])
  await settle()
  ok(release !== null, 'the first send is in flight')

  box.save([row(5, 4)])   // corrected mid-request
  release!()
  await settle()
  await settle()

  const final = sent[sent.length - 1]
  eq(final.saves[0].gross_score, 4, 'the correction is what ends up on the server')
  eq(box.pending(), 0, 'and nothing is left behind')
  box.stop()
}

section('A hole cleared on the edit screen is a deletion, not an omission')
{
  const net = radio(true)
  const box = createOutbox({ send: net.send, storage: memoryStore(), ...clockwork() })

  box.clear([{ player_id: 'p1', round_id: 'r1', hole_number: 9 }])
  await settle()

  eq(net.sent[0].clears, [{ player_id: 'p1', round_id: 'r1', hole_number: 9 }],
    'the removal is sent as its own instruction')
  ok(net.sent[0].saves.length === 0, 'and nothing is written for that hole')
  box.stop()
}

section('Clearing a hole that is still queued replaces it')
{
  const net = radio(false)
  const box = createOutbox({ send: net.send, storage: memoryStore(), ...clockwork() })
  box.save([row(9)])
  await settle()
  box.clear([{ player_id: 'p1', round_id: 'r1', hole_number: 9 }])
  await settle()

  eq(box.pending(), 1, 'one instruction for that hole, not a save racing a delete')
  net.state.up = true
  await box.flush()
  const last = net.sent[net.sent.length - 1]
  eq(last.saves.length, 0, 'and it is the deletion that survives')
  eq(last.clears.length, 1, '…because it was the last thing said about the hole')
  box.stop()
}

// ─── Not making things worse ───────────────────────────────────

section('A committed or voided round stops being sent')
{
  const net = radio(false)
  const box = createOutbox({ send: net.send, storage: memoryStore(), ...clockwork() })
  box.save([row(1), row(2), { ...row(1), round_id: 'r2' }])
  await settle()

  box.discardRound('r1')
  eq(box.pending(), 1, "the other round's hole is untouched")
  eq(box.entries()[0].key, keyOf('p1', 'r2', 1), 'and it is the one from the round still open')

  // Every queued row carries `committed: false`: one arriving after a commit
  // would un-commit a signed card, which is why this exists at all.
  box.stop()
}

section('A queue only some of whose players were committed keeps the rest')
{
  const box = createOutbox({ send: radio(false).send, storage: memoryStore(), ...clockwork() })
  box.save([row(1), { ...row(1), player_id: 'p2' }])
  box.discardRound('r1', ['p1'])
  eq(box.pending(), 1, 'the player who was not committed keeps their hole')
  eq(box.entries()[0].key, keyOf('p2', 'r1', 1), 'and it is the right one')
  box.stop()
}

section('A hole nobody sent for a day is abandoned rather than resurrected')
{
  const store = memoryStore()
  let t = 1_000_000
  const stale = createOutbox({ send: radio(false).send, storage: store, now: () => t, ...clockwork() })
  stale.save([row(4)])
  await settle()
  eq(stale.pending(), 1, 'queued today')
  stale.stop()

  t += MAX_AGE_MS + 1
  const net = radio(true)
  const later = createOutbox({ send: net.send, storage: store, now: () => t, ...clockwork() })
  eq(later.pending(), 0, 'and gone tomorrow, rather than landing on a card since voided')
  await later.flush()
  eq(net.sent.length, 0, 'nothing is sent for it')
  later.stop()
}

section('Nothing is sent while the device knows it is offline')
{
  const net = radio(true)
  const timers = clockwork()
  const box = createOutbox({
    send: net.send, storage: memoryStore(), isOnline: () => false, ...timers,
  })
  box.save([row(1)])
  await settle()

  eq(net.sent.length, 0, 'a send into a dead spot is not attempted')
  eq(box.pending(), 1, 'the hole is held')
  ok(timers.waiting() > 0, 'and it is booked to try again')
  box.stop()
}

// ─── How hard it tries ─────────────────────────────────────────

section('Retries back off rather than hammering a struggling radio')
{
  ok(BACKOFF_MS.length > 1, 'there is more than one wait')
  ok(BACKOFF_MS.every((ms, i) => i === 0 || ms >= BACKOFF_MS[i - 1]),
    'each wait is at least as long as the one before')
  ok(BACKOFF_MS[0] <= 2000, 'the first retry is quick')
  ok(BACKOFF_MS[BACKOFF_MS.length - 1] <= 60_000,
    'and the longest is under a minute, so coming back into signal is not a long wait')
}

section('A newly entered hole tries immediately, however long the last wait was')
{
  // A group walking out of a hollow should not wait out a thirty-second
  // backoff measured against the hollow.
  const net = radio(false)
  const timers = clockwork()
  const box = createOutbox({ send: net.send, storage: memoryStore(), ...timers })

  box.save([row(1)])
  await settle()
  timers.fire(); await settle()
  timers.fire(); await settle()
  const triedSoFar = net.sent.length

  net.state.up = true
  box.save([row(2)])      // the next hole, entered on the tee
  await settle()

  ok(net.sent.length > triedSoFar, 'the new hole prompts a send there and then')
  eq(box.pending(), 0, 'and takes the backlog with it')
  box.stop()
}

section('Two flushes at once do not send the same hole twice over')
{
  const net = radio(true)
  const box = createOutbox({ send: net.send, storage: memoryStore(), ...clockwork() })
  box.save([row(1)])
  await Promise.all([box.flush(), box.flush(), box.flush()])
  await settle()

  const rowsSent = net.sent.flatMap(b => b.saves)
  eq(rowsSent.length, 1, 'the hole goes out once')
  eq(box.pending(), 0, 'and the queue is clean')
  box.stop()
}

// ─── Reading the queue back ────────────────────────────────────

section('An unreadable entry is dropped, never guessed at')
{
  eq(parseQueue(null), [], 'nothing stored is an empty queue')
  eq(parseQueue('not json'), [], 'and so is nonsense')
  eq(parseQueue('{"not":"an array"}'), [], 'and so is the wrong shape')

  const good = JSON.stringify([
    { kind: 'save', key: 'a', seq: 1, at: Date.now(), row: row(1) },
    { kind: 'save', key: 'b', seq: 2, at: Date.now(), row: { ...row(2), gross_score: 'four' } },
    { kind: 'save', key: 'c', seq: 3, at: Date.now() },
    { kind: 'clear', key: 'd', seq: 4, at: Date.now(), target: { player_id: 'p1', round_id: 'r1', hole_number: 5 } },
  ])
  const parsed = parseQueue(good)
  eq(parsed.map(e => e.key), ['a', 'd'],
    'a half-written entry is dropped rather than repaired into a guess')
}

section('A batch is grouped, not one call per hole')
{
  const queue: Entry[] = [
    { kind: 'save', key: 'a', seq: 1, at: 0, row: row(1) },
    { kind: 'save', key: 'b', seq: 2, at: 0, row: row(2) },
    { kind: 'clear', key: 'c', seq: 3, at: 0, target: { player_id: 'p1', round_id: 'r1', hole_number: 3 } },
  ]
  const batch = batchOf(queue)
  eq(batch.saves.length, 2, 'the saves travel together')
  eq(batch.clears.length, 1, 'and so do the removals')
}

section('Merging keeps the order holes were first played')
{
  const at = 0
  const start: Entry[] = [
    { kind: 'save', key: 'h1', seq: 1, at, row: row(1) },
    { kind: 'save', key: 'h2', seq: 2, at, row: row(2) },
  ]
  const merged = mergeEntries(start, [{ kind: 'save', key: 'h1', seq: 3, at, row: row(1, 6) }])
  eq(merged.map(e => e.key), ['h1', 'h2'], 'a correction stays where the hole was')
  eq((merged[0] as any).row.gross_score, 6, 'carrying the newer score')
}

// ─── That the app actually goes through it ─────────────────────

section('Score entry writes to the outbox and nowhere else')
{
  const flow = read('app/scoring/LiveScoringFlow.tsx')

  ok(/outbox\.save\(rows as ScoreRow\[\]\)/.test(flow),
    'a hole submitted on the card is queued')
  ok(!/live_scores"\)\s*\n?\s*\.upsert/.test(flow.replace(/\/\*[\s\S]*?\*\//g, '')),
    'and no live_scores upsert is left hand-rolled beside it')
  ok(!/fire and forget/.test(flow),
    'the fire-and-forget upsert is gone')
  ok(!/TODO\(error-handling\).*\n.*live_scores/.test(flow),
    'and so is the TODO that sat on it')

  // The edit screen is the same write under a different name, and it had the
  // same TODO. A cleared hole must go as a deletion, not as an absence.
  ok(/outbox\.clear\(deleteHoleNums/.test(flow),
    'clearing a hole on the edit screen goes through the queue too')

  // The commit reads live_scores back and treats a missing hole as a no
  // return, so committing with holes still queued would write off the very
  // scores the queue exists to protect.
  const commit = flow.slice(flow.indexOf('async function handleCommit'), flow.indexOf('// ─── Close confirm'))
  ok(commit.indexOf('outbox.flush()') < commit.indexOf('.from("live_scores")'),
    'the commit empties the queue before it reads the card back')
  ok(/outbox\.discardRound\(roundId/.test(commit),
    'and drops the round from the queue once the card is closed')
}

section('Voiding a card takes its queued holes with it')
{
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  const discard = flow.slice(flow.indexOf('voidScorecardData('), flow.indexOf('// ─── Commit'))
  ok(/outbox\.discardRound\(/.test(discard),
    'a discarded scorecard cannot be put back by a straggler in the queue')
}

section('Nothing polls a screen nobody is reading')
{
  const dash = read('app/scoring/[slug]/CourseDashboardClient.tsx')
  const panel = read('app/scoring/LiveLeaderboardPanel.tsx')
  const poll = read('app/scoring/usePoll.ts')

  ok(!/setInterval/.test(dash), 'the round dashboard has no timer of its own')
  ok(!/setInterval/.test(panel), 'and neither has the live board')
  ok(/usePoll\(fetchScorecards, 15000, view === "dashboard"/.test(dash),
    'the dashboard refreshes only while its list is the screen')
  ok(/usePoll\(fetchScores, 15000\)/.test(panel), 'and the board only while it is open')

  ok(/visibilityState === 'visible'/.test(poll), 'a hidden screen stops polling')
  ok(/navigator\.onLine !== false/.test(poll), 'and so does one with no signal')
  ok(/addEventListener\('online'/.test(poll), 'coming back online restarts it')
  ok(/latest\.current = fn/.test(poll),
    'and the callback is held in a ref, so the interval is not rebuilt every render')
}

section('The outbox is one instance, wired once')
{
  const wired = read('app/scoring/outbox.ts')
  ok(/let instance: Outbox \| null = null/.test(wired),
    'there is a single queue behind one storage key')
  ok(/if \(error\) throw error/.test(wired),
    'a failed write is thrown, so the queue holds the hole and tries again')
  ok(/addEventListener\('online'/.test(wired), 'the radio coming back flushes it')
  ok(/visibilitychange/.test(wired), 'and so does the phone coming out of a pocket')
  ok(STORAGE_KEY.startsWith('gdg.'), 'the storage key is namespaced to this app')
}

// ─── Report ────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(56))
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}

}

run()
