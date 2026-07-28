/**
 * Match progression tests. Run with: npm run test:progress
 *
 * The cascade is the risk here. Changing a winner must clear results that were
 * reached against the wrong opponent, and must leave alone results that were
 * never affected — stopping the moment it meets a match that had not been
 * decided. These tests drive a fully-played bracket and assert exactly which
 * matches survive each correction.
 */

import {
  recordWinner, clearWinner, isDecidable, pressOutcome, ProgressError,
  type ProgressMatch,
} from '../lib/matchplayProgress'
import { generateBracket, bracketToRows } from '../lib/matchplay'

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
function throws(fn: () => unknown, label: string) {
  try { fn(); failed++; failures.push(label); console.log(`  FAIL  ${label} (expected a throw)`) }
  catch { passed++ }
}
const section = (n: string) => console.log(`\n${n}`)

// ─── Fixtures ──────────────────────────────────────────────────

type M = ProgressMatch & { round_name: string }

function bracket(count: number): M[] {
  let id = 0
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }))
  const generated = generateBracket(players, { makeId: () => `m${String(++id).padStart(2, '0')}` })
  return bracketToRows('trip', generated) as unknown as M[]
}

const find = (ms: M[], id: string) => ms.find(m => m.id === id)!
const inRound = (ms: M[], r: number) => ms.filter(m => m.round_number === r).sort((a, b) => a.slot - b.slot)

/** Decide a match in favour of whoever occupies side A. */
function decideA(ms: M[], id: string, result = '3&2'): M[] {
  const m = find(ms, id)
  return recordWinner(ms, id, m.player_a_id!, { result }).matches
}

/** An 8-player bracket played out in full: 4 QFs, 2 SFs, 1 Final. */
function playedOut(): M[] {
  let ms = bracket(8)
  for (const m of inRound(ms, 1)) ms = decideA(ms, m.id, '3&2')
  for (const m of inRound(ms, 2)) ms = decideA(ms, m.id, '2&1')
  ms = decideA(ms, inRound(ms, 3)[0].id, '1 up')
  return ms
}

// ─── Deciding ──────────────────────────────────────────────────

section('Deciding an undecided match')
{
  const ms = bracket(8)
  const qf = inRound(ms, 1)[0]
  eq(qf.winner_player_id, null, 'starts undecided')

  const { matches, changed, clearedIds } = recordWinner(ms, qf.id, qf.player_a_id!, { result: '4&3' })
  const after = find(matches, qf.id)
  eq(after.winner_player_id, qf.player_a_id, 'the winner is recorded')
  eq(after.result, '4&3', 'so is the margin')
  eq(clearedIds, [], 'nothing is cleared — nothing downstream was decided')

  // The winner walks into their designated slot
  const sf = find(matches, qf.next_match_id!)
  const seat = qf.next_slot === 'A' ? sf.player_a_id : sf.player_b_id
  eq(seat, qf.player_a_id, 'the winner is seated in the next round')
  eq(sf.winner_player_id, null, 'the next match stays undecided')

  eq(changed.length, 2, 'exactly two rows change: the match and the one above')

  // The other side of the semi is still waiting
  const otherSeat = qf.next_slot === 'A' ? sf.player_b_id : sf.player_a_id
  eq(otherSeat, null, 'the other half of the semi is still empty')
}

section('A margin is optional')
{
  const ms = bracket(8)
  const qf = inRound(ms, 1)[0]
  const { matches } = recordWinner(ms, qf.id, qf.player_a_id!)
  eq(find(matches, qf.id).winner_player_id, qf.player_a_id, 'a winner can be recorded alone')
  eq(find(matches, qf.id).result, null, 'with no margin')
}

// ─── Byes are not decidable ────────────────────────────────────

