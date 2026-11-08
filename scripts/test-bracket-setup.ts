/**
 * Bracket setup tests. Run with: npm run test:bracket-setup
 *
 * Two halves. The rules in lib/bracketSetup.ts are checked directly — the
 * sizes and their rounds, what a deadline may be, which questions are still
 * open, and that storage round-trips whole or not at all. Then the wiring:
 * the form stands behind the organiser PIN and events-only check, the saved
 * column is never named in a page's main select, and every write is scoped
 * to its trip.
 */

import fs from 'fs'
import {
  BRACKET_MODES, PLAYER_ENTRIES, SEEDINGS, NO_DEADLINES_ANSWER,
  normalizeEventCode, validEventCode, validDeadline, deadlinesIssue, deadlineRoundNames, deadlineOpensAt,
  fitDeadlines, deadlinesAnswerFrom, deadlinesAnswerIssue, storedDeadlines, parseBracketSetup, describeSetup,
  isKnockoutEvent, knockoutSeed, knockoutBoards, drawDeadlines, deadlineNote, rawDrawPlan,
} from '../lib/bracketSetup'
import { hasMatchplay } from '../lib/leaderboards'
import { entryAllowed, entryCookie, publicPinIssue } from '../lib/publicPin'
import { DRAW_TIMINGS, newDraft } from '../lib/bracketDraw'
import { layoutFromSlots } from '../lib/bracketEditor'
import { creationPlan, creationDrawIssue, creationRounds } from '../app/dashboard/create/CreationDraw'
import { draftFromSlots, sameSlots } from '../lib/bracketDraw'
import { SWELL_GUTTER, SWELL_MAX_H, SWELL_MAX_W, swellBox, swellCard, swellFades } from '../lib/swell'

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

// ─── More settings ─────────────────────────────────────────────

section('More settings: the old answers, each with a default (Ross, 5 Nov 2026)')
{
  eq(BRACKET_MODES.map(m => m.key), ['relaxed', 'strict'], 'strict or relaxed, relaxed first')
  eq(PLAYER_ENTRIES.map(e => e.key), ['self_join', 'organiser'], 'players join themselves, or the organiser adds the field')
  eq(SEEDINGS.map(x => x.key), ['random', 'seeded'], 'a qualifier drawn at random, or seeded')
  ok([...BRACKET_MODES, ...PLAYER_ENTRIES, ...SEEDINGS].every(o => o.hint.length > 0), 'each says what it means')
}

section('A qualifying code is held to the shape every trip code has')
{
  eq(normalizeEventCode(' gx7k2p '), 'GX7K2P', 'upper-cased and de-spaced')
  eq(normalizeEventCode(null), '', 'null is empty, never a crash')
  ok(validEventCode('GX7K2P'), 'six alphanumerics pass')
  ok(!validEventCode('GX7K2'), 'five do not')
  ok(!validEventCode('GX7K2PP'), 'seven do not')
  ok(!validEventCode('GX-K2P'), 'punctuation does not')
  ok(!validEventCode(''), 'empty does not')
}

// ─── Deadlines ─────────────────────────────────────────────────

section('A deadline a round, once there is a bracket — never backwards (Ross, 5 Nov 2026)')
{
  ok(validDeadline('2026-11-14') && !validDeadline('2026-02-30') && !validDeadline('14/11/2026') && !validDeadline(null),
    'a deadline is a real date')
  eq(deadlineRoundNames(3), ['Quarter-Final', 'Semi-Final', 'Final'], 'named for the bracket\'s own rounds')
  eq(deadlinesIssue(['2026-11-14', '', '2026-12-12'], 3), 'Choose the Semi-Final\'s deadline.', 'every round needs one, said by name')
  eq(deadlinesIssue(['2026-11-14', '2026-11-01', '2026-12-12'], 3), 'The Semi-Final cannot close before the Quarter-Final.', '  …and none runs backwards')
  eq(deadlinesIssue(['2026-11-14', '2026-11-14', '2026-12-12'], 3), null, '  …two may share a date')
  eq([deadlineOpensAt(['2027-05-01', '', ''], 1, '2027-04-01'), deadlineOpensAt(['2027-05-01', '', ''], 2, '2027-04-01'), deadlineOpensAt([], 0, '2027-04-01')],
    ['2027-05-01', '2027-05-01', '2027-04-01'],
    'a round\'s calendar opens at the last deadline before it, the first at the event\'s start (Ross: set up months ahead)')
  eq(fitDeadlines(['2026-11-14', '2026-12-12'], 3), ['', '2026-11-14', '2026-12-12'], 'a bracket a round taller keeps the Final\'s date, the new first round empty')
  eq(deadlinesAnswerIssue(NO_DEADLINES_ANSWER, 3), 'Choose whether to set deadlines.', 'the question wants an answer')
  eq([deadlinesAnswerIssue({ on: false, dates: [] }, 3), storedDeadlines({ on: false, dates: ['2026-11-14'] }, 1)], [null, null], '  …no is an answer, and stores none')
  eq(storedDeadlines({ on: true, dates: ['2026-11-14', '2026-11-21'] }, 2), ['2026-11-14', '2026-11-21'], '  …yes stores a date a round')
  eq(deadlinesAnswerFrom(['2026-11-14']), { on: true, dates: ['2026-11-14'] }, '  …and reads back as yes')
}

