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
  shapeKey, unitLabel, roundLabelOf, boardsForCreation, formatStepIssue, unreadRounds, unreadFact, unreadSentence,
  type ShapeInput,
} from '../lib/eventShape'
import { type SessionFormat, type SessionDraft, syncDrafts, resolvedFormats, STROKE_FORMAT } from '../lib/sessions'
import { parseLeaderboards } from '../lib/leaderboards'
import { governingBoard } from '../lib/partnerships'
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

section('A round on screen is a round or a session, from what is stored')
{
  const [ryder] = SHAPE_CASES.filter(c => c.name.startsWith('a Ryder Cup'))
  eq(roundLabelOf(ryder.boards, 'r2', 2), 'Session 2', 'an Overall’s round is a session')
  const named = ryder.boards.map(b => b.competition === 'overall'
    ? { ...b, overall: { ...b.overall!, names: { r1: 'Friday fourballs' } } } : b)
  eq(roundLabelOf(named, 'r1', 1), 'Friday fourballs', '  …by its name where it has one')
  eq(roundLabelOf(SHAPE_CASES[0].boards, 'r2', 2), 'Round 2', 'a league’s round is a round')
  const [same] = SHAPE_CASES.filter(c => c.name.includes('identical'))
  eq(roundLabelOf(same.boards, 'r1', 1), 'Session 1',
    'an Overall made before the rule stays sessions, though the rule would now say rounds')
}

section('The boards an event is made with (stage 3)')
{
  const make = (formats: (SessionFormat | null)[], tags = 0, extra: Partial<Parameters<typeof boardsForCreation>[0]> = {}) => {
    const shape = eventShape({ formats, tags })
    return boardsForCreation({
      rounds: formats.map((format, i) => ({ roundId: `r${i + 1}`, format })),
      shape: shape.main === 'ask' ? { ...shape, main: 'overall', unit: 'Session' } : shape,
      ranks: shape.ranks, entrants: 8, fieldSize: 16, secondaries: [], ...extra,
    })
  }
  // Ross's check 1: a one-round club Stableford at 95%.
  const club = make([sf(95)])
  eq(club.length, 1, 'one round of Stableford: one board')
  eq([club[0].competition, club[0].scoring, club[0].combine, club[0].handicapAllowance, club[0].roundIds],
    ['league', 'stableford', 'total', 95, undefined], '  …a league board on every round, at 95%')
  eq(storedShape(club).main, 'league', '  …which reads back as a league')
  eq(boardName(club[0], club), 'Leaderboard', '  …called Leaderboard')

  const three = make([sf(), sf(), sf(85)])
  eq(three.length, 1, 'three Stableford rounds: one board')
  eq(three[0].roundAllowances, { r3: 85 }, '  …round 3’s own allowance on it (D86)')
  eq(make([sf(), sf()], 0, { discard: 1 })[0].discardWorst, 1, 'the worst round dropped where asked')
  eq(make([sf(), sf()], 0, { discard: 0 })[0].discardWorst, undefined, '  …and absent where not')
  const team = make([bb, bb])
  ok(team[0].audience === 'team' && team[0].teamSet !== 'main' && !!team[0].teamSet,
    'a team league is kept off the main sheet, which holds the event’s tags')
  eq(make([{ ...bb, countingScores: 1 }])[0].countingScores, 1, 'better ball’s count carried')

  // Check 3: two tags, fourball then singles.
  const ryder = make([fourball, singles], 2)
  eq(ryder.map(b => b.competition), ['overall', 'matches', 'matches'], 'two tags, fourball then singles: the Overall and two sessions')
  eq(ryder[0].overall?.ranks, 'tags', '  …ranking tags')
  eq(ryder[0].overall?.slots, { r1: 4, r2: 8 }, '  …each session holding the field’s usual matches')
  eq(boardName(ryder[0], ryder), 'Overall', '  …called Overall')
  eq(governingBoard(ryder, 'r1')?.id, 'lb-session-r1', 'the Overall never governs a round')
  eq(mainLeagueBoard(ryder), null, '  …and there is no Primary')

  // Check 4: a Matches day, then a Stableford day.
  const mixed = make([singles, sf()])
  eq(mixed.map(b => b.competition), ['overall', 'matches', 'league'], 'Matches then Stableford: the Overall, never a Primary')
  ok(mixed[2].session === true && mixed[2].roundIds?.[0] === 'r2', '  …the Stableford day a session of its own')
  const tbc = make([fourball, null])
  eq(tbc.length, 2, 'a session left TBC has no board')
  const named = boardsForCreation({
    rounds: [{ roundId: 'r1', format: fourball, name: 'Friday fourballs', matches: 3 }],
    shape: eventShape({ formats: [fourball], tags: 0 }), ranks: 'individuals', entrants: 8, fieldSize: 16, secondaries: [],
  })
  eq([named[0].overall?.names, named[0].overall?.slots], [{ r1: 'Friday fourballs' }, { r1: 3 }], 'a session’s name and count kept on the Overall')
  const sec = { id: 'sec', audience: 'individual' as const, competition: 'league' as const, scoring: 'strokes' as const, combine: 'total' as const }
  const withSec = make([sf()], 0, { secondaries: [sec] })
  eq(withSec.map(b => b.id), ['lb-primary', 'sec'], 'a secondary sits after the main board')
  eq(boardName(withSec[0], withSec), 'Primary', '  …which is then the Primary (check 2)')
  // Every board made here survives the parser unchanged — nothing it would drop.
  // Keys sorted and the parser's own zero discard left out: the same board either way.
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>)
          .filter(([k, x]) => !(k === 'discardWorst' && x === 0))
          .sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
      : v
  for (const [label, boards] of Object.entries({ club, three, team, ryder, mixed, withSec })) {
    eq(canon(parseLeaderboards(JSON.parse(JSON.stringify(boards)))), canon(boards), `${label}: stored and read back unchanged`)
  }
  const continuous = boardsForCreation({
    rounds: [{ roundId: null, format: sf() }], shape: eventShape({ formats: [sf()], tags: 0 }),
    ranks: 'individuals', entrants: 1, fieldSize: 0, secondaries: [],
  })
  eq(continuous.map(b => b.id), ['lb-primary'], 'a league of periods: one board, no round needed')
}

