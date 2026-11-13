/**
 * The shape of an event, read from its golf (D77–D90). Run with:
 * npm run test:event-shape
 *
 * Every row of the brief's table, the cases around it (TBC, allowance alone,
 * tags), every stored shape of event read back through the rule, the one
 * naming function, and that the rule never reads the field.
 */

import fs from 'fs'
import {
  eventShape, answeredShape, storedShape, roundFormatsOf, boardName, mainLeagueBoard,
  shapeKey, unitLabel, type ShapeInput,
} from '../lib/eventShape'
import type { SessionFormat } from '../lib/sessions'
import { SHAPE_CASES } from './fixtures/event-shapes'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  ok(g === w, `${label} — got ${g}, want ${w}`)
}
const section = (n: string) => console.log(`\n${n}`)

const sf = (pct?: number): SessionFormat => ({
  kind: 'stroke', audience: 'individual', scoring: 'stableford', ...(pct ? { handicapAllowance: pct } : {}),
})
const strokes: SessionFormat = { kind: 'stroke', audience: 'individual', scoring: 'strokes' }
const quota: SessionFormat = { kind: 'stroke', audience: 'individual', scoring: 'quota' }
const bb: SessionFormat = { kind: 'stroke', audience: 'team', scoring: 'stableford', teamFormat: 'better_ball' }
const hero: SessionFormat = { kind: 'stroke', audience: 'team', scoring: 'stableford', teamFormat: 'hero' }
const fourball: SessionFormat = { kind: 'matches', match: 'fourball' }
const singles: SessionFormat = { kind: 'matches', match: 'singles' }
const foursomes: SessionFormat = { kind: 'matches', match: 'foursomes' }
const shape = (formats: (SessionFormat | null)[], tags = 0) => eventShape({ formats, tags })

section('The table')
{
  const one = shape([sf()])
  eq([one.main, one.unit, one.reason], ['league', 'Round', 'same'], 'one Stableford round: a league, rounds')
  const three = shape([sf(), sf(), sf()])
  eq([three.main, three.unit], ['league', 'Round'], 'three Stableford rounds: a league')
  eq(shape([bb, bb]).main, 'league', 'better ball every round: a league')
  const m = shape([fourball, singles])
  eq([m.main, m.unit, m.reason], ['overall', 'Session', 'matches'], 'Matches only: the Overall, sessions')
  const mixed = shape([fourball, sf()])
  eq([mixed.main, mixed.unit, mixed.reason], ['overall', 'Session', 'matches_mixed'], 'Matches beside stroke: the Overall')
  eq(shape([sf(), fourball]).main, 'overall', 'a stroke day then a Matches day: the Overall')
  const diff = shape([sf(), bb])
  eq([diff.main, diff.reason], ['ask', 'different'], 'Stableford then better ball: asked (D90)')
  eq(shape([bb, hero]).main, 'ask', 'two team formats on one scoring: asked')
  const face = shape([fourball, foursomes, singles], 2)
  eq([face.main, face.ranks, face.faceOff], ['overall', 'tags', true], 'two tags + Matches: Overall, tags, face-off')
}

section('Rounds that do not fit one board get the Overall (Ross, 13 Nov 2026)')
{
  const s = shape([sf(), strokes])
  eq([s.main, s.unit, s.reason], ['overall', 'Session', 'mixed_scoring'], 'Stableford beside strokes: the Overall')
  eq(shape([quota, sf()]).main, 'overall', 'quota beside Stableford: the Overall')
  eq(shape([bb, { ...strokes, audience: 'team', teamFormat: 'better_ball' }]).main, 'overall',
    'better ball on two scorings: the Overall')
}

section('Format TBC is ignored')
{
  eq(shape([sf(), null, sf()]).main, 'league', 'a TBC round between two Stablefords: still a league')
  eq(shape([null, fourball]).main, 'overall', 'a TBC round beside Matches: the Overall')
  const empty = shape([null, null])
  eq([empty.main, empty.reason], ['league', 'empty'], 'every round TBC: nothing to change yet')
  eq(shape([]).main, 'league', 'no rounds: a league')
}

section('Allowance alone is never a different format (D86)')
{
  eq(shape([sf(95), sf(85), sf()]).main, 'league', 'Stableford at 95, 85 and 100: a league')
  eq(shapeKey(sf(85)), shapeKey(sf()), 'the key leaves the allowance out')
  eq(shape([{ ...fourball, handicapAllowance: 85 }, fourball]).reason, 'matches', 'a Matches allowance changes nothing')
}

section('Tags')
{
  eq(shape([sf()], 0).ranks, 'individuals', 'no tags: the Overall would rank individuals')
  eq(shape([sf()], 1).ranks, 'individuals', 'one tag is no sides')
  eq(shape([fourball], 3).ranks, 'tags', 'three tags: tags')
  ok(!shape([fourball], 3).faceOff, 'three tags: no face-off')
  ok(!shape([fourball], 0).faceOff, 'no tags: no face-off')
  ok(!shape([sf(), sf()], 2).faceOff, 'two tags over stroke rounds: no face-off')
  ok(!shape([sf(), strokes], 2).faceOff, 'two tags, an Overall over stroke only: no face-off')
}