// ─── Storage ───────────────────────────────────────────────────

section('A match play event is a whole setup from the start, unanswered questions at their defaults')
{
  eq(parseBracketSetup(knockoutSeed('standalone')), { format: 'match_play', mode: 'relaxed', entry: 'self_join', finalized: false },
    'the seed creation writes reads as relaxed, players joining, nothing locked')
  eq(parseBracketSetup(knockoutSeed('continuous', null, ['2027-05-31', '2027-06-30']))?.deadlines, ['2027-05-31', '2027-06-30'],
    '  …its deadlines carried')
  const old = { format: 'match_play', mode: 'strict', size: 32, entry: 'organiser', deadlines: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], finalized: true,
    qualifying: { eventCode: 'qx7k2p', seeding: 'seeded' } }
  eq(parseBracketSetup(old), { format: 'match_play', mode: 'strict', entry: 'organiser', qualifying: { eventCode: 'QX7K2P', seeding: 'seeded' },
    deadlines: old.deadlines, finalized: true }, 'a setup saved by the old form reads back, its field cap gone')
  eq(parseBracketSetup({ format: 'match_play', mode: 'odd', deadlines: ['2026-11-02', '2026-11-01'], qualifying: { eventCode: 'x' } }),
    { format: 'match_play', mode: 'relaxed', entry: 'self_join', finalized: false }, 'an answer that does not read drops to its default — the setup is never refused')
  eq([parseBracketSetup({ format: 'league' }), parseBracketSetup(null), parseBracketSetup([])], [null, null, null], 'a league, nothing or nonsense is no match play setup')
  eq(describeSetup(parseBracketSetup(old)!), 'Strict · deadlines set · seeded off QX7K2P · locked in', 'said in one line on the organiser card')
  eq(describeSetup(parseBracketSetup(knockoutSeed('continuous'))!), 'Ongoing · Relaxed · no deadlines · open', '  …a fresh one too')
}

// ─── The bracket flow ──────────────────────────────────────────