section('Byes cannot be decided')
{
  // 6 players in a bracket of 8 → seeds 1 and 2 draw byes
  const ms = bracket(6)
  const byes = inRound(ms, 1).filter(m => m.player_a_is_bye || m.player_b_is_bye)
  eq(byes.length, 2, '6 players: two byes exist')

  for (const bye of byes) {
    ok(!isDecidable(bye), 'a bye reports itself as not decidable')
    const occupant = bye.player_a_id ?? bye.player_b_id!
    throws(() => recordWinner(ms, bye.id, occupant),
      'recording a winner on a bye is refused even for its own occupant')
  }

  // Real matches in the same round are decidable
  const real = inRound(ms, 1).filter(m => !m.player_a_is_bye && !m.player_b_is_bye)
  eq(real.length, 2, '6 players: two real first-round matches')
  ok(real.every(isDecidable), 'those are decidable')

  // A later-round match with only one player seated is not yet decidable
  const sfWaiting = inRound(ms, 2).find(m => !m.player_a_id || !m.player_b_id)
  ok(sfWaiting ? !isDecidable(sfWaiting) : true, 'a half-filled match is not decidable')
}

section('Rejects nonsense')
{
  const ms = bracket(8)
  const qf = inRound(ms, 1)[0]
  throws(() => recordWinner(ms, 'nope', qf.player_a_id!), 'an unknown match id is refused')
  throws(() => recordWinner(ms, qf.id, 'p99'), 'a player not in the match is refused')
  try { recordWinner(ms, qf.id, 'p99') } catch (e) {
    ok(e instanceof ProgressError, 'throws a ProgressError')
    ok(/not in this match/.test((e as Error).message), 'with a message that explains why')
  }
}

// ─── Correction: next match undecided ──────────────────────────

section('Correcting when the next match is undecided — only the slot swaps')
{
  let ms = bracket(8)
  const qfId = inRound(ms, 1)[0].id
  ms = decideA(ms, qfId)

  const qf = find(ms, qfId)
  const other = qf.player_b_id!
  const { matches, clearedIds, changed } = recordWinner(ms, qfId, other)

  eq(clearedIds, [], 'nothing is cleared')
  eq(find(matches, qfId).winner_player_id, other, 'the winner is corrected')
  eq(find(matches, qfId).result, null, 'the old margin is dropped — it described the old outcome')

  const sf = find(matches, qf.next_match_id!)
  const seat = qf.next_slot === 'A' ? sf.player_a_id : sf.player_b_id
  eq(seat, other, 'the corrected player takes the slot')
  eq(sf.winner_player_id, null, 'the semi is still undecided')
  eq(changed.length, 2, 'only two rows change')
}

// ─── Correction: ripples to a decided Final ────────────────────

section('Correcting the earliest round of a fully-played bracket')
{
  const before = playedOut()

  // Sanity: everything really is decided
  eq(before.filter(m => m.winner_player_id).length, 7, 'all seven matches are decided first')
  eq(inRound(before, 3)[0].winner_player_id !== null, true, 'including the Final')

  const qf = inRound(before, 1)[0]
  const sfId = qf.next_match_id!
  const finalId = find(before, sfId).next_match_id!
  const loser = qf.player_b_id!

  const { matches, clearedIds } = recordWinner(before, qf.id, loser)

  // The whole chain above it clears — semi-final then Final
  eq(clearedIds, [sfId, finalId], 'the semi-final and the Final are both cleared, in order')
  eq(find(matches, qf.id).winner_player_id, loser, 'the quarter-final is corrected')
  eq(find(matches, sfId).winner_player_id, null, 'the semi-final is back to undecided')
  eq(find(matches, sfId).result, null, 'and its margin is gone')
  eq(find(matches, finalId).winner_player_id, null, 'the Final is back to undecided')
  eq(find(matches, finalId).result, null, 'and its margin is gone')

  // The corrected player is seated in the semi
  const sf = find(matches, sfId)
  const seat = qf.next_slot === 'A' ? sf.player_a_id : sf.player_b_id
  eq(seat, loser, 'the corrected player is seated in the semi-final')

  // The Final slot fed by that semi is emptied — nobody has won it now
  const finalMatch = find(matches, finalId)
  const finalSeat = sf.next_slot === 'A' ? finalMatch.player_a_id : finalMatch.player_b_id
  eq(finalSeat, null, 'the Final slot that semi fed is emptied')

  // The other half of the draw is untouched — this is the crux
  const untouchedQFs = inRound(before, 1).filter(m => m.id !== qf.id)
  ok(untouchedQFs.every(m =>
    find(matches, m.id).winner_player_id === m.winner_player_id &&
    find(matches, m.id).result === m.result),
    'the other three quarter-finals keep their winners and margins')

  const otherSF = inRound(before, 2).find(m => m.id !== sfId)!
  eq(find(matches, otherSF.id).winner_player_id, otherSF.winner_player_id,
    'the other semi-final is untouched — it never involved this player')
  eq(find(matches, otherSF.id).result, otherSF.result, 'and keeps its margin')

  // And the Final still holds whoever the other semi sent
  const otherFinalSeat = otherSF.next_slot === 'A' ? finalMatch.player_a_id : finalMatch.player_b_id
  eq(otherFinalSeat, otherSF.winner_player_id, 'the other finalist stays in place')
}

