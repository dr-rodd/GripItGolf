/**
 * One scorecard gate for every card (D68–D71; Ross, 11 Nov 2026).
 * Run with: npm run test:scorecard-gate
 *
 * `cardBlocker` (lib/courseCard.ts) is the one question every door asks —
 * the stroke round, the knockout and session match cards, a league
 * period's Start a card — and the server asks it too (`startPeriodCard`,
 * migration 073's trigger on `live_rounds`). Choosing a course is never
 * refused; starting a card is. The labels are plain lines, never pills.
 */

import fs from 'fs'
import path from 'path'
import {
  cardBlocker, cardState, ratedTeeCount, listedBlocker, embeddedBlocker,
  CARD_BLOCKER_LABEL, gateLine, blockersByCourse,
} from '../lib/courseCard'

let passed = 0, failed = 0
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) passed++
  else { failed++; console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}
const section = (n: string) => console.log(`\n${n}`)
const read = (p: string) => fs.readFileSync(p, 'utf-8')

// ─── The rule ──────────────────────────────────────────────────

section('cardBlocker, read off the four card states')
{
  // confirmed and researched play; unrated and none do not.
  eq(cardState(18, true, 2), 'confirmed', 'a photographed card with tees is confirmed')
  eq(cardBlocker(18, 2), null, '  …and nothing blocks it')
  eq(cardState(18, false, 2), 'researched', 'a researched card with tees is researched')
  eq(cardBlocker(18, 2), null, '  …and a round on it starts exactly as before')
  eq(cardState(18, false, 0), 'unrated', 'eighteen holes and no rated tee is unrated')
  eq(cardBlocker(18, 0), 'unrated', '  …which blocks, and a photo will not fix it')
  eq(cardState(0, false, 2), 'none', 'no holes is none')
  eq(cardBlocker(0, 2), 'none', '  …which blocks, and a photo fixes it')
  eq(cardBlocker(9, 2), 'none', 'fewer than eighteen holes is no scorecard')
  eq(cardBlocker(0, 0), 'none', 'no holes and no tees: the scorecard is the first thing missing')
}

section('Which tees count')
{
  eq(ratedTeeCount([
    { course_rating: 72.1, slope: 131, par: 72 },
    { course_rating: null, slope: 131, par: 72 },
    { course_rating: 70.2, slope: null, par: 72 },
    { course_rating: 70.2, slope: 125, par: null },
  ]), 1, 'only a tee with a rating, a slope and a par counts')
  eq(listedBlocker({}), null, 'a listed course read without its counts draws no line — never a guess')
  eq(listedBlocker({ hole_count: 0, rated_tees: 0 }), 'none', 'a listed course with no holes is No scorecard')
  eq(listedBlocker({ hole_count: 18, rated_tees: 0 }), 'unrated', '  …with holes and no rated tee, No ratings')
  eq(listedBlocker({ hole_count: 18, rated_tees: 3 }), null, '  …researched or confirmed: nothing')
  eq(embeddedBlocker({ name: 'x' }), null, 'a course read without the embed draws no line')
  eq(embeddedBlocker({ holes: [{ count: 0 }], tees: [] }), 'none', 'the embedded counts read as the list\'s do')
  eq(embeddedBlocker({ holes: [{ count: 18 }], tees: [{ course_rating: 70, slope: 120, par: 72 }] }), null,
    '  …and a playable course has no line')
}

section('The words')
{
  eq(CARD_BLOCKER_LABEL, { none: 'No scorecard', unrated: 'No ratings' }, 'the two lines, and only two')
  eq(gateLine('none', true), 'Photograph the printed card to add its pars and indexes.', 'the gate asks for the photo')
  ok(gateLine('unrated', true).endsWith('Ask the organiser.') && !gateLine('unrated', true).includes('Trip Setup'),
    'an event\'s field is never sent to Trip Setup, which it never sees')
  ok(gateLine('unrated', false).endsWith('Add them in Trip Setup.'), '  …a trip is')
}

// ─── The doors ─────────────────────────────────────────────────

const DOORS = {
  'stroke round (the Scoring tab\'s card list)': 'app/scoring/[slug]/CourseDashboardClient.tsx',
  'stroke round (activation and the players)': 'app/scoring/LiveScoringFlow.tsx',
  'knockout match card': 'app/golf/[root]/[tripCode]/match/[matchId]/card/page.tsx',
  'session match card': 'app/golf/[root]/[tripCode]/session/[roundId]/match/[slot]/card/page.tsx',
  'a league period\'s Start a card': 'app/golf/[root]/[tripCode]/LeagueRounds.tsx',
}

