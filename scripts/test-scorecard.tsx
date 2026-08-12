/**
 * Scorecard rendering tests. Run with: npm run test:scorecard
 *
 * The scoring module is the oldest code in the app and the least forgiving:
 * it is the only screen anybody uses standing on a tee, and a card that
 * renders wrongly there is a round lost. Restyling it is exactly the kind of
 * change that can look fine in a diff and be broken on grass.
 *
 * So two things are pinned here:
 *
 *   · every score shape, at every size, actually renders its number
 *   · the nett and no-return arithmetic is untouched, checked against the
 *     canonical rules in CLAUDE.md rather than against the code's own idea
 *     of itself
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import fs from 'fs'
import ScoreShape, { NoReturnShape } from '../app/components/ScoreShape'
import { ScorecardSheet } from '../app/trip/[tripCode]/leaderboard/TripLeaderboardClient'
import { roundTone, ROUND_TILE, ROUND_NOTE } from '../lib/roundState'
import { shotsReceived } from '../lib/handicap'

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
const read = (p: string) => fs.readFileSync(p, 'utf-8')

const shape = (gross: number, par: number, size: 'sm' | 'md' | 'lg' = 'md') =>
  renderToStaticMarkup(React.createElement(ScoreShape, { gross, par, size }))

// ─── The number always survives ────────────────────────────────

section('Every score still renders its number')
{
  // The whole point of a scorecard. A shape that swallowed its own number
  // would be worse than no shape at all.
  for (const par of [3, 4, 5]) {
    for (let gross = 1; gross <= par + 5; gross++) {
      const html = shape(gross, par)
      ok(html.includes(`>${gross}<`), `${gross} on a par ${par} shows the number`)
    }
  }
  for (const size of ['sm', 'md', 'lg'] as const) {
    ok(shape(4, 4, size).includes('>4<'), `and at size ${size}`)
  }
}

// ─── The marks themselves ──────────────────────────────────────

section('Under par is filled, over par is a quiet wash')
{
  const eagle  = shape(2, 4)
  const birdie = shape(3, 4)
  const par    = shape(4, 4)
  const bogey  = shape(5, 4)
  const double = shape(6, 4)

  // Filled, not outlined — the old card drew rings and boxes in thin strokes
  for (const [name, html] of Object.entries({ eagle, birdie, par, bogey, double })) {
    ok(!/\bborder\b/.test(html), `${name} has no outline`)
  }

  ok(eagle.includes('rounded-full') && eagle.includes('bg-accent-deep'),
    'an eagle is a solid deep emerald disc')
  ok(eagle.includes('text-white'), '  …with a white numeral, which reads on it')
  ok(birdie.includes('rounded-full') && birdie.includes('bg-accent/25'),
    'a birdie is a lighter emerald disc')

  // Level is the quietest thing on the card
  ok(!par.includes('bg-'), 'par is the bare number, with nothing behind it')

  ok(bogey.includes('bg-bark/[0.10]'), 'a bogey is a soft bark square')
  ok(double.includes('bg-bark/[0.20]'), 'and a double the same square, a shade stronger')
  ok(bogey.includes('rounded-lg') && double.includes('rounded-lg'), 'both are rounded')

  // Most amateur holes are one of these two, so they cannot shout
  const alpha = (h: string) => Number(h.match(/bg-bark\/\[([\d.]+)\]/)?.[1] ?? 1)
  ok(alpha(bogey) <= 0.15, 'a bogey sits under 15% — most holes are one')
  ok(alpha(double) > alpha(bogey), 'and a double is the heavier of the two')
  ok(alpha(double) <= 0.25, 'without becoming a block of colour')

  // Worse than a double keeps the same mark rather than escalating forever
  eq(shape(8, 4).includes('bg-bark/[0.20]'), true, 'a triple is marked as a double is')
}

section('A no return is not a score')
{
  const nr = renderToStaticMarkup(React.createElement(NoReturnShape, {}))
  ok(nr.includes('NR'), 'it says NR')
  ok(nr.includes('rust'), 'in the colour the app uses for a loss')
  ok(!/\d/.test(nr.replace(/[^>]*>/g, '')), 'and carries no number, because there is not one')
}

// ─── One shape, everywhere ─────────────────────────────────────

section('Every card in the app draws the same shape')
{
  const cards = [
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
    'app/scorecard/[playerId]/ScorecardClient.tsx',
  ]
  for (const f of cards) {
    ok(read(f).includes('ScoreShape'), `${f.split('/').pop()} uses the shared shape`)
  }

  // …and none of them still draws its own
  for (const f of cards) {
    ok(!/rounded-full border border-accent[\s\S]{0,80}inset-\[2px\]/.test(read(f)),
      `  …and ${f.split('/').pop()} no longer draws its own rings`)
  }
}

// ─── A card is read at arm's length ────────────────────────────

section('Every figure on a card is set from one size, and the shapes match it')
{
  // The figures were 15px, written by hand at a dozen call sites across two
  // cards, and too small for a phone held at arm's length in daylight. They
  // come from `SC_NUM` now — one constant, so the next move is one edit and
  // the two cards cannot drift apart.
  const style = read('app/components/scorecardStyle.ts')
  const num = Number(style.match(/SC_NUM\s*=\s*'text-\[(\d+)px\]'/)?.[1] ?? 0)
  ok(num >= 17, `a figure on a card is at least 17px (${num}px)`)

  // The score shape holds the gross score — the one number on the row that
  // matters most. Set it below the par beside it and the card reads upside
  // down, which is exactly what happened while the figures moved and the
  // shapes did not.
  const shapes = read('app/components/ScoreShape.tsx')
  const box = (size: string) =>
    Number(shapes.match(new RegExp(`${size}: 'w-\\d+ h-\\d+ text-\\[(\\d+)px\\]'`))?.[1] ?? 0)
  const [sm, md, lg] = ['sm', 'md', 'lg'].map(box)
  ok(sm > 0 && md > 0 && lg > 0, 'all three shape sizes are readable from the source')
  ok(sm < md && md < lg, 'and still step up in order')
  ok(md >= num, `the medium shape is not set below the figures around it (${md}px vs ${num}px)`)

  // Both cards go through the constant rather than writing the old size out.
  for (const f of [
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
  ]) {
    const src = read(f)
    ok(src.includes('SC_NUM'), `${f.split('/').pop()} sets its figures from SC_NUM`)
    // The details strip above the grid keeps its own size, so this is not a
    // ban on 15px in the file — only on it reappearing in the hole rows.
    ok(!/text-\[15px\] \$\{SC_MUTED\}/.test(src),
      `  …and none of its hole rows is back on a hand-written size`)
  }
}

// ─── The sticky header must not sit on the leader ──────────────

section('The column headings stay above the board')
{
  const src = read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')

  // position: sticky measures its offset from the nearest scroll container.
  // An ancestor with `overflow-x: auto` is one — on BOTH axes, which is the
  // trap — so `top: HEADER_H` would count from the card's own top edge
  // instead of the viewport's and drop the headings 52px down the card,
  // straight onto whoever was leading.
  const board = src.slice(src.indexOf('function Board('), src.indexOf('* The draw, as a chip'))

  ok(/<div className="bg-surface border border-bark\/12 rounded-2xl">/.test(board),
    'the board card is found')

  // Read the class attributes rather than the source. This used to be one
  // regex over the raw text, and a comment explaining *why* the card carries
  // no overflow was enough to fail it — prose about a rule is not a breach
  // of it.
  const classAttrs = [...board.matchAll(/className="([^"]*)"/g)].map(m => m[1])
  ok(classAttrs.some(c => /\brounded-2xl\b/.test(c)), 'the card rounds its corners')
  ok(!classAttrs.some(c => /rounded-2xl/.test(c) && /overflow/.test(c)),
    'and does not scroll or clip on its own, which would break the sticky offset')

  ok(/style=\{\{ top: HEADER_H \}\}/.test(board),
    'the headings still pin below the wordmark bar')
  ok(/className="sticky z-20/.test(board),
    'and are still sticky — above the rows\' own pinned columns')

  // This is the invariant, stated as a rule about the source rather than
  // about one arrangement of it: whatever the board is built from, nothing
  // between the card and the sticky headings may scroll sideways. The board
  // is now a single scroller with its ends pinned inside it — the very shape
  // this check used to forbid — and it is safe only because the headings sit
  // outside that scroller in one of their own.
  const beforeHeadings = board.slice(0, board.indexOf('style={{ top: HEADER_H }}'))
  ok(!/overflow-x-auto/.test(beforeHeadings),
    'nothing between the card and the headings scrolls sideways')

  // …and the headings' own scroller is inside them, not around them.
  const headings = board.slice(board.indexOf('style={{ top: HEADER_H }}'))
  ok(headings.indexOf('overflow-x-auto') > 0,
    'the headings carry a scroller of their own, which follows the table')
  ok(headings.indexOf('ref={head}') < headings.indexOf('ref={body}'),
    '  …and it is the one synced to the table below')
}

// ─── The card is the app's, not Donegal's ──────────────────────

section('Scorecards are brown and cream, not green')
{
  const cards = [
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
  ]
  for (const f of cards) {
    const src = read(f)
    const name = f.split('/').pop()
    // Emerald is the accent. A card that is half green stops it meaning
    // anything, and the summary bands were the biggest green on the screen.
    ok(!/rgba\(10,\s*157,\s*86/.test(src), `${name} has no emerald wash`)
    ok(!src.includes('0A6B3C'), `  …and no emerald text left over from the old card`)
    // …and nothing is pretending to be paper any more
    ok(!/#(EEE8D6|EAE4D5|E2DAC8|D4CBBA|F5F0E8|C9A84C)/i.test(src),
      `  …nor any parchment or gold`)
  }
  // The bands live in one place now, and all three cards read them from it —
  // they used to be three copies, two of them still Donegal gold.
  const style = read('app/components/scorecardStyle.ts')
  ok(/SC_BAND\s*=\s*'bg-bark\//.test(style), 'the summary bands are a wash of bark')
  ok(/SC_BAND_TOTAL\s*=\s*'bg-bark\//.test(style), 'and the total is a stronger one')

  const bandOf = (name: string) =>
    Number(style.match(new RegExp(`${name}\\s*=\\s*'bg-bark/\\[([\\d.]+)\\]`))?.[1] ?? 0)
  ok(bandOf('SC_BAND_TOTAL') > bandOf('SC_BAND'),
    'with the total the heavier of the two, so the eye lands there last')

  // Every card reads them rather than rolling its own
  for (const f of [
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/scoring/LiveScoringFlow.tsx',
  ]) {
    ok(read(f).includes("from \"@/app/components/scorecardStyle\"")
       || read(f).includes("from '@/app/components/scorecardStyle'"),
      `${f.split('/').pop()} takes its bands from the shared card style`)
  }

  // White base, alternating rows nudged towards the page's cream
  ok(/scRow/.test(style) && /bg-cream\//.test(style),
    'rows alternate white against a wash of cream')
}

// ─── The card is the app's card ────────────────────────────────

section('Scorecards are the same card as everywhere else')
{
  const cards = [
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/scoring/[slug]/CourseDashboardClient.tsx',
  ]
  for (const f of cards) {
    const src = read(f)
    const name = f.split('/').pop()
    // Donegal's 2px corners. Everything in this app is rounded-xl or -2xl.
    ok(!/\brounded-sm\b/.test(src), `${name} has no square Donegal corners`)
    // "No gradients. No glows." — one of these was a green halo on a live dot
    ok(!/shadow-\[0_0/.test(src), `  …and no glow`)
    // The serif is a token, not a font stack typed out by hand
    ok(!src.includes('Georgia'), `  …and names no font by hand`)
  }

  ok(read('app/scoring/LiveScoringFlow.tsx')
    .includes('rounded-2xl border border-bark/12 bg-surface'),
    'the scorecard is the same card as a settings section')
}

// ─── The maths the whole thing rests on ────────────────────────

section('Nett and no-return arithmetic is untouched')
{
  const flow = read('app/scoring/LiveScoringFlow.tsx')

  // Straight out of CLAUDE.md: shots = floor(hcp/18) + (1 if si <= hcp%18).
  // Checked by running it rather than by reading it — the formula lived in
  // five files and is now in one, and what matters is the answer.
  eq([1, 2, 18].map(si => shotsReceived(1, si)), [1, 0, 0],
    'a handicap of 1 receives its shot on the hardest hole and nowhere else')
  eq([1, 18].map(si => shotsReceived(18, si)), [1, 1], 'eighteen receives one everywhere')
  eq([1, 2, 18].map(si => shotsReceived(19, si)), [2, 1, 1], 'nineteen doubles up on SI 1')

  // A plus handicap gives them back, from the easiest hole down. This is the
  // mirror image and it was the case every copy of the formula got wrong.
  eq([1, 17, 18].map(si => shotsReceived(-1, si)), [0, 0, -1],
    'a plus one gives its shot back on the EASIEST hole, not on all of them')
  eq([1, 16, 17, 18].map(si => shotsReceived(-2, si)), [0, 0, -1, -1],
    'and a plus two on the two easiest')

  // points = max(0, par + 2 - nett)
  ok(flow.includes('Math.max(0, par + 2 - (gross - shotsReceived(hcp, si)))'),
    'stableford is still par + 2 - nett, floored at zero')

  // A no return is capped at the score that scores nothing — this is what
  // makes nett strokes work when somebody picks up
  ok(flow.includes('return par + 2 + shotsReceived(hcp, si)'),
    'a no return still counts as nett double bogey, which is what nett strokes need')

  // The call sites that decide which of the two is used
  ok(flow.includes('hs.isNR ? nrGross(p, si, setup.playingHcp) : hs.gross!'),
    'a picked-up hole is written as that capped gross, not as null')
  ok(flow.includes('stableford_points: hs.isNR ? 0 : calcStableford'),
    'and scores zero points, without disturbing the stroke total')
}

// ─── The team card, rendered ───────────────────────────────────

section('A team card keeps the holes in view however big the team')
{
  const holes = Array.from({ length: 18 }, (_, i) => ({
    id: `h${i + 1}`, hole_number: i + 1, par: 4,
    stroke_index: i + 1, course_id: 'c1',
  }))
  const round = { id: 'r1', round_number: 1, courses: { id: 'c1', name: 'Carne' } }

  const card = (n: number, opts: { pointsForFirstHole?: number; heroPoints?: number } = {}) => {
    const players = Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`, name: `Player${i + 1} Surname`, handicap: 10 + i, gender: 'M',
    }))
    const resolved = players.flatMap(p =>
      holes.slice(0, 9).map(h => ({
        playerId: p.id, roundId: 'r1', holeId: h.id, holeNumber: h.hole_number,
        gross: 5,
        // One player is given a different figure so the per-player points can
        // be told apart from the team's total on the row.
        points: p.id === 'p1' && opts.heroPoints != null
          ? opts.heroPoints
          : h.hole_number === 1 ? (opts.pointsForFirstHole ?? 2) : 2,
        noReturn: false, live: false,
      })))
    return renderToStaticMarkup(
      React.createElement(ScorecardSheet, {
        title: 'The Reds', subtitle: 'Carne', players, round, holes, resolved,
        // The board that opened this card decides the handicap it prints —
        // reduced by that board's allowance, and off the tee the round was
        // played, rather than whatever snapshot happens to sit in the table.
        handicapFor: (pid: string) =>
          players.find(p => p.id === pid)?.handicap ?? null,
        onClose: () => {},
      } as never)
    )
  }

  // ── Who contributed ──
  //
  // A team card shows a column of gross scores and one points figure for the
  // team, which says what the hole was worth but not who made it worth that.
  // On a better ball that is the whole question the card is opened to answer.
  {
    // p1 scores 4 a hole, everyone else 2. Nine holes each.
    const team = card(3, { heroPoints: 4 })
    ok(team.includes('title="4 points"'),
      'each player\'s own points are on the row beside their score')
    ok(team.includes('title="2 points"'), 'including the ones who did not carry it')
    ok(team.includes('title="36 points"'),
      'and the nine adds up per player as well as for the team — 9 × 4')
    ok(team.includes('title="18 points"'), 'against 9 × 2 for the others')

    // Raised and small, so the gross is still what the eye lands on. The
    // floor it sits on moved from 12px to 13 when the whole low end of the
    // scale went up — this is read outdoors, at arm's length, often without
    // the reading glasses that are still in the car.
    ok(/text-\[13px\][^"]*tabular-nums/.test(team),
      'set small, but on the floor rather than under it — this is read outdoors')
    ok(team.includes('items-start'), 'and raised beside the score rather than under it')

    // A nought is worth showing: a hole played for nothing is a fact about who
    // contributed, and the most useful one on the row.
    const blown = card(3, { heroPoints: 0 })
    ok(blown.includes('title="0 points"'), 'a hole played for nothing shows its nought')

    // One player has a points column of their own directly beside the score,
    // so the same number twice on one row would say nothing the second time.
    const solo = card(1)
    ok(!solo.includes('points"'), 'a single-player card does not repeat itself')
  }

  // Three fit; more than that and the columns have to start scrolling or the
  // holes get squeezed into nothing.
  const small = card(3)
  const big   = card(6)
  ok(!small.includes('scroll-strip'), 'a small team does not scroll — everything fits')
  ok(big.includes('scroll-strip'), 'a big one does')

  // Whatever the size, the two things you navigate by are outside the
  // scroller, so they cannot be scrolled away from
  for (const [label, html] of [['small', small], ['big', big]] as const) {
    const beforeStrip = html.slice(0, html.indexOf('scroll-strip') >= 0 ? html.indexOf('scroll-strip') : html.length)
    ok(beforeStrip.includes('Hole') && beforeStrip.includes('Par'),
      `${label}: hole and par come before the scrolling columns`)
  }
  ok(big.includes('Pts'), 'and the team total is still shown')

  // The member list is capped and scrolls rather than pushing the card down
  ok(big.includes('overflow-y-auto'), 'a long team list scrolls in a fixed space')
  ok(!small.includes('max-h-[3.25rem]'), 'a short one is not boxed in for no reason')

  // Every member is named with their handicap, so a column can be told apart
  for (const n of [1, 2, 3, 4, 5, 6]) {
    ok(big.includes(`Player${n}`), `Player${n} is named on the card`)
  }

  // A hole played for nothing is a nought, not a blank — a wiped-out hole is
  // exactly the one worth being able to see.
  // Bounded by where the next hole starts rather than by a character count.
  // It was the first 600 characters after hole 1, which is a guess about how
  // much markup a row is — and a guess that went out of date the moment the
  // card grew a stroke-index column, failing on a nought that was still
  // being printed. Hole 2's number is the first `>2<` in the card: row 1
  // holds a par of 4, an index of 1 and a gross of 5, and no 2 at all.
  const wiped = card(1, { pointsForFirstHole: 0 })
  const fromFirst = wiped.slice(wiped.indexOf('>1<'))
  const firstRow  = fromFirst.slice(0, fromFirst.indexOf('>2<'))
  ok(firstRow.length > 0, 'the first hole row can be found on its own')
  ok(/>0</.test(firstRow), 'a hole scored for no points prints a nought')
}

// ─── The stroke index on a card ────────────────────────────────

section('One player gets the stroke index; a team gives up the width instead')
{
  const holes = Array.from({ length: 18 }, (_, i) => ({
    id: `h${i + 1}`, hole_number: i + 1, par: 4, course_id: 'c1',
    stroke_index: i + 1,
    // Deliberately the reverse order, so a card reading the wrong one is
    // obvious rather than coincidentally right. A real ladies card is ranked
    // on its own, and it is never the men's order.
    stroke_index_ladies: 19 - (i + 1),
    par_ladies: 4,
  }))
  const round = { id: 'r1', round_number: 1, courses: { id: 'c1', name: 'Carne' } }

  const card = (n: number, gender = 'M') => renderToStaticMarkup(
    React.createElement(ScorecardSheet, {
      title: 'Alice Nolan', subtitle: 'Carne', round, holes, resolved: [],
      players: Array.from({ length: n }, (_, i) => ({
        id: `p${i + 1}`, name: `Player${i + 1} Surname`, handicap: 10, gender,
      })),
      handicapFor: () => 10,
      onClose: () => {},
    } as never)
  )

  const solo = card(1)
  ok(/>SI</.test(solo), 'a one-player card carries an SI column')

  // The whole reason it is there: where the shots fall is what makes a six
  // worth two points, and without it the points column is taken on trust.
  const siCells = (html: string) =>
    [...html.matchAll(/>(\d+)<\/span>/g)].map(m => m[1])
  ok(siCells(solo).includes('18'), 'and prints an index of 18 somewhere on it')

  // A team card is three columns of scores before it scrolls, and a fourth
  // fixed column takes the width they are already short of.
  for (const n of [2, 3, 6]) {
    ok(!/>SI</.test(card(n)), `a card for ${n} does not`)
  }

  // Off the same card the par came from. Taking the par from one set of
  // numbers and the index from the other puts the shots on the wrong holes,
  // which is a wrong points column rather than a cosmetic slip.
  const ladies = card(1, 'F')
  const firstRow = (html: string) => {
    const from = html.slice(html.indexOf('>1</span>'))
    return from.slice(0, from.indexOf('>2</span>'))
  }
  ok(/>18</.test(firstRow(ladies)),
    'a ladies card takes hole 1 off the ladies index — 18 here, not 1')
  ok(!/>18</.test(firstRow(solo)), 'and a mens card takes the mens')
}

// ─── Choosing a round ──────────────────────────────────────────

section('A round tile says what has happened on it')
{
  // Two screens offer a round to open — the scoring picker and the list that
  // drops out of a leaderboard row. Same question, so the same answer.
  eq(roundTone(false, false), 'empty', 'nothing scored is empty')
  eq(roundTone(true, false), 'played', 'scores in and nothing open is played')
  eq(roundTone(false, true), 'live', 'a card open is live')

  // A round can carry committed scores from the group that finished AND an
  // open card from the group still out. The open card is what matters.
  eq(roundTone(true, true), 'live', 'and an open card wins over scores already in')

  // All three are the app's white card; only the border changes
  for (const tone of ['empty', 'live', 'played'] as const) {
    ok(ROUND_TILE[tone].includes('bg-surface'), `a ${tone} round is a white card`)
  }

  // Empty is the quietest, played is a hard brown, live is the accent
  ok(/border-bark\/\[0\.08\]/.test(ROUND_TILE.empty), 'an empty round is barely outlined')
  ok(ROUND_TILE.played.includes('border-bark/45'), 'a played one is a hard brown edge')
  ok(ROUND_TILE.live.includes('border-accent'), 'and a live one is emerald')
  ok(!ROUND_TILE.empty.includes('border-2') , 'with the quiet one the thinnest of the three')

  // Both screens read the shared rule rather than rolling their own
  for (const f of [
    'app/trip/[tripCode]/scoring/page.tsx',
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
  ]) {
    ok(read(f).includes("from '@/lib/roundState'"),
      `${f.split('/').slice(-2).join('/')} reads the shared round states`)
    ok(read(f).includes('ROUND_TILE[tone]'), '  …and uses it for the tile')
  }

  // The picker judges by what is actually recorded, not by rounds.status —
  // that column is set by hand and drifts, and this is the screen someone
  // checks on the way to the first tee.
  const picker = read('app/trip/[tripCode]/scoring/page.tsx')
  ok(picker.includes("from('live_rounds')"), 'the picker asks which cards are open')
  ok(picker.includes("from('scores')"), '  …and which rounds have scores')
  ok(!/round\.status === /.test(picker), '  …rather than trusting rounds.status')

  ok(ROUND_NOTE.live === 'In play', 'and the live tile says so in words too')
}

// ─── Coming back to a card ─────────────────────────────────────

section('A scorecard survives being left and reopened')
{
  const flow = read('app/scoring/LiveScoringFlow.tsx')

  // The bug: the resume named `no_return`, which exists on `scores` but not
  // on `live_scores`. The select failed, `?? []` swallowed it, and every
  // resume opened a blank card on hole 1.
  const liveSelects = [...flow.matchAll(/from\("live_scores"\)[\s\S]{0,200}?\.select\("([^"]*)"/g)]
    .map(m => m[1])
  ok(liveSelects.length > 0, 'the flow reads live_scores')
  for (const cols of liveSelects) {
    ok(!cols.includes('no_return'),
      `live_scores is never asked for no_return — it has no such column (${cols.slice(0, 40)}…)`)
  }

  // The whole app, not just this file: one bad column name is what caused it
  for (const f of [
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/scoring/[slug]/CourseDashboardClient.tsx',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/scoring/page.tsx',
  ]) {
    const src = read(f)
    const selects = [...src.matchAll(/from\(["']live_scores["']\)[\s\S]{0,200}?\.select\(["']([^"']*)["']/g)]
    for (const m of selects) {
      ok(!m[1].includes('no_return'),
        `${f.split('/').pop()} does not ask live_scores for no_return`)
    }
  }

  // A read that fails must not fall through to a blank card — blank is
  // indistinguishable from "nothing played yet", and the next commit writes
  // that over the real round.
  // Scoped to the resume itself: another function reads `scores` (which does
  // have no_return) and guards it its own way — that one is not this bug.
  const resumeBody = flow.slice(flow.indexOf('async function doResume'),
                                flow.indexOf('async function lockPlayers'))
  ok(/error: scoresError/.test(resumeBody), 'a failed read is captured rather than ignored')
  ok(/setResumeError\(/.test(resumeBody), '  …and stops the resume')
  ok(!/\(existingScores \?\? \[\]\)/.test(resumeBody),
    '  …rather than falling through to an empty card')

  // Commit reconciles with what was saved before deciding what is an NR
  ok(/mergeSaved\(/.test(flow), 'commit merges the card with what was saved')
  ok(/anyScored\(/.test(flow), '  …and refuses an entirely blank one')
  ok(!/from\("scores"\)\s*\.delete\(\)/.test(flow.replace(/\s+/g, ' ')) ||
     !/Delete existing scores/.test(flow),
    'and no longer deletes the round\'s scores before rewriting them')

  // Every access point that can open a card has to restore it
  const dash = read('app/scoring/[slug]/CourseDashboardClient.tsx')
  ok(/autoResume=\{/.test(dash), 'the trip dashboard resumes an open card')
  const legacy = read('app/scoring/ScoringClient.tsx')
  ok(/autoResume=\{/.test(legacy),
    'and so does the route that offers to join a round in progress')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