// ─── Correction stops at the first undecided match ─────────────

section('The cascade stops rather than running to the end')
{
  // Play the quarters and semis but leave the Final undecided
  let ms = bracket(8)
  for (const m of inRound(ms, 1)) ms = decideA(ms, m.id)
  for (const m of inRound(ms, 2)) ms = decideA(ms, m.id)

  const qf = inRound(ms, 1)[0]
  const sfId = qf.next_match_id!
  const finalId = find(ms, sfId).next_match_id!
  eq(find(ms, finalId).winner_player_id, null, 'the Final is undecided to begin with')

  const { matches, clearedIds } = recordWinner(ms, qf.id, qf.player_b_id!)

  eq(clearedIds, [sfId], 'only the semi-final is cleared — the walk stops at the Final')
  eq(find(matches, finalId).winner_player_id, null, 'the Final remains undecided')

  // The Final's slot is emptied because nobody has won that semi now
  const sf = find(ms, sfId)
  const fin = find(matches, finalId)
  const seat = sf.next_slot === 'A' ? fin.player_a_id : fin.player_b_id
  eq(seat, null, 'the Final slot that semi fed is emptied')
}

// ─── Correcting the Final itself ───────────────────────────────

section('Correcting the Final — nothing downstream exists')
{
  const ms = playedOut()
  const fin = inRound(ms, 3)[0]
  eq(fin.next_match_id, null, 'the Final advances nowhere')

  const other = fin.player_b_id!
  const { matches, clearedIds, changed } = recordWinner(ms, fin.id, other, { result: '2 up' })

  eq(clearedIds, [], 'nothing is cleared')
  eq(changed.length, 1, 'exactly one row changes')
  eq(find(matches, fin.id).winner_player_id, other, 'the Final winner is corrected')
  eq(find(matches, fin.id).result, '2 up', 'with its new margin')

  // Everything else is byte-identical
  ok(ms.filter(m => m.id !== fin.id).every(m => {
    const a = find(matches, m.id)
    return a.winner_player_id === m.winner_player_id && a.result === m.result &&
           a.player_a_id === m.player_a_id && a.player_b_id === m.player_b_id
  }), 'the rest of the bracket is untouched')
}

// ─── Re-confirming the same winner ─────────────────────────────

section('Re-confirming the winner already recorded')
{
  const ms = playedOut()
  const qf = inRound(ms, 1)[0]
  const { matches, clearedIds } = recordWinner(ms, qf.id, qf.winner_player_id!)

  eq(clearedIds, [], 'nothing cascades when the winner does not actually change')
  eq(find(matches, qf.id).result, qf.result, 'the margin survives')
  ok(ms.every(m => {
    const a = find(matches, m.id)
    return a.winner_player_id === m.winner_player_id && a.result === m.result
  }), 'the bracket is entirely unchanged')

  // But a margin can still be corrected without disturbing anything
  const withMargin = recordWinner(ms, qf.id, qf.winner_player_id!, { result: '5&4' })
  eq(find(withMargin.matches, qf.id).result, '5&4', 'the margin alone can be amended')
  eq(withMargin.clearedIds, [], 'still without cascading')
  eq(withMargin.changed.length, 1, 'touching one row')
}

// ─── Deeper brackets ───────────────────────────────────────────