section('Stroke rounds in different formats: asked once (stage 4, D90)')
{
  // Ross's check 5: Stableford on day one, better ball on day two.
  const formats = [sf(), bb]
  const asked = eventShape({ formats, tags: 0 })
  eq(asked.main, 'ask', 'Stableford then better ball: the question')
  const made = (answer: 'one_total' | 'per_round') => boardsForCreation({
    rounds: formats.map((format, i) => ({ roundId: `r${i + 1}`, format })),
    shape: answeredShape(asked, answer), ranks: 'individuals', entrants: 8, fieldSize: 8, secondaries: [],
  })
  const one = made('one_total')
  eq(one.map(b => b.id), ['lb-primary', 'lb-round-r2'], 'one total: the Primary, then day two’s own board')
  eq([one[0].audience, one[0].scoring, one[0].roundIds], ['individual', 'stableford', undefined],
    '  …the Primary every player’s own Stableford over both rounds')
  eq([one[1].audience, one[1].teamFormat, one[1].roundIds], ['team', 'better_ball', ['r2']], '  …better ball on day two beside it')
  eq(storedShape(one).main, 'league', '  …a league')
  eq(boardName(one[0], one), 'Primary', '  …its main board the Primary')
  eq(roundLabelOf(one, 'r2', 2), 'Round 2', '  …its rounds rounds')
  const per = made('per_round')
  eq(per.map(b => b.competition), ['overall', 'league', 'league'], 'points per round: the Overall and two sessions')
  eq(per[0].overall?.feeds?.r1?.kind, 'position', '  …paying by finishing position')
  eq(roundLabelOf(per, 'r2', 2), 'Session 2', '  …its rounds sessions')
  eq(eventShape({ formats: [sf(), strokes], tags: 0 }).main, 'overall', 'Stableford beside strokes is never asked: the Overall')
  const form = fs.readFileSync('app/dashboard/create/CreateLeagueForm.tsx', 'utf-8')
  ok(form.includes("'One total across every round'") && form.includes("'Points per round'"), 'the wizard asks it in Ross’s words')
  ok(form.includes("key === 'format' ? formatProblem === null && !asking"), '  …and waits for an answer')
}