section('Every door asks cardBlocker and draws ScorecardGate')
for (const [name, file] of Object.entries(DOORS)) {
  const src = read(file)
  ok(src.includes("import ScorecardGate from '@/app/components/ScorecardGate'")
    || src.includes('import ScorecardGate from "@/app/components/ScorecardGate"'), `${name} draws the gate`)
}
{
  const dash = read(DOORS['stroke round (the Scoring tab\'s card list)'])
  ok(dash.includes('cardBlocker(courseHoles.length, ratedTeeCount(courseTees))'), 'the card list asks cardBlocker')
  const start = dash.slice(dash.indexOf('async function startNewScorecard'))
  ok(start.indexOf('if (blocker) return') > -1
    && start.indexOf('if (blocker) return') < start.indexOf('.from("live_rounds")'),
    '  …and makes no live_rounds row while it says no')
  ok(start.slice(0, start.indexOf('\n  }\n')).includes('.insert({ course_id: courseId, round_id: courseRound.id, status: "active" })'),
    '  …while a researched course still goes live with the same insert as before')

  const flow = read(DOORS['stroke round (activation and the players)'])
  const activate = flow.slice(flow.indexOf('async function handleActivate'))
  ok(activate.indexOf('if (activateBlocker)') > -1
    && activate.indexOf('if (activateBlocker)') < activate.indexOf('.from("live_rounds")'),
    'activation asks before any live_rounds row')
  ok(/const canStart =[\s\S]*?cardBlocker\(/.test(flow), 'Start Round asks cardBlocker')

  // The match card reads: the gate decides ahead of the arrangement.
  for (const f of ['app/golf/[root]/[tripCode]/match/matchCards.ts', 'app/golf/[root]/[tripCode]/session/sessionMatches.ts']) {
    ok(read(f).includes('cardBlocker('), `${path.basename(f)} asks cardBlocker`)
  }

  const league = read(DOORS['a league period\'s Start a card'])
  const sheet = league.slice(league.indexOf('export function StartPeriodCard'))
  ok(sheet.includes('if (blocker) { setError(gateLine(blocker, true)); return }'),
    'Start card makes nothing while the course is blocked')
  ok(sheet.includes('blocker && mayStart && chosen'), '  …and shows the gate to whoever may start the card (D71)')
}

section('No door counts holes for itself')
{
  // holes.length < 18, holes.length === 0 and courseHoles.length > 0 were the
  // three ways a start condition was written before the gate. Outside lib/,
  // none of them decides whether a card may start.
  const banned = [/holes\.length\s*<\s*18/, /holes\.length\s*===\s*0/, /courseHoles\.length\s*>\s*0\s*&&/]
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(tsx?)$/.test(e.name)) files.push(p)
    }
  }
  walk('app')
  // The files that start a card: the doors, the match card reads, anything
  // inserting a live_rounds row or deciding a canStart. A hole count used to
  // draw a card (the round summary, the leaderboard) is not a start.
  const starters = files.filter(f => {
    const src = read(f)
    return Object.values(DOORS).includes(f)
      || /matchCards\.ts$|sessionMatches\.ts$/.test(f)
      || /from\("live_rounds"\)\s*\.insert|from\('live_rounds'\)\s*\.insert/.test(src)
      || src.includes('const canStart')
  }).filter(f => !f.startsWith('app/admin') && !f.startsWith('app/api'))
  ok(starters.length >= 7, `the files that start a card are found (${starters.length})`)
  for (const f of starters) {
    const src = read(f)
    for (const b of banned) ok(!b.test(src), `${f} does not decide a start with ${b.source}`)
  }
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  const canStart = flow.slice(flow.indexOf('const canStart ='), flow.indexOf('pendingReason === null', flow.indexOf('const canStart =')))
  ok(!canStart.includes('courseHoles.length >'), 'Start Round no longer reads the hole count itself')
}

section('The server refuses too')
{
  const store = read('lib/leagueRoundStore.ts')
  const fn = store.slice(store.indexOf('export async function startPeriodCard'))
  const body = fn.slice(0, fn.indexOf('\n}\n'))
  const gate = body.indexOf('const blocker = cardBlocker(')
  ok(gate > -1 && gate < body.indexOf(".from('rounds')"), 'startPeriodCard asks cardBlocker before it finds or makes a round')
  ok(body.includes('if (blocker) return { ok: false, error: gateLine(blocker, args.event ?? true) }'),
    '  …and refuses with the gate\'s own line')

  const migration = read('supabase/migrations/20260101000073_scorecard_gate.sql')
  ok(/BEFORE INSERT ON live_rounds/.test(migration), 'migration 073 checks every live card before it is made')
  ok(migration.includes('< 18') && /course_rating IS NOT NULL AND slope IS NOT NULL AND par IS NOT NULL/.test(migration),
    '  …for eighteen holes and a rated tee, as cardBlocker does')
  ok(migration.includes('DROP TRIGGER IF EXISTS trg_live_rounds_scorecard_gate ON live_rounds;'),
    '  …and its undo is one DROP TRIGGER')
  const check = read('scripts/rls-check.sql')
  ok(check.includes('trg_live_rounds_scorecard_gate'), 'scripts/rls-check.sql checks the trigger landed')
  ok(/stages 7 and 8/.test(check.slice(check.indexOf('Scorecard gate'))),
    '  …and says match card writes are closed by RLS stages 7 and 8')
}