section('The answer to D90')
{
  const asked = shape([sf(), bb])
  eq(answeredShape(asked, 'one_total').main, 'league', 'one total: a league')
  eq(answeredShape(asked, 'one_total').unit, 'Round', 'one total: rounds')
  eq(answeredShape(asked, 'per_round').main, 'overall', 'points per round: the Overall')
  eq(answeredShape(asked, 'per_round').unit, 'Session', 'points per round: sessions')
  eq(answeredShape(asked, null).main, 'ask', 'unanswered stays asked')
  eq(answeredShape(shape([sf()]), 'per_round').main, 'league', 'an answer never moves a shape that was not asked')
}

section('Every stored shape of event, read back')
for (const c of SHAPE_CASES) {
  eq(storedShape(c.boards).main, c.stored, `${c.name}: stored`)
  eq(storedShape(c.boards).unit, c.stored === 'overall' ? 'Session' : 'Round', `${c.name}: unit`)
  const formats = roundFormatsOf(c.boards, c.roundIds)
  eq(formats.length, c.roundIds.length, `${c.name}: one format a round`)
  eq(eventShape({ formats, tags: c.tags }).main, c.rule, `${c.name}: the rule`)
  for (const [id, name] of Object.entries(c.names ?? {})) {
    const lb = c.boards.find(b => b.id === id)
    ok(!!lb, `${c.name}: board ${id} exists`)
    if (lb) eq(boardName(lb, c.boards), name, `${c.name}: ${id} is called`)
  }
}

section('Reading formats back')
{
  const [ryder] = SHAPE_CASES.filter(c => c.name.startsWith('a Ryder Cup'))
  const f = roundFormatsOf(ryder.boards, ryder.roundIds)
  eq(f.map(x => x && x.kind === 'matches' ? x.match : null), ['fourball', 'foursomes', 'singles'], 'each session its own match')
  const [mixed] = SHAPE_CASES.filter(c => c.name.startsWith('an Overall with a Stableford day'))
  eq(roundFormatsOf(mixed.boards, mixed.roundIds)[2], null,
    'an Overall round with no session board is TBC — never the secondary covering it')
  const [allow] = SHAPE_CASES.filter(c => c.name.includes('85%'))
  const a = roundFormatsOf(allow.boards, allow.roundIds)
  eq(a.map(x => x?.handicapAllowance ?? 100), [100, 85], 'a round’s own allowance read back')
  const [day] = SHAPE_CASES.filter(c => c.name.includes('day board'))
  eq(roundFormatsOf(day.boards, day.roundIds).map(x => x && x.kind === 'stroke' ? x.audience : null),
    ['individual', 'team'], 'a day board is that round’s format')
}

section('Naming (D79)')
{
  const [one] = SHAPE_CASES
  eq(mainLeagueBoard(one.boards)?.id, 'sf', 'the first whole-event league board leads')
  const ko = SHAPE_CASES.find(c => c.stored === 'knockout')!
  eq(mainLeagueBoard(ko.boards), null, 'a knockout has no league board leading')
  const overall = SHAPE_CASES.find(c => c.stored === 'overall')!
  eq(mainLeagueBoard(overall.boards), null, 'an event with Matches never has a Primary')
  const scopedFirst = [{ id: 'd', audience: 'individual' as const, competition: 'league' as const, scoring: 'stableford' as const, combine: 'total' as const, roundIds: ['r1'] }]
  eq(mainLeagueBoard(scopedFirst), null, 'a board scoped to one day never leads')
  eq(unitLabel('Round', 3), 'Round 3', 'Round n')
  eq(unitLabel('Session', 2), 'Session 2', 'Session n')
  eq(unitLabel('Session', 2, 'Friday foursomes'), 'Friday foursomes', 'a session’s own name')
  eq(unitLabel('Session', 2, '  '), 'Session 2', 'a blank name is the number')
}

section('The rule never reads the field (D85)')
{
  const src = fs.readFileSync('lib/eventShape.ts', 'utf-8')
  const rule = src.slice(src.indexOf('export type ShapeInput'), src.indexOf('// ─── Reading what is stored'))
  ok(!/player|field|entrant|roster|fieldSize|playerCount/i.test(rule.replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')),
    'the rule names no players, field or entrants')
  const keys: (keyof ShapeInput)[] = ['formats', 'tags']
  eq(Object.keys({ formats: [], tags: 0 } satisfies ShapeInput).sort(), [...keys].sort(), 'the input is formats and tags')
  // The same golf gives the same answer whoever is playing: the rule has no way to be told.
  eq(shape([sf(), bb]), shape([sf(), bb]), 'deterministic')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(failures.map(f => `  - ${f}`).join('\n')); process.exit(1) }
