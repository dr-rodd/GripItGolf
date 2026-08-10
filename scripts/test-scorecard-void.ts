/**
 * Voiding a scorecard. Run with: npm run test:scorecard-void
 *
 * Voiding used to release the players and close the session, and leave every
 * score exactly where it was. So the round it was meant to undo carried on
 * standing on the leaderboard as though the card had been signed — and there
 * was nothing afterwards that would ever take it off.
 *
 * These are structural checks against the source rather than exercised
 * queries: the module talks to Supabase, and the failures being guarded
 * against are all silent ones that a database would have to be running to
 * demonstrate. Each maps to a specific way of getting it wrong:
 *
 *   · reading the locks AFTER deleting them. Every call succeeds, the delete
 *     is scoped to an empty list of players, and nothing at all is erased
 *   · erasing `live_scores` but not `scores`, so a card that was finalised
 *     before being voided keeps its round on the board
 *   · scoping the delete to the round instead of to the players, which wipes
 *     the other group out on the same round
 *   · a call site hand-rolling the lock delete again and skipping all of it,
 *     which is exactly how this shipped
 */

import { readFileSync } from 'fs'

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
const store = read('lib/scorecardVoid.ts')

/** The body of one exported function, up to the next one. */
function body(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`)
  if (start < 0) return ''
  const next = src.indexOf('\nexport ', start + 1)
  return src.slice(start, next < 0 ? src.length : next)
}

// ─── Both tables ───────────────────────────────────────────────

section('A void erases the scores, not just the locks')
{
  const erase = body(store, 'eraseScores')
  ok(erase.includes("from('live_scores')"),
    'the holes entered while the card was open are deleted')
  ok(erase.includes("from('scores')"),
    'and so are the committed ones — Void is offered on a finalised card too')

  // Scoped to the players who were on the card. A delete by round alone would
  // take the other group out on the same round with it.
  const scoped = [...erase.matchAll(/\.delete\(\)([\s\S]*?)\n\n/g)].map(m => m[1])
  eq(scoped.length, 2, 'two deletes, one per table')
  ok(scoped.every(d => d.includes(".in('player_id'")),
    'each one named the players, so a second group on the same round survives')
  ok(scoped.every(d => d.includes(".eq('round_id'")),
    'and the round, so the rest of the trip survives too')

  ok(/playerIds\.length === 0/.test(erase),
    'a card nobody was locked into erases nothing rather than everything')
}

section('The locks are read before they are released')
{
  const fn = body(store, 'voidScorecard')
  const read_ = fn.indexOf('playersOnScorecard(')
  const erase = fn.indexOf('eraseScores(')
  const release = fn.indexOf("from('live_player_locks')")
  const close = fn.indexOf("from('live_rounds')")

  ok(read_ >= 0 && erase >= 0 && release >= 0 && close >= 0,
    'a void reads the card, erases it, releases the players and closes it')
  ok(read_ < erase,
    'who was on the card is known before anything is deleted')
  ok(erase < release,
    'and the scores go before the locks — the locks are the only record of ' +
    'whose scores to erase, so releasing them first erases nothing at all')
  ok(release < close, 'the session is closed last')
}

section('Taking one player off takes their round with them')
{
  const fn = body(store, 'removePlayerFromScorecard')
  ok(fn.includes('eraseScores('), 'their scores go with them')
  ok(fn.indexOf('eraseScores(') < fn.indexOf("from('live_player_locks')"),
    'before the lock that says they were there')
}

section('A snapshot is not a score')
{
  // `round_handicaps` is deliberately untouched: nothing appears on a
  // leaderboard because of it, finalise() writes one for every player of every
  // round anyway, and starting a new card overwrites it.
  // The comment at the top explains why, so the check is against the code.
  const code = store.slice(store.indexOf('import '))
  ok(!code.includes('round_handicaps'),
    'the handicap snapshot is left alone — it puts nothing on a board')
  ok(store.slice(0, store.indexOf('import ')).includes('round_handicaps'),
    'and the reason why is written down at the top of the file')
}

// ─── Which client does the deleting ────────────────────────────

section('Every function writes with the client it was handed')
{
  // The admin live-cards actions void with the service-role client; the
  // scoring screens keep the anon default. A function that reaches for the
  // singleton directly would void with the wrong credentials for one of them
  // — silently, once row-level security lands.
  for (const name of ['playersOnScorecard', 'eraseScores', 'voidScorecard', 'removePlayerFromScorecard']) {
    const fn = body(store, name)
    ok(fn.includes('db: SupabaseClient = supabase'),
      `${name} takes the client, defaulting to the scoring screens' anon one`)
    ok(!fn.replace('db: SupabaseClient = supabase', '').includes('supabase'),
      `${name} then uses only the one it was given`)
  }

  const void_ = body(store, 'voidScorecard')
  ok(void_.includes('playersOnScorecard(liveRoundId, db)'),
    'voidScorecard reads the locks with the same client it deletes with')
  ok(void_.includes('eraseScores(roundId, playerIds, db)'),
    'and erases with it too')
  ok(body(store, 'removePlayerFromScorecard').includes('eraseScores(roundId, [playerId], db)'),
    'as does taking one player off')
}