// The behaviour, not only the text: startPeriodCard on a stand-in database.
section('startPeriodCard refuses a blocked course')
const behaviour = (async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://placeholder.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'placeholder'
  const { supabase } = await import('../lib/supabase')
  const { startPeriodCard } = await import('../lib/leagueRoundStore')
  const touched: string[] = []
  const fake = (holes: number, tees: { course_rating: number | null; slope: number | null; par: number | null }[]) =>
    (table: string) => {
      touched.push(table)
      const chain: Record<string, unknown> = {}
      const result = table === 'holes'
        ? { data: null, error: null, count: holes }
        : table === 'tees'
          ? { data: tees, error: null }
          : table === 'rounds'
            ? { data: [{ round_number: 4 }], error: null }
            : { data: null, error: null }
      for (const m of ['select', 'eq', 'order', 'limit', 'insert']) chain[m] = () => chain
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return chain
    }
  const real = supabase.from.bind(supabase)
  try {
    ;(supabase as unknown as { from: unknown }).from = fake(0, [])
    let r = await startPeriodCard({ tripId: 't', courseId: 'c', date: '2026-11-11' })
    eq(r, { ok: false, error: gateLine('none', true) }, 'no scorecard: refused with the gate\'s line')
    ok(!touched.includes('rounds'), '  …and no round is looked for or made')

    touched.length = 0
    ;(supabase as unknown as { from: unknown }).from = fake(18, [{ course_rating: null, slope: 120, par: 72 }])
    r = await startPeriodCard({ tripId: 't', courseId: 'c', date: '2026-11-11', event: true })
    eq(r, { ok: false, error: gateLine('unrated', true) }, 'no ratings: refused, asking the organiser')
    ok(!touched.includes('rounds'), '  …and nothing is made')

    touched.length = 0
    ;(supabase as unknown as { from: unknown }).from = fake(18, [{ course_rating: 71, slope: 125, par: 72 }])
    r = await startPeriodCard({ tripId: 't', courseId: 'c', date: '2026-11-11' })
    eq(r, { ok: true, roundNumber: 4 }, 'a researched course starts its card as before')
  } finally {
    ;(supabase as unknown as { from: unknown }).from = real
  }
})()

// ─── The labels ────────────────────────────────────────────────

section('Labels, never pills (D69)')
{
  const select = read('app/components/CourseSelect.tsx')
  ok(!select.includes('Awaiting card') && !select.includes('AwaitingCard'), 'the picker no longer says Awaiting card')
  ok(select.includes('<CardStateLine blocker={listedBlocker(c)} />'), '  …it reads the counts, through CardStateLine')
  const line = read('app/components/CardStateLine.tsx')
  ok(line.includes('block t-cap text-ink/65 mt-1') && !/rust|Pill|rounded-full/.test(line.replace(/never rust/g, '')),
    'the line is a plain t-cap in ink/65, 4px under the name, never rust, never a pill')
  for (const f of [
    'app/golf/[root]/[tripCode]/scoring/page.tsx',
    'app/golf/[root]/[tripCode]/page.tsx',
    'app/golf/[root]/[tripCode]/KnockoutViews.tsx',
  ]) ok(read(f).includes('<CardStateLine'), `${path.basename(path.dirname(f))}/${path.basename(f)} draws the line`)
  for (const f of ['app/golf/[root]/[tripCode]/scoring/page.tsx', 'app/golf/[root]/[tripCode]/page.tsx']) {
    const src = read(f)
    ok((src.includes('select(CARD_COUNTS)') || src.includes('select(COURSE_CARD_COUNTS)')) && !src.includes("courses(name, location, holes(count)"),
      `${path.basename(path.dirname(f))}/${path.basename(f)} reads the counts in a query of its own, never in its main select`)
  }
  eq(blockersByCourse({ data: null, error: { message: 'refused' } }).size, 0, 'a refused counts read draws no lines')
  eq([...blockersByCourse({ data: [
    { course_id: 'a', courses: { holes: [{ count: 0 }], tees: [] } },
    { course_id: 'b', courses: { holes: [{ count: 18 }], tees: [{ course_rating: 70, slope: 120, par: 72 }] } },
  ], error: null })], [['a', 'none']], '  …and a good one marks only the blocked course')
  const courses = read('app/components/usePlatformCourses.ts')
  ok(courses.includes("'*, holes(count), tees(course_rating, slope, par)'"),
    'the picker\'s counts come with the list — no query per course')
}

section('Choosing is never refused')
{
  // The arrange screens, creation wizards, itinerary and venue pickers take
  // any course: none of them asks the gate.
  for (const f of [
    'app/golf/[root]/[tripCode]/match/[matchId]/MatchActions.tsx',
    'app/components/ItineraryBuilder.tsx',
    'app/dashboard/create/CreateTripForm.tsx',
    'app/dashboard/create/CreateLeagueForm.tsx',
    'app/golf/[root]/[tripCode]/scoring/AddRound.tsx',
  ]) ok(!read(f).includes('cardBlocker') && !read(f).includes('listedBlocker'), `${path.basename(f)} lets any course be chosen`)
}

behaviour.then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}, e => { console.error(e); process.exit(1) })