section('A secondary beside the Overall names what it cannot read (stage 5, D83, D87)')
{
  const sec = { id: 'sec', audience: 'individual' as const, competition: 'league' as const, scoring: 'stableford' as const, combine: 'total' as const }
  const boards = boardsForCreation({
    rounds: [
      { roundId: 'r1', format: foursomes }, { roundId: 'r2', format: sf() }, { roundId: 'r3', format: singles },
    ],
    shape: eventShape({ formats: [foursomes, sf(), singles], tags: 2 }), ranks: 'tags', entrants: 2, fieldSize: 24,
    secondaries: [sec],
  })
  eq(boards.map(b => b.id).at(-1), 'sec', 'a secondary sits beside the Overall (D83)')
  eq(unreadRounds(sec, boards, ['r1', 'r2', 'r3']), ['r1', 'r3'],
    'a stroke secondary leaves out every Matches session — foursomes, singles alike')
  eq(unreadRounds({ ...sec, roundIds: ['r2'] }, boards, ['r1', 'r2', 'r3']), [], '  …nothing where it counts only stroke rounds')
  eq(unreadRounds(boards[0], boards, ['r1', 'r2', 'r3']), [], '  …and the Overall reads them all')
  eq(unreadRounds(boards.find(b => b.id === 'lb-session-r2')!, boards, ['r1', 'r2', 'r3']), [], '  …as does a session’s own board')
  eq(unreadRounds(sec, [sec], ['r1', 'r2']), [], 'no Overall, nothing left out')
  eq(unreadFact(['Session 1']), 'Leaves out Session 1', 'the fact names one session')
  eq(unreadFact(['Session 1', 'Session 3']), 'Leaves out 2 sessions', '  …and counts several')
  ok((unreadFact(['A very long session name indeed']) ?? '').length <= 28, '  …held to the facts line’s length')
  eq(unreadFact([]), null, '  …and says nothing when nothing is left out')
  eq(unreadSentence('Stableford Points', ['Session 1', 'Session 3']),
    'Stableford Points leaves out Session 1 and Session 3: they have no card of each player’s own.', 'the creation grid’s sentence')
  const lb = fs.readFileSync('app/golf/[root]/[tripCode]/leaderboard/TripLeaderboardClient.tsx', 'utf-8')
  ok(lb.includes('const unread = unreadRounds(activeBoard, boards, rounds.map(r => r.id))'), 'the leaderboard’s facts line says it')
}