section('A longer chain in a 16-player bracket')
{
  let ms = bracket(16)
  for (let r = 1; r <= 4; r++) for (const m of inRound(ms, r)) ms = decideA(ms, m.id)
  eq(ms.filter(m => m.winner_player_id).length, 15, 'all fifteen matches decided')

  const first = inRound(ms, 1)[0]
  // The chain of matches above it
  const chain: string[] = []
  let cur = first
  while (cur.next_match_id) { chain.push(cur.next_match_id); cur = find(ms, cur.next_match_id) }
  eq(chain.length, 3, 'a first-round match feeds a chain of three above it')

  const { matches, clearedIds } = recordWinner(ms, first.id, first.player_b_id!)
  eq(clearedIds, chain, 'every match in that chain is cleared, in order from nearest to furthest')

  // Exactly those, and nothing else, lost a winner
  const lost = ms.filter(m => m.winner_player_id && !find(matches, m.id).winner_player_id)
  eq(lost.map(m => m.id).sort(), [...chain].sort(), 'no other match loses its winner')
  eq(lost.length, 3, 'three matches cleared out of fifteen')
}

section('A correction near the Final ripples barely at all')
{
  let ms = bracket(16)
  for (let r = 1; r <= 4; r++) for (const m of inRound(ms, r)) ms = decideA(ms, m.id)

  // Correcting a semi-final should clear only the Final
  const sf = inRound(ms, 3)[0]
  const finalId = sf.next_match_id!
  const { clearedIds } = recordWinner(ms, sf.id, sf.player_b_id!)
  eq(clearedIds, [finalId], 'correcting a semi-final clears only the Final')
}

// ─── Immutability ──────────────────────────────────────────────

section('The input is never mutated')
{
  const ms = playedOut()
  const snapshot = JSON.stringify(ms)
  const qf = inRound(ms, 1)[0]
  recordWinner(ms, qf.id, qf.player_b_id!)
  eq(JSON.stringify(ms), snapshot, 'the array handed in is left exactly as it was')
}

section('Only genuinely different rows are reported as changed')
{
  const ms = playedOut()
  const qf = inRound(ms, 1)[0]
  const { changed, matches } = recordWinner(ms, qf.id, qf.player_b_id!)
  ok(changed.every(c => {
    const before = find(ms, c.id)
    return before.winner_player_id !== c.winner_player_id ||
           before.result !== c.result ||
           before.player_a_id !== c.player_a_id ||
           before.player_b_id !== c.player_b_id
  }), 'every reported row really did change')
  const changedIds = new Set(changed.map(c => c.id))
  ok(matches.filter(m => !changedIds.has(m.id)).every(m => {
    const before = find(ms, m.id)
    return before.winner_player_id === m.winner_player_id && before.result === m.result &&
           before.player_a_id === m.player_a_id && before.player_b_id === m.player_b_id
  }), 'and every unreported row really did not')
}

// ─── Exhaustive sweep ──────────────────────────────────────────

section('Every match in a played-out bracket, corrected in turn')
{
  for (const size of [4, 8, 16]) {
    let base = bracket(size)
    const roundCount = Math.log2(size)
    for (let r = 1; r <= roundCount; r++) for (const m of inRound(base, r)) base = decideA(base, m.id)

    let allSound = true
    for (const m of base) {
      if (!isDecidable(m)) continue
      const { matches, clearedIds } = recordWinner(base, m.id, m.player_b_id!)

      // What should have cleared: the decided chain above this match
      const expected: string[] = []
      let cur = find(base, m.id)
      while (cur.next_match_id) {
        const next = find(base, cur.next_match_id)
        if (!next.winner_player_id) break
        expected.push(next.id)
        cur = next
      }
      if (JSON.stringify(clearedIds) !== JSON.stringify(expected)) allSound = false

      // No match outside that chain may lose its winner
      const affected = new Set([m.id, ...expected])
      for (const other of base) {
        if (affected.has(other.id)) continue
        if (find(matches, other.id).winner_player_id !== other.winner_player_id) allSound = false
      }

      // Every remaining winner is still one of the players in its match
      for (const after of matches) {
        if (!after.winner_player_id) continue
        if (after.winner_player_id !== after.player_a_id &&
            after.winner_player_id !== after.player_b_id) allSound = false
      }
    }
    ok(allSound, `${size} players: correcting any match clears exactly its decided chain and no more`)
  }
}

// ─── Voiding a match back to unplayed ──────────────────────────