// ─── Every route in ────────────────────────────────────────────

section('Nothing voids a card any other way')
{
  // The bug was a call site doing the two easy deletes by hand. Every screen
  // that voids goes through the module, so fixing it once fixes it everywhere.
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  const dash = read('app/scoring/[slug]/CourseDashboardClient.tsx')

  ok(flow.includes('voidScorecard as voidScorecardData'),
    'discarding from inside the card goes through the module')
  ok(dash.includes('voidScorecard as voidScorecardData'),
    'and so does voiding one from settings')
  ok(dash.includes('removePlayerFromScorecard as removePlayerData'),
    'and taking a player off one')

  // There is no "finalise session" any more. It was a second answer to a
  // question the cards already answer — a round is done when everyone who was
  // out on it has signed — and it discarded whatever was still open, which is
  // a destructive act hiding inside a bookkeeping one. A late card is now just
  // added in.
  ok(!dash.includes('finaliseSession'),
    'nothing finalises a session, so nothing discards open cards as a side effect')
  ok(!dash.includes('session_finalised_at'),
    'and the flag that said so is not read anywhere')

  // `voidLiveSession` is the nuclear one and already deleted everything; it is
  // round-wide rather than card-wide, so it does not go through the module.
  ok(dash.includes('Clear All Live Data'), 'the round-wide clear is still there')

  // No screen undoes a card by hand any more. This is the check that would
  // have caught the original bug: it was exactly these three functions each
  // doing the two easy deletes themselves.
  //
  // Two hand-rolled lock deletes survive elsewhere in the dashboard and both
  // are meant to: `unfinalisePlayer` reopens a card rather than undoing it and
  // deliberately keeps the scores, and `voidLiveSession` is the round-wide
  // clear, which already deleted everything on its own terms.
  const fnBody = (src: string, name: string) => {
    const start = src.indexOf(`async function ${name}(`)
    if (start < 0) return ''
    const rest = src.slice(start)
    const end = rest.indexOf('\n  async function')
    return end < 0 ? rest : rest.slice(0, end)
  }
  for (const name of ['voidScorecard', 'removePlayerFromScorecard']) {
    const fn = fnBody(dash, name)
    ok(fn.length > 0, `${name} is still there to check`)
    ok(!/from\("live_player_locks"\)\s*\.delete\(\)/.test(fn),
      `${name} does not release players by hand — that is what skipped the erase`)
  }
  ok(!/from\("live_player_locks"\)\s*\.delete\(\)/.test(flow),
    'and neither does anything in the scoring flow')
}

// ─── What the screen promises ──────────────────────────────────

section('The confirmation says what it does')
{
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  ok(/deleted/.test(flow.slice(flow.indexOf('Discard Scorecard?'), flow.indexOf('Discard Scorecard?') + 700)),
    'discarding says the holes already entered are deleted, not merely unsaved')

  const dash = read('app/scoring/[slug]/CourseDashboardClient.tsx')
  ok(dash.includes('cannot be undone'),
    'and voiding from settings says it cannot be undone before the second tap')
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