section('The Format step’s rounds follow the playing days')
{
  const fresh = syncDrafts([], [0, 1, 2], true)
  eq(fresh.map(d => d.dayIndex), [0, 1, 2], 'a round for every playing day')
  eq(fresh[0].format, STROKE_FORMAT, '  …Round 1 with a format of its own')
  eq(fresh.slice(1).map(d => d.format), ['same', 'same'], '  …the rest "Same as Round 1"')
  const answered: SessionDraft[] = [
    { key: 'a', dayIndex: 0, courseId: 'c1', format: fourball },
    { key: 'b', dayIndex: 0, courseId: 'c1', format: 'same' },
    { key: 'c', dayIndex: 1, courseId: 'c2', format: singles },
  ]
  const kept = syncDrafts(answered, [0, 1], true)
  eq(kept.map(d => d.key), ['a', 'b', 'c'], 'answers kept, two on a day kept')
  eq(syncDrafts(answered, [0, 1], false).map(d => d.key), ['a', 'c'], '  …a series holds one a day')
  const dropped = syncDrafts(answered, [1, 2], true)
  eq(dropped.map(d => d.dayIndex), [1, 2], 'a day gone takes its rounds; a new day gains one')
  eq(dropped[0].format, singles, '  …and the new Round 1 keeps its own format')
  const fromSame = syncDrafts([{ key: 'x', dayIndex: 1, courseId: '', format: 'same' }], [1], true)
  ok(fromSame[0].format !== 'same', 'Round 1 is never "Same as Round 1"')
  eq(resolvedFormats([{ key: 'a', dayIndex: 0, courseId: '', format: sf() }, { key: 'b', dayIndex: 1, courseId: '', format: 'same', allowance: 85 }])[1],
    sf(85), 'the same format off its own allowance')

  eq(formatStepIssue([{ courseId: 'c', format: sf(), label: 'Round 1' }], 'league'), null, 'one round, a venue and a format: ready')
  ok(!!formatStepIssue([{ courseId: '', format: sf(), label: 'Round 1' }], 'league'), 'no venue: not ready')
  eq(formatStepIssue([{ courseId: 'c', format: sf(), label: 'Round 1' }, { courseId: 'tbc', tbcVenue: true, format: sf(), label: 'Round 2' }], 'league'),
    null, 'a league round may wait for its venue')
  ok(!!formatStepIssue([{ courseId: 'c', format: fourball, label: 'Session 1' }, { courseId: 'tbc', tbcVenue: true, format: fourball, label: 'Session 2' }], 'overall'),
    '  …a session may not')
}

section('The screens ask the one helper')
{
  const read = (f: string) => fs.readFileSync(f, 'utf-8')
  const base = 'app/golf/[root]/[tripCode]/'
  ok(read(base + 'round/[roundNumber]/page.tsx').includes('{sessionInfo ? sessionInfo.name : `Round ${round.round_number}`}'),
    'a round summary on an Overall names its session, never "Round n"')
  ok(read(base + 'teesheet/page.tsx').includes('label: roundLabelOf(boards, r.id, r.round_number)'),
    'the tee sheet names its rounds through roundLabelOf')
  ok((read(base + 'teesheet/TeeSheetClient.tsx').match(/label \?\? `Round \$\{/g) ?? []).length === 3,
    '  …in all three places it says which round')
  ok(read(base + 'organiser/page.tsx').includes('label: roundLabelOf('),
    'the organiser area names its rounds through roundLabelOf')
  const lb = read(base + 'leaderboard/TripLeaderboardClient.tsx')
  ok(lb.includes("const named = isEvent || boards.some(b => b.id === 'lb-primary')")
    && lb.includes("const nameOf = (t: Leaderboard) => named ? boardName(t, boards) : boardTitle(t)"),
    'the leaderboard names its boards through boardName — on an event, and on a trip made from its Format')
  ok(lb.includes('{nameOf(activeBoard)}') && lb.includes(": nameOf(t) }"),
    '  …on the tab and on the title card')
}

section('Trips take the model (stage 8, D47)')
{
  const form = fs.readFileSync('app/dashboard/create/CreateTripForm.tsx', 'utf-8')
  ok(form.includes('Set the format') && form.includes('Decide later'), 'a trip’s Format is offered, and optional')
  ok(form.includes('const written = roundIds ? formatBoards(roundIds) : boards')
    && form.includes('if (written.length > 0) tripRow.leaderboards = written'),
    '  …and a trip that never opens it writes exactly what it always did')
  ok(form.includes('...(roundIds ? { id: roundIds[i] } : {}),'), '  …its rounds named by the boards only when the format was set')
  ok(form.includes("const ruledShape = eventShape({ formats: roundFormats, tags: 0 })"), 'the same rule chooses a trip’s board')
  const setup = fs.readFileSync('app/golf/[root]/[tripCode]/setup/TripSetupClient.tsx', 'utf-8')
  ok(setup.includes('<p className="t-label text-ink">Formats</p>') && !setup.includes('Dynamic Overall Leaderboard is off'),
    'Trip Setup’s door is Formats')
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