section('Voiding a match with nothing decided above it')
{
  let ms = bracket(8)
  const qfId = inRound(ms, 1)[0].id
  ms = decideA(ms, qfId, '4&3')

  const qf = find(ms, qfId)
  const { matches, clearedIds, changed } = clearWinner(ms, qfId)

  eq(find(matches, qfId).winner_player_id, null, 'the match is unplayed again')
  eq(find(matches, qfId).result, null, 'and its margin is gone')
  eq(clearedIds, [], 'nothing above it needed clearing')

  // Whoever had advanced is taken back out of the semi
  const sf = find(matches, qf.next_match_id!)
  const seat = qf.next_slot === 'A' ? sf.player_a_id : sf.player_b_id
  eq(seat, null, 'they are removed from the round above')
  eq(changed.length, 2, 'the match and the slot above it')

  // Both players are still in the match, so it can be replayed
  eq(find(matches, qfId).player_a_id, qf.player_a_id, 'player A is still there')
  eq(find(matches, qfId).player_b_id, qf.player_b_id, 'player B is still there')
  ok(isDecidable(find(matches, qfId)), 'and it can be decided again')
}

section('Voiding ripples exactly like a correction')
{
  const before = playedOut()
  const qf = inRound(before, 1)[0]
  const sfId = qf.next_match_id!
  const finalId = find(before, sfId).next_match_id!

  const { matches, clearedIds } = clearWinner(before, qf.id)

  eq(clearedIds, [sfId, finalId], 'the whole decided chain above clears')
  eq(find(matches, qf.id).winner_player_id, null, 'the match itself is unplayed')
  eq(find(matches, sfId).winner_player_id, null, 'the semi-final is unplayed')
  eq(find(matches, finalId).winner_player_id, null, 'the Final is unplayed')

  // The slot the voided match fed is empty, not holding a stale player
  const sf = find(matches, sfId)
  const seat = qf.next_slot === 'A' ? sf.player_a_id : sf.player_b_id
  eq(seat, null, 'no stale player left in the semi')

  // The other half of the draw is untouched
  const otherSF = inRound(before, 2).find(m => m.id !== sfId)!
  eq(find(matches, otherSF.id).winner_player_id, otherSF.winner_player_id,
    'the other semi-final keeps its winner')
  eq(find(matches, otherSF.id).result, otherSF.result, 'and its margin')
}

section('Voiding the Final')
{
  const ms = playedOut()
  const fin = inRound(ms, 3)[0]
  const { matches, clearedIds, changed } = clearWinner(ms, fin.id)

  eq(clearedIds, [], 'nothing downstream exists')
  eq(changed.length, 1, 'one row changes')
  eq(find(matches, fin.id).winner_player_id, null, 'the Final is unplayed')
  eq(find(matches, fin.id).result, null, 'with no margin')
  eq(find(matches, fin.id).player_a_id, fin.player_a_id, 'both finalists remain')
  eq(find(matches, fin.id).player_b_id, fin.player_b_id, 'in place')
}

section('Voiding what is already unplayed does nothing')
{
  const ms = bracket(8)
  const qf = inRound(ms, 1)[0]
  const { changed, clearedIds, matches } = clearWinner(ms, qf.id)
  eq(changed, [], 'no rows change')
  eq(clearedIds, [], 'nothing cleared')
  eq(JSON.stringify(matches), JSON.stringify(ms), 'the bracket is identical')
}

section('A bye cannot be voided either')
{
  const ms = bracket(6)
  const bye = inRound(ms, 1).find(m => m.player_a_is_bye || m.player_b_is_bye)!
  throws(() => clearWinner(ms, bye.id), 'voiding a bye is refused')
  throws(() => clearWinner(ms, 'nope'), 'voiding an unknown match is refused')
}