section('The bracket in the organiser area is creation\'s own flow (Ross, 5 Nov 2026)')
{
  const page = read('app/golf/[root]/[tripCode]/organiser/bracket/page.tsx')
  ok(page.includes('PasscodeGate') && page.includes('isEvent') && page.includes('<BracketFlow'), 'behind the organiser PIN, events only, the one flow')
  const mainSelect = page.match(/select\('id, trip_code[^']*'\)/)?.[0] ?? ''
  ok(!mainSelect.includes('bracket_setup') && page.includes("select('bracket_setup')"),
    'the setup rides in its own query, never the trip\'s select')
  ok(page.includes(".eq('trip_id', trip.id)") && page.includes("rows.filter(m => m.round_number === 1)"),
    '  …and the draw made is read back, this event\'s alone, as its first round')
  const flow = read('app/golf/[root]/[tripCode]/organiser/bracket/BracketFlow.tsx')
  ok(flow.includes('<DrawPlanner') && flow.includes('<RoundDeadlines') && flow.includes("'More settings'"),
    'Plan the draw, the deadlines, then More settings')
  ok(flow.includes("['draw', ...(rounds > 0 ? ['deadlines' as const] : []), 'more']"),
    '  …the deadlines only once there is a bracket (Ross: "no need to ask for dates if the user hasn\'t yet made a bracket")')
  ok(flow.includes('draftFromSlots(existing.slots, existing.seeds, field)') && flow.includes('!sameSlots(slots, existing.slots)'),
    '  …the draw made opens in the bracket to change, and is only made again when it changed')
  ok(flow.includes('saveBracketSetup(supabase, tripId') && flow.includes('writeDraw(supabase, tripId'), '  …saved through the one writers')
  ok(!flow.includes('BRACKET_SIZES') && !flow.includes('size'), '  …and no field cap: the bracket\'s own rounds decide (Ross)')
  const store = read('lib/drawStore.ts')
  ok(/saveBracketSetup[\s\S]*select\('bracket_setup'\)\.eq\('id', tripId\)[\s\S]*update\(\{ bracket_setup: base \}\)\.eq\('id', tripId\)/.test(store),
    'the setup is merged into the column read fresh, scoped to its event')
  const organiser = read('app/golf/[root]/[tripCode]/organiser/OrganiserClient.tsx')
  ok(organiser.includes('/organiser/bracket') && !organiser.includes('/organiser/draw') && organiser.includes("isLeague ? 'League' : 'Bracket'"),
    'the organiser area has one Bracket row, the draw inside it')
  ok(read('app/golf/[root]/[tripCode]/organiser/draw/page.tsx').includes('redirect(`${tripHome}/organiser/bracket`)'), '  …an old draw link lands in it')
  ok(!fs.existsSync('app/golf/[root]/[tripCode]/organiser/bracket/BracketSetupForm.tsx'), '  …and the seven-question form is gone')
  const migration = read('supabase/migrations/20260101000047_bracket_setup.sql')
  ok(migration.includes('ADD COLUMN IF NOT EXISTS bracket_setup jsonb'), 'migration 047 adds the one jsonb column, idempotently')

  // A draw read back into the bracket.
  const field = ['a', 'b', 'c', 'd', 'e']
  const back = draftFromSlots(['a', null, 'd', 'e', 'b', null, 'c', null], [1, null, 4, 5, 2, null, 3, null], field)
  eq([back.method, back.order, back.locked, back.edited], ['seeded', ['a', 'b', 'c', 'd', 'e'], true, true],
    'a seeded draw comes back seeded, in its order, locked where it keeps to the best spread')
  ok(sameSlots(['a', null], ['a', null]) && !sameSlots(['a', null], [null, 'a']), '  …and is only the same draw place for place')
  for (const form of ['CreateKnockoutForm', 'CreateTripForm']) {
    const src = read(`app/dashboard/create/${form}.tsx`)
    ok(src.includes('<RoundDeadlines') && src.includes('creationRounds(draw, drawEntrants)') && src.includes('storedDeadlines(deadlines, bracketRounds)'),
      `${form}: creation asks the same deadlines after the draw, when it makes a bracket, and stores them with the event`)
  }
  const ents = [{ id: 'a', name: 'A', handicap: 1 }, { id: 'b', name: 'B', handicap: 2 }, { id: 'c', name: 'C', handicap: 3 }]
  const later = { timing: { when: 'later' as const, on: '', at: '20:00', seeding: 'random' as const }, draft: newDraft(['a', 'b', 'c']) }
  eq([creationRounds(later, ents), creationRounds({ ...later, timing: { ...later.timing, when: 'now' } }, ents)], [0, 2],
    '  …none while the draw is still to be allocated; the bracket\'s rounds once it is made')
}

section('A match play event is a knockout from the moment it is made')
{
  ok(isKnockoutEvent(knockoutSeed('standalone')) && isKnockoutEvent(knockoutSeed('continuous')),
    'both seeds read as a knockout — the parser refuses them, this does not need it to')
  eq(knockoutSeed('continuous'), { format: 'match_play', schedule: 'continuous' }, 'ongoing carries its shape')
  eq(knockoutSeed('standalone'), { format: 'match_play' }, 'one-off is the absent default')
  eq(knockoutSeed('continuous', { when: 'date', on: '2026-11-14', seeding: 'handicap' }),
    { format: 'match_play', schedule: 'continuous', draw: { when: 'date', on: '2026-11-14', seeding: 'handicap' } },
    'and a draw planned at creation rides in the seed')
  eq(rawDrawPlan(knockoutSeed('standalone', { when: 'later' })), { when: 'later' }, '  …read back off the raw column, before the setup is complete')
  ok(!isKnockoutEvent({ format: 'league', entry: 'organiser' }) && !isKnockoutEvent(null) && !isKnockoutEvent([]),
    'a league, nothing, or nonsense is not')
  const [board] = knockoutBoards()
  ok(board.competition === 'matchplay' && hasMatchplay(knockoutBoards()), 'it is made with the bracket\'s board')

  eq(drawDeadlines(['2026-11-14', '2026-12-12', '2027-01-16', '2027-02-13', '2027-03-13'], 4),
    ['2026-12-12', '2027-01-16', '2027-02-13', '2027-03-13'],
    'a setup for 32 over a draw of 16: lined up from the Final backwards')
  eq(drawDeadlines(['2026-11-14', '2026-12-12'], 3), [null, '2026-11-14', '2026-12-12'],
    'a draw taller than its dates: the early round has none')
  eq(drawDeadlines([], 3), [null, null, null], 'no dates set: nothing to show')

  eq(deadlineNote('2026-11-14', 'Sat 14 Nov', { today: '2026-11-01', finished: false }), 'Play by Sat 14 Nov', 'ahead of the date')
  eq(deadlineNote('2026-11-14', 'Sat 14 Nov', { today: '2026-11-14', finished: false }), 'Play by Sat 14 Nov', '  …on the day itself')
  eq(deadlineNote('2026-11-14', 'Sat 14 Nov', { today: '2026-11-15', finished: false }), 'Was due Sat 14 Nov', 'past it, a match still open')
  eq(deadlineNote('2026-11-14', 'Sat 14 Nov', { today: '2026-11-15', finished: true }), 'Played by Sat 14 Nov', 'a finished round says only its date')

  const bracket = read('app/golf/[root]/[tripCode]/matchplay/MatchplayBracket.tsx')
  ok(bracket.includes('leftDeadlineNote') && !bracket.includes('aria-label="Dates each round is played by"'),
    'a round\'s play-by date sits under its name — no row of round chips across the top')
  const page = read('app/golf/[root]/[tripCode]/matchplay/page.tsx')
  ok(page.includes("from('trips').select('bracket_setup, kind, settings_passcode_hash').eq('id', trip.id).maybeSingle()"),
    '  …read in their own fail-soft query, never the trip\'s select')
  ok(page.includes('drawDeadlines(parseBracketSetup(rawSetup)?.deadlines ?? [], drawnRounds)'),
    '  …lined up with the rounds actually drawn')
  const board2 = read('app/golf/[root]/[tripCode]/leaderboard/page.tsx')
  ok(board2.includes('isKnockoutEvent(') && board2.includes('redirect(`${tripHome}/matchplay`)'),
    'a match play event\'s leaderboard tab is the bracket')
  ok(board2.includes("own.every(lb => lb.competition === 'matchplay' || isMatchTally(lb))"),
    '  …unless the organiser added a board beside it — a tags tally lives under the bracket, so it is not one')
  ok(read('app/components/TabBar.tsx').includes('pathname.startsWith(`${base}/matchplay`)) return \'leaderboard\''),
    'and the tab stays lit on the bracket')
}

section('A match play event reads from the player\'s side: the hub\'s card, the Scoring tab\'s portal, a match\'s page')
{
  const hub = read('app/golf/[root]/[tripCode]/page.tsx')
  ok(hub.includes('isKnockoutEvent(') && hub.includes('<NextMatchCard'), 'the hub carries the next-match card on a match play event')
  ok(hub.includes("nextMatch: koView ? '' : nextMatchLine"), '  …in place of the one-line caption, which a trip keeps')
  const scoring = read('app/golf/[root]/[tripCode]/scoring/page.tsx')
  ok(scoring.includes('<KnockoutPortal') && scoring.includes('const knockout = event && isKnockoutEvent('),
    'the Scoring tab is the bracket\'s portal on a match play event')
  const views = read('app/golf/[root]/[tripCode]/KnockoutViews.tsx')
  ok(views.includes("cardClass('chosen', true)") && views.includes('opacity-60'),
    '  …your own match active and the rest listed, inactive')
  ok(views.includes('href={matchHref(tripHome, m.id)}') && !/m\.mine \? \(\s*<Link[\s\S]*?\) : \(\s*<Link/.test(views),
    '  …and only your own opens')
  const helper = read('app/golf/[root]/[tripCode]/knockout.ts')
  ok(helper.includes("teamFor(memberships, meId, setOf(draw)"), 'a pairs draw\'s entrant is the pairing on the draw\'s own sheet')
  ok(helper.includes("drawDeadlines(parseBracketSetup(rawSetup)?.deadlines ?? [], drawnRounds)"), 'every view lines the deadlines up the same way')
  const match = read('app/golf/[root]/[tripCode]/match/[matchId]/page.tsx')
  ok(match.includes('<MyHandicap') && match.includes("me.claimed === true"), 'a claimed player in the match amends their own handicap there')
  const mine = read('app/golf/[root]/[tripCode]/match/[matchId]/MyHandicap.tsx')
  ok(mine.includes(".eq('id', playerId).eq('trip_id', tripId)") && mine.includes('syncRoundHandicaps('),
    '  …written where Trip Setup writes it, scoped to the trip')
}

section('Arranging a match: venue, tees, shots, contacts, a walkover — and the PIN on a result already in')
{
  const sql = read('supabase/migrations/20260101000057_match_arrangements.sql')
  ok(/ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES courses\(id\) ON DELETE SET NULL/.test(sql)
    && sql.includes('ADD COLUMN IF NOT EXISTS played_on date') && sql.includes('ADD COLUMN IF NOT EXISTS tees jsonb'),
    'migration 057 gives a match its venue, day and tees')
  ok(sql.includes('ADD COLUMN IF NOT EXISTS home_course_id uuid'), '  …a player their home club')
  ok(sql.includes('ALTER TABLE player_contacts ENABLE ROW LEVEL SECURITY')
    && sql.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_contacts TO service_role')
    && !/TO anon/.test(sql),
    '  …and contact details in a table closed to the browser, the server\'s grant only')

  const match = read('app/golf/[root]/[tripCode]/match/[matchId]/page.tsx')
  ok(match.includes("select('course_id, played_on, tees')") && match.includes('const arrangeable = !arrangedRes.error'),
    'the match page reads the arrangement in its own fail-soft query')
  ok(match.includes('matchStrokes(') && match.includes('allowanceOf(draw)') && match.includes('shotHoles('),
    '  …works out the shots off each tee at the draw\'s allowance, hole by hole')
  ok(match.includes('contactShown(c, {'), '  …shows contact details only as each player said')
  ok(match.includes('walkoverChoices(match, view.entrantId, false)') && match.includes('<MatchWalkover'),
    '  …and offers the walkover')
  const actions = read('app/golf/[root]/[tripCode]/match/[matchId]/MatchActions.tsx')
  ok(actions.includes(".eq('id', matchId).eq('trip_id', tripId)"), 'arranging writes the one match, scoped to the event')
  ok(actions.includes('persistWinner(all, matchId, winnerId, WALKOVER)'), 'a walkover goes through the bracket\'s own writer, cascade and all')
  ok(actions.includes("if (!organiser && !conceding) { setError('Awarding a walkover needs the admin PIN.')"),
    '  …a player may only concede; awarding is the organiser\'s')

  const route = read('app/api/match/contact/route.ts')
  ok(route.includes('readPlayerId(jar.get(playerCookieName(tripCode))?.value)') && route.includes(".eq('trip_id', trip.id)"),
    'contact details are saved only for the player this phone claimed')
  const reader = read('app/golf/[root]/[tripCode]/matchContacts.ts')
  ok(reader.includes('createAdminClient()') && reader.includes(".eq('trip_id', tripId)"), '  …and read on the server, scoped to the event')
  ok(!/from '@\/lib\/supabase-admin'|matchContacts/.test(read('app/golf/[root]/[tripCode]/MatchDetails.tsx')),
    '  …never from the browser')
  ok(read('app/golf/[root]/[tripCode]/page.tsx').includes('<MatchDetails'), 'the hub carries your home club and contact')

  const bracket = read('app/golf/[root]/[tripCode]/matchplay/MatchplayBracket.tsx')
  ok(bracket.includes('pin={sheet.correcting && lock && !unlocked ? lock : null}'),
    'on an event, a result already in is changed only with the admin PIN')
  const mpage = read('app/golf/[root]/[tripCode]/matchplay/page.tsx')
  ok(mpage.includes('isEvent(setupRow?.kind) && setupRow?.settings_passcode_hash'), '  …a trip\'s bracket stays open')
}

section('The match play card: top of the draw left, bottom right, NR, the result into the bracket')
{
  const sql = read('supabase/migrations/20260101000058_match_cards.sql')
  ok(sql.includes('PRIMARY KEY (match_id, player_id, hole_number)') && sql.includes('PRIMARY KEY (match_id, hole_number)'),
    'migration 058: a score a player a hole, a concession a hole — two phones interleave, never clobber')
  ok(sql.includes("CHECK (conceded_by IN ('A', 'B'))"), '  …a concession says which side gave it')
  const client = read('app/golf/[root]/[tripCode]/match/[matchId]/card/MatchCardClient.tsx')
  ok(/sideColumn\('A', a\)\}\s*\{sideColumn\('B', b\)/.test(client), 'the top of the draw on the left, the bottom on the right')
  ok(!client.includes('Concede hole') && client.includes('setGross(p.id, current, isNR ? undefined : null)'),
    'no concede button: each player has NR, saved as a score with no gross (migration 062)')
  ok(read('supabase/migrations/20260101000062_match_no_return.sql').includes('ALTER COLUMN gross DROP NOT NULL'),
    '  …which migration 062 lets the card keep')
  ok(client.includes('const nettPar = h.par + shots') && client.includes('value === null ? nettPar'),
    'the first tap of − or + lands on two points, nett par, as on a trip')
  ok(client.includes('aria-label="Previous hole"') && client.includes("'Next hole'") && !client.includes('grid-cols-9'),
    'previous and next move between holes — no grid of numbered holes')
  ok(client.includes('backgroundColor: holeFill(o, isNow)'), 'the strip marks each hole in the colour of the side that won it')
  ok(client.includes('usePoll(load, 15_000, true)') && !client.includes('setInterval'), 'the other phone shows up, through the one poller')
  const finishSheet = read('app/golf/[root]/[tripCode]/match/[matchId]/card/MatchFinish.tsx')
  ok(client.includes("finish?.phase ?? (asking && awaitingFinal ? 'confirm' : null)")
    && client.includes("{finaliseHere ? 'Finalise match' : '→'}"),
    'the end of a match never interrupts scoring — the next button becomes Finalise match on the hole that settles it')
  ok(client.includes('const awaitingFinal = loaded && canEdit && shouldWrite(state, winnerId, stored, false)')
    && !client.includes('writeResult()\n  }, [loaded'),
    'a settled card asks before its result goes into an empty match — never by itself')
  ok(finishSheet.includes('Yes — finalise the match') && finishSheet.includes('No — go back and amend the scores')
    && finishSheet.includes('Keep scoring — play out the 18'),
    '  …the sheet showing the last score and asking whether it is right')
  const scorecard = read('app/golf/[root]/[tripCode]/match/[matchId]/card/MatchScorecard.tsx')
  ok(finishSheet.includes('<MatchScoresTable') && scorecard.includes('aria-label="Scores hole by hole"')
    && scorecard.includes('backgroundColor: fillOf(o)'),
    '  …then the card hole by hole, each marked in the colour of whoever won it')
  ok(client.includes("<MatchScoresTable a={a} b={b}") && client.includes("showPanel(panel === 'card' ? 'scorecard' : 'card')")
    && client.includes("translateX(-50%)"),
    'the same card, live, a slide away from the score — anybody may look')
  ok(client.includes('persistWinner(all, matchId, winnerId as string, state.result)'), '  …through the bracket\'s own writer')
  ok(client.includes('const canEdit = !decided && (organiser || inMatch || anyoneScores)'),
    'anybody scores an open match unless kept to its players; once it is in, nobody — it is reopened first')
  ok(read('app/golf/[root]/[tripCode]/match/[matchId]/card/page.tsx').includes("'score_matches'"),
    '  …the page asking the event\'s permission')
  ok(client.includes("await persistWinner(all, matchId, null, null)") && client.includes('reopenBlocked(next.round_name')
    && client.includes('decided && organiser'),
    '  …the organiser reopens it with the PIN, taking it out of the draw, unless the match it fed has begun')
  const page = read('app/golf/[root]/[tripCode]/match/[matchId]/card/page.tsx')
  const cards = read('app/golf/[root]/[tripCode]/match/matchCards.ts')
  ok(page.includes('readCardSetups(') && cards.includes('matchStrokes(') && page.includes("Arrange the match first"),
    'the card takes its shots from the arrangement, or sends you to arrange it')
  ok(client.includes('playCard(') && client.includes('Extra holes'), 'level after 18 the card grows extra holes')
  ok(client.includes('<select') && client.includes('value={extraCourseHole(current, plan)}')
    && /update\(\{ extra_holes: next \}\)\.eq\('id', matchId\)\.eq\('trip_id', tripId\)/.test(client),
    '  …each with a dropdown for the hole it is played off, saved for both phones')
  ok(read('app/golf/[root]/[tripCode]/match/matchCards.ts').includes(".select('id, extra_holes')"),
    '  …read in its own query, so a database without migration 061 keeps the card\'s shots')

  // The live board: the Scoring tab reads every open match's card through the
  // same setup the card page draws from, so the two cannot disagree.
  ok(cards.includes('export async function readLiveMatches') && /readCardSetups\(trip, view, players, started\)/.test(cards),
    'live matches are read off their cards through the card\'s own setup')
  const scoringPage = read('app/golf/[root]/[tripCode]/scoring/page.tsx')
  ok(scoringPage.includes('readLiveMatches(trip, view, roster)') && scoringPage.includes('live={knockoutRead?.live ?? []}'),
    'the Scoring tab hands the portal its live matches')
  const views = read('app/golf/[root]/[tripCode]/KnockoutViews.tsx')
  ok(views.includes('<LiveBoard') && views.includes('dot-live') && !views.includes('setInterval'),
    'the portal draws a live board, refreshed through the one poller')
  ok(read('app/golf/[root]/[tripCode]/match/[matchId]/page.tsx').includes("'Score this match'"), 'the match page opens the card')
}

// ─── The draw ──────────────────────────────────────────────────

section('The place swell: a card on top, back into the place with nothing showing (Ross, 6 Nov 2026)')
{
  const view = { width: 390, height: 844, top: 0, left: 0, insetTop: 0, insetBottom: 0 }
  const place = { left: 17, top: 400, width: 130, height: 37 }
  const card = swellCard(place, view, 300)
  ok(card.width === Math.min(SWELL_MAX_W, 390 - 2 * SWELL_GUTTER) && card.height === 300, 'as wide as the screen allows, as tall as what it holds')
  ok(card.left === SWELL_GUTTER && Math.abs(card.top + card.height / 2 - (place.top + place.height / 2)) < 0.01,
    'centred on the place it grew from, kept inside the gutter')
  ok(swellCard(place, view, 2000).height === SWELL_MAX_H, 'a long list is capped and scrolls inside the card')
  const low = swellCard({ left: 200, top: 800, width: 130, height: 37 }, view, 400)
  ok(low.top + low.height <= 844 - SWELL_GUTTER && low.left + low.width <= 390 - SWELL_GUTTER, 'a place at the foot of the screen: the card kept on it')
  const keyboard = swellCard(place, { ...view, height: 480 }, 520)
  ok(keyboard.top >= SWELL_GUTTER && keyboard.top + keyboard.height <= 480 - SWELL_GUTTER, 'a keyboard up: moved and shortened to the part that can be seen')
  const notch = swellCard({ ...place, top: 20 }, { ...view, insetTop: 47 }, 300)
  ok(notch.top >= 47 + 8, 'clear of the notch')
  ok(JSON.stringify(swellBox(place, card, 0)) === JSON.stringify(place) && JSON.stringify(swellBox(place, card, 1)) === JSON.stringify(card),
    'the box starts on the place and ends on the card')
  ok(swellFades(0).box === 0 && swellFades(0).content === 0 && swellFades(1).box === 1 && swellFades(1).content === 1, 'nothing at the place, everything on the card')
  let wordsWhileSmall = false
  for (let t = 0; t <= 0.5; t += 0.01) if (swellFades(t).content > 0) wordsWhileSmall = true
  ok(!wordsWhileSmall, 'no words in the box for the last half of its way back — the frames of text at the end are gone')
  ok(swellFades(0.1).box < 1 && swellFades(0.2).box === 1, 'the box melts into the place as it lands')
}

section('The draw: made at creation, from the organiser area, or by itself on a date')
{
  const drawer = read('app/components/BracketDrawer.tsx')
  ok(drawer.includes('DRAW_METHODS.map') && drawer.includes('Draw again'), 'random, seeded or by hand, a random draw drawn again')
  ok(drawer.includes('moveToSeed(order, typing.id, n)') && drawer.includes('onPointerDown') && drawer.includes('By handicap') && drawer.includes('Shuffle'),
    'seeded: type a number, drag the handle, start from handicap order or shuffle')
  ok(drawer.includes('<BracketBoard') && drawer.includes('placedInDraft(value, picking.r, picking.c, id, field.length)') && drawer.includes("'Who goes here?'"),
    'the bracket itself: any place tapped and given a player (Ross, 5 Nov 2026)')
  ok(!drawer.includes('SEARCH_FROM') && /<input\s+type="search"/.test(drawer) && drawer.includes("placeholder=\"Search the field\""),
    '  …with a search bar at the head of the names whatever the field (Ross, 6 Nov 2026)')
  ok(drawer.includes('swellCard(start, view(), natural.current)') && drawer.includes('<Swell fill from={seeding.from}') && !/<Swell from=\{picking\.from\}[^>]*fill/.test(drawer),
    '  …the place swelling into a card on top, the seed list into the whole screen')
  ok(drawer.includes('onClick={closing ? undefined : onClose}') && drawer.includes('bg-ink/40'), '  …a tap outside the card shrinks it back')
  ok(drawer.includes('i.style.opacity = String(shows.content)') && drawer.includes('s.style.opacity = String(shows.box)'),
    '  …its words fading before it lands, the box melting into the place')
  ok(drawer.includes('withRounds(value, -1, field.length)') && drawer.includes('withRounds(value, 1, field.length)'), '  …and a round fewer or more beside its count')
  ok(drawer.includes('putt(x)') && drawer.includes('reducedMotion()') && drawer.includes('const SWELL_MS = 340'),
    '  …the place swelling into the names on the putt curve, simply there under Reduce Motion')
  const creation = read('app/dashboard/create/CreationDraw.tsx')
  ok(creation.includes('writeCreationDraw') && creation.includes('idFor.get(key)'), 'a draw made at creation names the players by the ids the form gives them')
  for (const form of ['CreateKnockoutForm', 'CreateTripForm']) {
    const src = read(`app/dashboard/create/${form}.tsx`)
    ok(src.includes('<CreationDraw') && src.includes('id: idFor.get(drawKey(p.name))') && src.includes('writeCreationDraw(supabase'),
      `${form} offers the draw and makes it with the event when asked`)
  }
  const store = read('lib/drawStore.ts')
  ok(store.includes('if (state.inPlay)') && store.includes('bracketFromSlots(slots'), 'one writer, which refuses a draw already in play')
  ok(/saveDrawPlan[\s\S]*select\('bracket_setup'\)[\s\S]*\.\.\.\(raw/.test(store), 'a plan is merged into the setup read fresh, never written from a stale copy')
  const cleanup = read('app/api/cleanup/route.ts')
  ok(cleanup.includes('runDueDraws(supabaseAdmin, new Date(), dryRun)'), 'the nightly job makes the draws whose moment has come')
  const due = read('app/api/match/dueDraws.ts')
  ok(due.includes('drawDue(plan, now, state.drawn)') && due.includes('writeDraw(admin'), '  …only where nothing is drawn yet, through the one writer')
  ok(due.includes("q.is('bracket_setup->draw->>claimedAt', null)") && due.includes('await releaseClaim(admin, trip.id, now)'),
    '  …once: a visit takes the job before drawing, and gives it back if the draw fails')
  ok(read('app/api/match/draw-due/route.ts').includes('makeDueDraw(admin, trip, new Date(), false)'),
    'the first visit after the moment makes it, through the same function (Ross, 5 Nov 2026)')
  ok(read('app/golf/[root]/[tripCode]/organiser/bracket/BracketFlow.tsx').includes('The draw is in play'), 'once in play, the flow says so rather than offering a redraw')
}

section('When the draw happens — one screen, and a moment it goes live (Ross, 5 Nov 2026)')
{
  eq(DRAW_TIMINGS.map(t => [t.label, t.hint]), [
    ['Draw now', 'Use the current field.'],
    ['Draw later', 'Allows time for more players to enter.'],
    ['Set date', 'A pre-made draw or random allocation will go live at a time of your choosing.'],
  ], 'the three answers, in his words')
  const entrants = [{ id: 'ross', name: 'Ross', handicap: 10 }, { id: 'kate', name: 'Kate', handicap: 18 }, { id: 'dave', name: 'Dave', handicap: 4 }]
  const ids = new Map([['ross', 'p1'], ['kate', 'p2'], ['dave', 'p3']])
  const premade = {
    timing: { when: 'date' as const, on: '2026-12-01', at: '20:00', seeding: 'premade' as const },
    draft: { ...newDraft(['ross', 'kate', 'dave']), edited: true, layout: layoutFromSlots(['ross', null, 'kate', 'dave']) },
  }
  eq(creationPlan(premade, entrants, ids), { when: 'date', on: '2026-12-01', at: '20:00', seeding: 'premade', slots: ['p1', null, 'p2', 'p3'] },
    'a pre-made draw is stored with its plan, place by place by the ids the players are given, until it goes live')
  eq(creationPlan({ ...premade, timing: { ...premade.timing, seeding: 'random' } }, entrants, ids), { when: 'date', on: '2026-12-01', at: '20:00', seeding: 'random' },
    '  …a random allocation keeps only its moment')
  eq(creationDrawIssue({ ...premade, timing: { ...premade.timing, at: '' } }, entrants, '2026-11-05'), 'Choose the time it goes live.',
    '  …and a date asks the time it goes live')
  const planner = read('app/components/DrawPlanner.tsx')
  ok(read('app/dashboard/create/CreationDraw.tsx').includes('export default DrawPlanner')
    && read('app/golf/[root]/[tripCode]/organiser/bracket/BracketFlow.tsx').includes('<DrawPlanner')
    && planner.includes('buildsNow(value.timing)'),
    'creation and the organiser area are one draw screen, the draw built on it now or pre-made for its date')
  const hub = read('app/golf/[root]/[tripCode]/page.tsx')
  const bracket = read('app/golf/[root]/[tripCode]/matchplay/page.tsx')
  ok(hub.includes('<DrawCountdown') && hub.includes('koView.view.matches.length === 0') && bracket.includes('<DrawCountdown'),
    'the home screen and the bracket count down to it while it is to come')
  const countdown = read('app/golf/[root]/[tripCode]/DrawCountdown.tsx')
  ok(countdown.includes("fetch('/api/match/draw-due'") && countdown.includes('router.refresh()'),
    '  …and at nought ask for it to be made, and show it')
}

// ─── The public PIN ────────────────────────────────────────────

section('The public PIN: entry to the event, beside the admin PIN')
{
  eq(entryAllowed(null, undefined), true, 'no public PIN: open to anybody with the code, as ever')
  eq(entryAllowed('', undefined), true, '  …an empty one too')
  eq(entryAllowed('abc', undefined), false, 'a public PIN: a phone that has not entered is sent to the door')
  eq(entryAllowed('abc', 'abc'), true, '  …and one that has goes straight through')
  eq(entryAllowed('def', 'abc'), false, '  …until the PIN changes, which asks everybody again')
  eq(entryCookie('gx7k2p'), 'gd_entry_GX7K2P', 'one cookie per event, whatever the case of the link')
  const draft = (pin: string, confirm = pin) => ({ on: true, pin, confirm })
  eq(publicPinIssue({ on: false, pin: '', confirm: '' }, '1234'), null, 'off is fine — it is optional')
  eq(publicPinIssue(draft('5678'), '1234'), null, 'a different PIN from the admin PIN is fine')
  ok(publicPinIssue(draft('1234'), '1234') !== null, 'the admin PIN itself is refused — handing it to the field hands them the event')
  ok(publicPinIssue(draft('5678', '5679'), '1234') !== null, 'two that differ are refused')
  ok(publicPinIssue(draft('12'), '1234') !== null, 'and the admin PIN\'s own length rules hold')

  const layout = read('app/golf/[root]/[tripCode]/layout.tsx')
  ok(/fetchEntryLock\(tripCode\)/.test(layout) && layout.includes('redirect(`/enter/${tripCode}`)'),
    'the trip layout sends a phone that has not entered to the door')
  ok(/Promise\.all\(\[\s*fetchTripKind\(tripCode\), fetchEntryLock\(tripCode\)/.test(layout),
    '  …asked alongside the kind, never after it')
  const kind = read('app/golf/[root]/[tripCode]/kind.ts')
  ok(kind.includes(".select('public_passcode_hash')") && /if \(error\) return null/.test(kind),
    '  …in its own query, fail-soft — before migration 060 there is no lock')
  const gate = read('app/enter/[tripCode]/EntryGate.tsx')
  ok(gate.includes('hash === adminHash') && gate.includes('rememberUnlock(tripCode)'),
    'the admin PIN opens the door too, and unlocks the organiser\'s side with it')
  ok(read('app/enter/[tripCode]/page.tsx').includes("select('*')"), 'the door reads the trip whole, so no column means no lock')
  for (const form of ['CreateKnockoutForm', 'CreateLeagueForm', 'CreateTripForm']) {
    const src = read(`app/dashboard/create/${form}.tsx`)
    ok(src.includes('<PublicPinField') && src.includes('rememberEntry(code, publicHash)')
      && /public_passcode_hash/.test(src) && src.includes('!publicIssue'),
      `${form} offers the public PIN, writes it only when set, and lets its own device in`)
  }
  ok(read('app/golf/[root]/[tripCode]/organiser/page.tsx').includes('<PublicPinCard'), 'the organiser can change or take it off')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
