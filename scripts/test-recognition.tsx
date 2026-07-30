/**
 * Returning-player tests. Run with: npm run test:recognition
 *
 * A player joins without an account, so the only way to greet them next time
 * is something left on their device. Two things have to hold:
 *
 *   · the cookie is per trip and per device, and a stale, junk or copied one
 *     recognises nobody rather than greeting the wrong person
 *   · the summary is the same number the leaderboard shows — a hub that says
 *     34 points while the board says 32 is worse than saying nothing
 *
 * And the quiet one: an unrecognised visitor must see the page exactly as it
 * was before any of this existed. No error, no empty block, no gap.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import {
  playerCookieName, isPlayerId, readPlayerId, buildCookie, clearCookie,
  COOKIE_DAYS,
} from '../lib/playerCookie'
import {
  standings, standingFor, matchRecord, describePosition, formatRelative, ordinal,
  type SummaryScore, type SummaryMatch,
} from '../lib/playerSummary'
import { WelcomeBackCard } from '../app/trip/[tripCode]/WelcomeBack'

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

const UUID_A = '3f9a1c2e-8b4d-4e6f-9a1b-2c3d4e5f6a7b'

// ─── The cookie ────────────────────────────────────────────────

section('One cookie per trip')
{
  eq(playerCookieName('ABC123'), 'gg_player_ABC123', 'named after the trip code')
  eq(playerCookieName('abc123'), 'gg_player_ABC123', 'uppercased, however the code was typed')

  // "Player accesses multiple trips → each trip has its own separate cookie"
  ok(playerCookieName('ABC123') !== playerCookieName('XYZ789'),
    'two trips never share a cookie, so they cannot be confused')

  // A malformed code must not produce a malformed cookie name
  eq(playerCookieName('AB C1;2'), 'gg_player_ABC12', 'spaces and semicolons are stripped')
  eq(playerCookieName(''), 'gg_player_', 'an empty code still gives a usable name')
}

section('Only something that could be a player is recognised')
{
  ok(isPlayerId(UUID_A), 'a UUID is a plausible id')
  ok(!isPlayerId('1'), 'a bare number is not')
  ok(!isPlayerId('ross'), 'nor is a name')
  ok(!isPlayerId(''), 'nor an empty string')
  ok(!isPlayerId(null), 'nor null')
  ok(!isPlayerId(undefined), 'nor undefined')
  ok(!isPlayerId(UUID_A.slice(0, 20)), 'nor a truncated one')

  eq(readPlayerId(UUID_A), UUID_A, 'a good value reads back')
  eq(readPlayerId(`  ${UUID_A.toUpperCase()}  `), UUID_A,
    'trimmed and lowercased, so it matches the database either way')

  // "Player clears cookies → treated as new visitor ... no broken state"
  eq(readPlayerId(null), null, 'a cleared cookie recognises nobody')
  eq(readPlayerId('garbage'), null, 'and so does a hand-edited one')
}

section('The cookie lasts, and is scoped sensibly')
{
  const c = buildCookie('gg_player_ABC123', UUID_A, { days: COOKIE_DAYS, https: true })

  ok(c.startsWith(`gg_player_ABC123=${UUID_A}`), 'it carries the player id')
  ok(c.includes('path=/'), 'across the whole site, so any trip page can read it')
  ok(c.includes('samesite=lax'), 'and is not sent from other sites')
  ok(c.includes('secure'), 'https only, over https')
  eq(COOKIE_DAYS, 180, 'and it lasts six months')
  ok(c.includes(`max-age=${180 * 24 * 60 * 60}`), 'expressed in seconds')

  // A secure cookie set over plain http is silently dropped, which would make
  // this work in production and fail on a dev server for no visible reason
  const local = buildCookie('gg_player_ABC123', UUID_A, { days: 1, https: false })
  ok(!local.includes('secure'), 'and not marked secure over plain http')

  // "Not you?" has to clear the same cookie, or it clears nothing
  const gone = clearCookie('gg_player_ABC123', { https: true })
  ok(gone.includes('max-age=0'), 'clearing sets no lifetime')
  ok(gone.includes('path=/'), 'on the same path it was set with')
  ok(gone.startsWith('gg_player_ABC123='), 'and the same name')
}

// ─── The summary ───────────────────────────────────────────────

const score = (playerId: string, roundId: string, points: number, holes = 1): SummaryScore[] =>
  Array.from({ length: holes }, () => ({ playerId, roundId, points }))

section('Totals are the same numbers the board shows')
{
  // Three players, two rounds, 18 holes each
  const scores = [
    ...score('a', 'r1', 3, 18), ...score('a', 'r2', 1, 18),   // 54 + 18 = 72
    ...score('b', 'r1', 2, 18), ...score('b', 'r2', 2, 18),   // 36 + 36 = 72
    ...score('c', 'r1', 1, 18), ...score('c', 'r2', 1, 18),   // 18 + 18 = 36
  ]
  const board = standings(scores)

  eq(standingFor('a', board)?.total, 72, 'a total is the sum of the rounds')
  eq(standingFor('c', board)?.total, 36, 'for everyone')
  eq(standingFor('a', board)?.holes, 36, 'holes are counted across rounds')
  eq(standingFor('a', board)?.rounds, 2, 'and so are rounds')

  // Level is two points a hole, which is the app's convention everywhere
  eq(standingFor('a', board)?.relative, 0, '72 off 36 holes is exactly level')
  eq(standingFor('c', board)?.relative, -36, 'and 36 is thirty-six behind')

  // The discard rule is the trip's, not a second implementation of it
  const dropped = standings(scores, 1)
  eq(standingFor('a', dropped)?.total, 54, 'dropping the worst round keeps the better one')
  eq(standingFor('b', dropped)?.total, 36, 'even when both are the same')
}

section('Position is shared where players are level')
{
  const board = standings([
    ...score('a', 'r1', 3, 18),   // 54
    ...score('b', 'r1', 3, 18),   // 54
    ...score('c', 'r1', 1, 18),   // 18
  ])

  eq(standingFor('a', board)?.position, 1, 'two players level are both first')
  eq(standingFor('b', board)?.position, 1, 'both of them')
  eq(standingFor('c', board)?.position, 3, 'and the next is third, not second')

  eq(describePosition(standingFor('c', board)!, board.length), '3rd of 3',
    'and it reads as a position in a field')
}

section('Somebody who has not played is not on the board')
{
  const board = standings([...score('a', 'r1', 2, 9)])
  eq(board.length, 1, 'only players with a score appear')
  eq(standingFor('b', board), null, 'and anyone else finds nothing')

  // Which is different from having played and scored nothing
  const zero = standings([...score('b', 'r1', 0, 18)])
  eq(standingFor('b', zero)?.total, 0, 'a player who scored nothing has a real total of zero')
  eq(standingFor('b', zero)?.position, 1, 'and a real position')
}

section('Ordinals and level read properly')
{
  eq(ordinal(1), '1st', 'first')
  eq(ordinal(2), '2nd', 'second')
  eq(ordinal(3), '3rd', 'third')
  eq(ordinal(4), '4th', 'fourth')
  eq(ordinal(11), '11th', 'eleventh, not eleven-st')
  eq(ordinal(12), '12th', 'twelfth')
  eq(ordinal(13), '13th', 'thirteenth')
  eq(ordinal(21), '21st', 'twenty-first')

  eq(formatRelative(0), 'E', 'level is E')
  eq(formatRelative(4), '+4', 'ahead carries a plus')
  eq(formatRelative(-4), '-4', 'and behind carries a minus')
}

// ─── Matchplay record ──────────────────────────────────────────

const match = (a: string | null, b: string | null, winner: string | null, isBye = false): SummaryMatch =>
  ({ sideA: a, sideB: b, winner, isBye })

section('A matchplay record counts matches, not byes')
{
  const played = matchRecord('a', [
    match('a', 'b', 'a'),
    match('a', 'c', 'a'),
    match('a', 'd', 'd'),
  ])
  eq(played.played, 3, 'three matches contested')
  eq(played.won, 2, 'two of them won')
  eq(played.stillIn, false, 'and out, having lost one')

  // A bye is awarded, not played — counting it as a win would have half a
  // field reading as though they had beaten somebody
  const bye = matchRecord('a', [match('a', null, 'a', true)])
  eq(bye.played, 0, 'a bye is not a match played')
  eq(bye.won, 0, 'nor a match won')
  eq(bye.stillIn, true, 'but it does keep you in the draw')

  // An undecided match is not a loss
  const pending = matchRecord('a', [match('a', 'b', 'a'), match('a', 'c', null)])
  eq(pending.played, 1, 'only decided matches count as played')
  eq(pending.won, 1, 'the win still counts')
  eq(pending.stillIn, true, 'and an undecided match leaves you in')

  // Nobody in the draw at all
  const absent = matchRecord('z', [match('a', 'b', 'a')])
  eq(absent.played, 0, 'someone not in the draw has played nothing')
  eq(absent.stillIn, false, 'and is not "still in" it either')
}

// ─── The greeting ──────────────────────────────────────────────

section('A recognised player is greeted, with their line')
{
  const html = renderToStaticMarkup(
    React.createElement(WelcomeBackCard, {
      name: 'Ross',
      onNotMe: () => {},
      lines: [
        { label: 'Points', value: '72', strong: true },
        { label: 'Position', value: '1st of 8' },
      ],
    })
  )

  ok(html.includes('Welcome back'), 'they are welcomed back')
  ok(html.includes('Ross'), 'by name')
  ok(html.includes('>72<'), 'with their points')
  ok(html.includes('1st of 8'), 'and their position')

  // The way out, for a shared phone
  ok(html.includes('Not you?'), 'and a way to say it is not them')
}

section('A greeting with nothing to report is still a greeting')
{
  const html = renderToStaticMarkup(
    React.createElement(WelcomeBackCard, { name: 'Ross', onNotMe: () => {}, lines: [] })
  )
  ok(html.includes('Welcome back'), 'someone who has not played is still welcomed')
  ok(html.includes('Ross'), 'by name')
  ok(!html.includes('Points'), 'with no empty stat labels')
  ok(!html.includes('undefined'), 'and nothing half-rendered')
  ok(!html.includes('NaN'), 'and no stray arithmetic')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