section('Void then re-decide restores a working bracket')
{
  const ms = playedOut()
  const qf = inRound(ms, 1)[0]

  const voided = clearWinner(ms, qf.id).matches
  // Give it to the other player this time
  const redecided = recordWinner(voided, qf.id, qf.player_b_id!, { result: '2&1' }).matches

  const after = find(redecided, qf.id)
  eq(after.winner_player_id, qf.player_b_id, 'the other player now wins it')
  eq(after.result, '2&1', 'with the new margin')

  const sf = find(redecided, qf.next_match_id!)
  const seat = qf.next_slot === 'A' ? sf.player_a_id : sf.player_b_id
  eq(seat, qf.player_b_id, 'and they are seated in the semi')
  eq(sf.winner_player_id, null, 'which is waiting to be played again')

  // Every remaining winner is still one of its own players
  ok(redecided.every(m => !m.winner_player_id ||
    m.winner_player_id === m.player_a_id || m.winner_player_id === m.player_b_id),
    'no match is left claiming a winner who is not in it')
}

// ─── Amending a score after the fact ───────────────────────────

section('A margin can be added or changed without touching the winner')
{
  const ms = bracket(8)
  const qf = inRound(ms, 1)[0]

  // Recorded with no margin at the time
  const noMargin = recordWinner(ms, qf.id, qf.player_a_id!).matches
  eq(find(noMargin, qf.id).result, null, 'recorded without a margin')

  // Added afterwards
  const added = recordWinner(noMargin, qf.id, qf.player_a_id!, { result: '3&2' })
  eq(find(added.matches, qf.id).result, '3&2', 'the margin can be added later')
  eq(find(added.matches, qf.id).winner_player_id, qf.player_a_id, 'the winner is unchanged')
  eq(added.clearedIds, [], 'and nothing cascades')
  eq(added.changed.length, 1, 'only that row is written')

  // Amended again
  const amended = recordWinner(added.matches, qf.id, qf.player_a_id!, { result: '5&4' })
  eq(find(amended.matches, qf.id).result, '5&4', 'and amended again')
  eq(amended.clearedIds, [], 'still without cascading')

  // Even in a fully played bracket, a margin edit disturbs nothing
  const full = playedOut()
  const early = inRound(full, 1)[0]
  const edited = recordWinner(full, early.id, early.winner_player_id!, { result: '6&5' })
  eq(edited.clearedIds, [], 'amending a margin in a played-out bracket clears nothing')
  eq(edited.changed.length, 1, 'and writes a single row')
  ok(full.every(m => {
    const a = find(edited.matches, m.id)
    return a.winner_player_id === m.winner_player_id
  }), 'every winner in the bracket survives a margin edit')

  // Clearing a margin back to nothing
  const cleared = recordWinner(added.matches, qf.id, qf.player_a_id!, { result: null })
  eq(find(cleared.matches, qf.id).result, null, 'a margin can be removed again')
  eq(find(cleared.matches, qf.id).winner_player_id, qf.player_a_id, 'leaving the winner')
}

// ─── Gesture rules ─────────────────────────────────────────────

section('Tap decides, hold corrects, neither on a bye')
{
  const press = (o: Partial<Parameters<typeof pressOutcome>[0]>) => pressOutcome({
    decidable: true, decided: false, moved: false, heldMs: 50, longPressMs: 500, ...o,
  })

  eq(press({}), 'decide', 'a tap on an open match records a winner')
  eq(press({ heldMs: 900 }), 'decide', 'holding an open match still just records it')

  // The rule that protects recorded results
  eq(press({ decided: true }), 'ignore',
    'a tap on a finished match does nothing — it cannot be rewritten by accident')
  eq(press({ decided: true, heldMs: 500 }), 'correct',
    'a deliberate hold reopens a finished match')
  eq(press({ decided: true, heldMs: 900 }), 'correct', 'a longer hold too')
  eq(press({ decided: true, heldMs: 499 }), 'ignore', 'just short of the threshold does nothing')

  // Movement means the finger was swiping the bracket, not pressing a tile
  eq(press({ moved: true }), 'ignore', 'a press that travelled is a swipe, not a tap')
  eq(press({ decided: true, moved: true, heldMs: 900 }), 'ignore',
    'a hold that travelled is a swipe too')

  // Byes and unfilled matches are inert whatever the gesture
  let inert = true
  for (const decided of [true, false]) {
    for (const moved of [true, false]) {
      for (const heldMs of [0, 100, 500, 5000]) {
        if (pressOutcome({ decidable: false, decided, moved, heldMs, longPressMs: 500 }) !== 'ignore') {
          inert = false
        }
      }
    }
  }
  ok(inert, 'a bye is inert under every combination of gesture')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
