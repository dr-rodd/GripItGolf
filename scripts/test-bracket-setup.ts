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
  BRACKET_SIZES, BRACKET_MODES, PLAYER_ENTRIES, SEEDINGS, TOURNAMENT_FORMATS,
  type BracketSetup,
  roundsFor, bracketRoundNames, parseBracketSize, describeSize,
  normalizeEventCode, validEventCode, validDeadline, deadlinesIssue,
  unansweredSetup, isCompleteSetup, parseBracketSetup, describeSetup,
  isKnockoutEvent, knockoutSeed, knockoutBoards, drawDeadlines, deadlineNote, rawDrawPlan,
} from '../lib/bracketSetup'
import { hasMatchplay } from '../lib/leaderboards'
import { entryAllowed, entryCookie, publicPinIssue } from '../lib/publicPin'

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

// ─── Sizes and their rounds ────────────────────────────────────

section('Four sizes, each a power of two, each knowing its rounds')
{
  eq([...BRACKET_SIZES], [16, 32, 64], 'the three sizes, in order — up to 64 for now')
  eq(roundsFor(16), 4, '16 players is 4 rounds')
  eq(roundsFor(32), 5, '32 is 5')
  eq(roundsFor(64), 6, '64 is 6')
  eq(roundsFor(64), 6, '64 is 6')

  eq(bracketRoundNames(16),
    ['Round of 16', 'Quarter-Final', 'Semi-Final', 'Final'],
    'round names come from lib/matchplay.ts, first round first')
  eq(bracketRoundNames(64)[0], 'Round of 64', 'the big draw starts at 64')
  eq(bracketRoundNames(64).at(-1), 'Final', 'and every draw ends at the Final')

  eq(parseBracketSize(32), 32, 'a real size parses')
  eq(parseBracketSize('64'), 64, 'even as a stored string')
  eq(parseBracketSize(8), null, 'below the floor is refused')
  eq(parseBracketSize(256), null, 'above the ceiling too')
  eq(parseBracketSize(24), null, 'and anything that is not a power of two on the list')

  ok(describeSize(32).includes('32') && describeSize(32).includes('5'),
    'the size describes itself with its round count')
}

// ─── The qualifying event code ─────────────────────────────────

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

section('A deadline is a real date, and the rounds cannot run backwards')
{
  ok(validDeadline('2026-09-01'), 'a plain date passes')
  ok(!validDeadline('2026-9-1'), 'unpadded is refused')
  ok(!validDeadline('2026-02-30'), 'a date that does not exist is refused')
  ok(!validDeadline('tomorrow'), 'words are refused')
  ok(!validDeadline(undefined), 'absent is refused')

  const four = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']
  eq(deadlinesIssue(four, 16), null, 'a full, ordered set is fine')
  eq(deadlinesIssue(['2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01'], 16),
    null, 'rounds may share a day — a weekend settles two')
  ok(deadlinesIssue(four.slice(0, 3), 16)!.includes('Final'),
    'a missing round is named by its round, not its index')
  ok(deadlinesIssue(['2026-09-08', '2026-09-01', '2026-09-15', '2026-09-22'], 16)!
    .includes('cannot close before'),
    'a round closing before the one feeding it is refused')
  ok(deadlinesIssue([], 16) !== null, 'no deadlines at all is not a pass')
}

// ─── The open questions ────────────────────────────────────────

section('The form cannot finish until every question is answered')
{
  eq(unansweredSetup({}), ['League or match play'], 'the format comes first')
  eq(unansweredSetup({ format: 'league' }), ['A league is created as its own event'],
    'league is a dead end here — it is created through its own door')

  const missing = unansweredSetup({ format: 'match_play' })
  eq(missing, ['Strict or relaxed', 'How big the bracket is', 'How players get in'],
    'match play opens the mode, size and entry questions — deadlines wait for a size')

  ok(unansweredSetup({
    format: 'match_play', mode: 'strict', size: 16, entry: 'organiser',
  }).some(q => q.includes('deadline')), 'a size brings its deadlines with it')

  ok(unansweredSetup({
    format: 'match_play', mode: 'strict', size: 16, entry: 'organiser',
    qualifying: { eventCode: 'BAD', seeding: 'seeded' },
  }).some(q => q.includes('qualifying')), 'an attached qualifier must carry a real code')

  const done: Partial<BracketSetup> = {
    format: 'match_play', mode: 'relaxed', size: 16, entry: 'self_join',
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'],
    finalized: false,
  }
  eq(unansweredSetup(done), [], 'a full setup has nothing open')
  ok(isCompleteSetup(done), 'and is complete')
  ok(!isCompleteSetup({ ...done, finalized: undefined }),
    'finalisation is an answer too — open is a choice, not a default')
}

// ─── Storage ───────────────────────────────────────────────────

section('Storage round-trips whole or not at all')
{
  const setup: BracketSetup = {
    format: 'match_play', mode: 'strict', size: 32, entry: 'self_join',
    qualifying: { eventCode: 'QX7K2P', seeding: 'seeded' },
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'],
    finalized: true,
  }
  eq(parseBracketSetup(JSON.parse(JSON.stringify(setup))), setup,
    'a complete setup reads back byte-for-byte')

  eq(parseBracketSetup(null), null, 'null is no setup — the un-migrated column')
  eq(parseBracketSetup('match_play'), null, 'a bare string is refused')
  eq(parseBracketSetup([]), null, 'so is an array')
  eq(parseBracketSetup({ format: 'league' }), null,
    'a stored league setup is refused until league is built')
  eq(parseBracketSetup({ ...setup, size: 24 }), null, 'a size off the list drops the lot')
  eq(parseBracketSetup({ ...setup, mode: 'chaotic' }), null, 'an unknown mode too')
  eq(parseBracketSetup({ ...setup, deadlines: setup.deadlines.slice(0, 4) }), null,
    'deadlines that no longer cover the rounds drop the lot — never half an answer')
  eq(parseBracketSetup({ ...setup, qualifying: { eventCode: 'QX7K2P' } }), null,
    'a qualifier without its seeding is refused')
  eq(parseBracketSetup({ ...setup, qualifying: { eventCode: 'short', seeding: 'seeded' } }),
    null, 'a qualifier with a broken code is refused')

  const noQual = parseBracketSetup({ ...setup, qualifying: undefined })
  ok(noQual !== null && !('qualifying' in noQual!),
    'no qualifying event is a normal setup, and the key stays off the object')

  const open = parseBracketSetup({ ...setup, finalized: 'yes' })
  eq(open?.finalized, false, 'finalized is exactly true or it is open')

  const trimmed = parseBracketSetup({
    ...setup,
    deadlines: [...setup.deadlines, '2026-10-06'],
  })
  eq(trimmed?.deadlines.length, 5, 'a spare deadline beyond the rounds is trimmed')

  // The shape in time. A continuous knockout is an ongoing event over a
  // period; standalone is the absent default, kept off the object.
  const continuous = { ...setup, schedule: 'continuous' }
  eq(parseBracketSetup(JSON.parse(JSON.stringify(continuous))),
    { format: 'match_play', schedule: 'continuous', ...(({ format, ...rest }) => rest)(setup) },
    'a continuous knockout reads back whole, shape included')
  const plainShape = parseBracketSetup({ ...setup, schedule: 'sometime' })
  ok(plainShape !== null && !('schedule' in plainShape!),
    'an unknown shape is dropped, not guessed at')
}

section('The shape survives the bracket form')
{
  ok(describeSetup({
    format: 'match_play', schedule: 'continuous', mode: 'relaxed', size: 16,
    entry: 'self_join',
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'],
    finalized: false,
  }).includes('continuous'), 'the organiser card says continuous')

  // The continuous door seeds {format, schedule} before the bracket form
  // has ever been filled — a partial the parser refuses. The page recovers
  // the shape off the raw object and the form carries it into its save;
  // without both, the first save would quietly make the event standalone.
  const page = read('app/trip/[tripCode]/organiser/bracket/page.tsx')
  ok(page.includes("?.schedule === 'continuous'"),
    'the page reads the shape off the raw column, parse or no parse')
  const form = read('app/trip/[tripCode]/organiser/bracket/BracketSetupForm.tsx')
  ok(form.includes('initialSchedule'), 'and hands it to the form')
  ok(form.includes('initialSetup?.schedule ?? initialSchedule'),
    'whose save carries it through, saved setup first')
}

// ─── Naming ────────────────────────────────────────────────────

section('The organiser card says the setup in one line')
{
  const line = describeSetup({
    format: 'match_play', mode: 'relaxed', size: 32, entry: 'self_join',
    qualifying: { eventCode: 'QX7K2P', seeding: 'seeded' },
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'],
    finalized: false,
  })
  ok(line.includes('Match play'), 'the format leads')
  ok(line.includes('relaxed'), 'the mode is in it')
  ok(line.includes('32'), 'so is the size')
  ok(line.includes('QX7K2P'), 'and the qualifier it seeds off')
  ok(line.includes('open'), 'and whether it is still open')

  ok(describeSetup({
    format: 'match_play', mode: 'strict', size: 16, entry: 'organiser',
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'],
    finalized: true,
  }).includes('finalised'), 'a finalised setup says so')
}

// ─── The form offers what the model knows ──────────────────────

section('Every option the form offers is one the model can read back')
{
  ok(TOURNAMENT_FORMATS.some(f => f.key === 'league' && !f.built),
    'league is named and marked not-buildable-here — it is created through its own door')
  ok(TOURNAMENT_FORMATS.some(f => f.key === 'match_play' && f.built),
    'match play is named and built')
  eq(BRACKET_MODES.map(m => m.key), ['strict', 'relaxed'], 'the two modes')
  eq(PLAYER_ENTRIES.map(e => e.key), ['organiser', 'self_join'], 'the two entries')
  eq(SEEDINGS.map(s => s.key), ['random', 'seeded'], 'the two seedings')
}

// ─── Wiring ────────────────────────────────────────────────────

section('The form stands where it should and writes only what it owns')
{
  const page = read('app/trip/[tripCode]/organiser/bracket/page.tsx')
  ok(page.includes('PasscodeGate'), 'the bracket page stands behind the organiser PIN')
  ok(page.includes('isEvent'), 'and is events-only, like the rest of the organiser area')

  // The fail-soft rule the `kind` read established: a page's main select
  // never names a column a migration might not have added yet.
  const mainSelect = page.match(/select\('id, trip_code[^']*'\)/)?.[0] ?? ''
  ok(!mainSelect.includes('bracket_setup'),
    'the main trip select never names bracket_setup — the page must survive an un-migrated database')
  ok(page.includes("select('bracket_setup')"),
    'the setup rides in its own query, whose failure costs only the prefill')

  const form = read('app/trip/[tripCode]/organiser/bracket/BracketSetupForm.tsx')
  ok(form.includes(".eq('id', tripId)"), 'the save is scoped to its trip')
  ok(!form.includes('service_role') && !form.includes('SERVICE_ROLE'),
    'no service key anywhere near the browser')

  const organiser = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(organiser.includes('/organiser/bracket'), 'the organiser area is the door in')

  const organiserPage = read('app/trip/[tripCode]/organiser/page.tsx')
  const organiserTripSelect = organiserPage.match(/select\('id, trip_code[^']*'\)/)?.[0] ?? ''
  ok(!organiserTripSelect.includes('bracket_setup'),
    'the organiser page keeps bracket_setup out of its main select too')

  const migration = read('supabase/migrations/20260101000047_bracket_setup.sql')
  ok(migration.includes('ADD COLUMN IF NOT EXISTS bracket_setup jsonb'),
    'migration 047 adds the one jsonb column, idempotently')
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

  const bracket = read('app/trip/[tripCode]/matchplay/MatchplayBracket.tsx')
  ok(bracket.includes('aria-label="Dates each round is played by"'), 'the dates sit across the top of the bracket')
  const page = read('app/trip/[tripCode]/matchplay/page.tsx')
  ok(page.includes("from('trips').select('bracket_setup, kind, settings_passcode_hash').eq('id', trip.id).maybeSingle()"),
    '  …read in their own fail-soft query, never the trip\'s select')
  ok(page.includes('drawDeadlines(parseBracketSetup(rawSetup)?.deadlines ?? [], drawnRounds)'),
    '  …lined up with the rounds actually drawn')
  const board2 = read('app/trip/[tripCode]/leaderboard/page.tsx')
  ok(board2.includes('isKnockoutEvent(') && board2.includes('redirect(`/trip/${tripCode}/matchplay`)'),
    'a match play event\'s leaderboard tab is the bracket')
  ok(board2.includes("own.every(lb => lb.competition === 'matchplay')"),
    '  …unless the organiser added a board beside it')
  ok(read('app/components/TabBar.tsx').includes('pathname.startsWith(`${base}/matchplay`)) return \'leaderboard\''),
    'and the tab stays lit on the bracket')
}

section('A match play event reads from the player\'s side: the hub\'s card, the Scoring tab\'s portal, a match\'s page')
{
  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(hub.includes('isKnockoutEvent(') && hub.includes('<NextMatchCard'), 'the hub carries the next-match card on a match play event')
  ok(hub.includes("nextMatch: koView ? '' : nextMatchLine"), '  …in place of the one-line caption, which a trip keeps')
  const scoring = read('app/trip/[tripCode]/scoring/page.tsx')
  ok(scoring.includes('<KnockoutPortal') && scoring.includes('const knockout = event && isKnockoutEvent('),
    'the Scoring tab is the bracket\'s portal on a match play event')
  const views = read('app/trip/[tripCode]/KnockoutViews.tsx')
  ok(views.includes("cardClass('chosen', true)") && views.includes('opacity-60'),
    '  …your own match active and the rest listed, inactive')
  ok(views.includes('href={matchHref(tripCode, m.id)}') && !/m\.mine \? \(\s*<Link[\s\S]*?\) : \(\s*<Link/.test(views),
    '  …and only your own opens')
  const helper = read('app/trip/[tripCode]/knockout.ts')
  ok(helper.includes("teamFor(memberships, meId, setOf(draw)"), 'a pairs draw\'s entrant is the pairing on the draw\'s own sheet')
  ok(helper.includes("drawDeadlines(parseBracketSetup(rawSetup)?.deadlines ?? [], drawnRounds)"), 'every view lines the deadlines up the same way')
  const match = read('app/trip/[tripCode]/match/[matchId]/page.tsx')
  ok(match.includes('<MyHandicap') && match.includes("me.claimed === true"), 'a claimed player in the match amends their own handicap there')
  const mine = read('app/trip/[tripCode]/match/[matchId]/MyHandicap.tsx')
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

  const match = read('app/trip/[tripCode]/match/[matchId]/page.tsx')
  ok(match.includes("select('course_id, played_on, tees')") && match.includes('const arrangeable = !arrangedRes.error'),
    'the match page reads the arrangement in its own fail-soft query')
  ok(match.includes('matchStrokes(') && match.includes('allowanceOf(draw)') && match.includes('shotHoles('),
    '  …works out the shots off each tee at the draw\'s allowance, hole by hole')
  ok(match.includes('contactShown(c, {'), '  …shows contact details only as each player said')
  ok(match.includes('walkoverChoices(match, view.entrantId, false)') && match.includes('<MatchWalkover'),
    '  …and offers the walkover')
  const actions = read('app/trip/[tripCode]/match/[matchId]/MatchActions.tsx')
  ok(actions.includes(".eq('id', matchId).eq('trip_id', tripId)"), 'arranging writes the one match, scoped to the event')
  ok(actions.includes('persistWinner(all, matchId, winnerId, WALKOVER)'), 'a walkover goes through the bracket\'s own writer, cascade and all')
  ok(actions.includes("if (!organiser && !conceding) { setError('Awarding a walkover needs the admin PIN.')"),
    '  …a player may only concede; awarding is the organiser\'s')

  const route = read('app/api/match/contact/route.ts')
  ok(route.includes('readPlayerId(jar.get(playerCookieName(tripCode))?.value)') && route.includes(".eq('trip_id', trip.id)"),
    'contact details are saved only for the player this phone claimed')
  const reader = read('app/trip/[tripCode]/matchContacts.ts')
  ok(reader.includes('createAdminClient()') && reader.includes(".eq('trip_id', tripId)"), '  …and read on the server, scoped to the event')
  ok(!/from '@\/lib\/supabase-admin'|matchContacts/.test(read('app/trip/[tripCode]/MatchDetails.tsx')),
    '  …never from the browser')
  ok(read('app/trip/[tripCode]/page.tsx').includes('<MatchDetails'), 'the hub carries your home club and contact')

  const bracket = read('app/trip/[tripCode]/matchplay/MatchplayBracket.tsx')
  ok(bracket.includes('pin={sheet.correcting && lock && !unlocked ? lock : null}'),
    'on an event, a result already in is changed only with the admin PIN')
  const mpage = read('app/trip/[tripCode]/matchplay/page.tsx')
  ok(mpage.includes('isEvent(setupRow?.kind) && setupRow?.settings_passcode_hash'), '  …a trip\'s bracket stays open')
}

section('The match play card: top of the draw left, bottom right, NR, the result into the bracket')
{
  const sql = read('supabase/migrations/20260101000058_match_cards.sql')
  ok(sql.includes('PRIMARY KEY (match_id, player_id, hole_number)') && sql.includes('PRIMARY KEY (match_id, hole_number)'),
    'migration 058: a score a player a hole, a concession a hole — two phones interleave, never clobber')
  ok(sql.includes("CHECK (conceded_by IN ('A', 'B'))"), '  …a concession says which side gave it')
  const client = read('app/trip/[tripCode]/match/[matchId]/card/MatchCardClient.tsx')
  ok(/sideColumn\('A', a\)\}\s*\{sideColumn\('B', b\)/.test(client), 'the top of the draw on the left, the bottom on the right')
  ok(!client.includes('Concede hole') && client.includes('setGross(p.id, current, isNR ? undefined : null)'),
    'no concede button: each player has NR, saved as a score with no gross (migration 062)')
  ok(read('supabase/migrations/20260101000062_match_no_return.sql').includes('ALTER COLUMN gross DROP NOT NULL'),
    '  …which migration 062 lets the card keep')
  ok(client.includes('const nettPar = h.par + shots') && client.includes('value === null ? nettPar'),
    'the first tap of − or + lands on two points, nett par, as on a trip')
  ok(client.includes('aria-label="Previous hole"') && client.includes('aria-label="Next hole"') && !client.includes('grid-cols-9'),
    'previous and next move between holes — no grid of numbered holes')
  ok(client.includes('backgroundColor: holeFill(o, isNow)'), 'the strip marks each hole in the colour of the side that won it')
  ok(client.includes('usePoll(load, 15_000, true)') && !client.includes('setInterval'), 'the other phone shows up, through the one poller')
  const finishSheet = read('app/trip/[tripCode]/match/[matchId]/card/MatchFinish.tsx')
  ok(client.includes('const awaitingFinal = loaded && canEdit && shouldWrite(state, winnerId, stored, false)')
    && !client.includes('writeResult()\n  }, [loaded'),
    'a settled card asks before its result goes into an empty match — never by itself')
  ok(finishSheet.includes('Yes — finalise the match') && finishSheet.includes('No — go back and fix it'),
    '  …the sheet showing the last score and asking whether it is right')
  ok(finishSheet.includes('aria-label="Scores hole by hole"') && finishSheet.includes('backgroundColor: fillOf(o)'),
    '  …then the card hole by hole, each marked in the colour of whoever won it')
  ok(client.includes('persistWinner(all, matchId, winnerId as string, state.result)'), '  …through the bracket\'s own writer')
  ok(client.includes('const canEdit = organiser || (!decided && (inMatch || anyoneScores))'),
    'anybody scores an open match unless kept to its players; once it is in, it is the admin PIN')
  ok(read('app/trip/[tripCode]/match/[matchId]/card/page.tsx').includes("'score_matches'"),
    '  …the page asking the event\'s permission')
  ok(client.includes('offerOverwrite') && client.includes('onClick={() => { void writeResult() }}'),
    '  …and over a result already in, only by the organiser\'s deliberate tap')
  const page = read('app/trip/[tripCode]/match/[matchId]/card/page.tsx')
  const cards = read('app/trip/[tripCode]/match/matchCards.ts')
  ok(page.includes('readCardSetups(') && cards.includes('matchStrokes(') && page.includes("Arrange the match first"),
    'the card takes its shots from the arrangement, or sends you to arrange it')
  ok(client.includes('playCard(') && client.includes('Extra holes'), 'level after 18 the card grows extra holes')
  ok(client.includes('<select') && client.includes('value={extraCourseHole(current, plan)}')
    && /update\(\{ extra_holes: next \}\)\.eq\('id', matchId\)\.eq\('trip_id', tripId\)/.test(client),
    '  …each with a dropdown for the hole it is played off, saved for both phones')
  ok(read('app/trip/[tripCode]/match/matchCards.ts').includes(".select('id, extra_holes')"),
    '  …read in its own query, so a database without migration 061 keeps the card\'s shots')

  // The live board: the Scoring tab reads every open match's card through the
  // same setup the card page draws from, so the two cannot disagree.
  ok(cards.includes('export async function readLiveMatches') && /readCardSetups\(trip, view, players, started\)/.test(cards),
    'live matches are read off their cards through the card\'s own setup')
  const scoringPage = read('app/trip/[tripCode]/scoring/page.tsx')
  ok(scoringPage.includes('readLiveMatches(trip, view, roster)') && scoringPage.includes('live={knockoutRead?.live ?? []}'),
    'the Scoring tab hands the portal its live matches')
  const views = read('app/trip/[tripCode]/KnockoutViews.tsx')
  ok(views.includes('<LiveBoard') && views.includes('dot-live') && !views.includes('setInterval'),
    'the portal draws a live board, refreshed through the one poller')
  ok(read('app/trip/[tripCode]/match/[matchId]/page.tsx').includes("'Score this match'"), 'the match page opens the card')
}

// ─── The draw ──────────────────────────────────────────────────

section('The draw: made at creation, from the organiser area, or by itself on a date')
{
  const drawer = read('app/components/BracketDrawer.tsx')
  ok(drawer.includes('DRAW_METHODS.map') && drawer.includes('Draw again'), 'random, seeded or picked by hand, a random draw drawn again')
  ok(drawer.includes('moveToSeed(order, typing.id, n)') && drawer.includes('onPointerDown') && drawer.includes('By handicap') && drawer.includes('Shuffle'),
    'seeded: type a number, drag the handle, start from handicap order or shuffle')
  ok(drawer.includes('placeInSlot(slots, place, id)') && drawer.includes('Add a player'), 'by hand: each empty place a dropdown of the players not yet placed')
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
  ok(read('app/trip/[tripCode]/organiser/bracket/BracketSetupForm.tsx').includes('...(draw ? { draw } : {})'),
    'the setup form carries the plan through its save')
  const cleanup = read('app/api/cleanup/route.ts')
  ok(cleanup.includes('runDueDraws(supabaseAdmin, todayString(new Date()), dryRun)'), 'the nightly job makes the draws due today')
  const due = read('app/api/match/dueDraws.ts')
  ok(due.includes('drawDue(plan, today, state.drawn)') && due.includes('writeDraw(admin'), '  …only where nothing is drawn yet, through the one writer')
  ok(read('app/trip/[tripCode]/organiser/OrganiserClient.tsx').includes('/organiser/draw'), 'the organiser area has the draw')
  ok(read('app/trip/[tripCode]/organiser/draw/DrawClient.tsx').includes('if (state.inPlay)'), '  …which, once in play, says so rather than offering a redraw')
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

  const layout = read('app/trip/[tripCode]/layout.tsx')
  ok(/fetchEntryLock\(tripCode\)/.test(layout) && layout.includes('redirect(`/enter/${tripCode}`)'),
    'the trip layout sends a phone that has not entered to the door')
  ok(/Promise\.all\(\[fetchTripKind\(tripCode\), fetchEntryLock\(tripCode\)/.test(layout),
    '  …asked alongside the kind, never after it')
  const kind = read('app/trip/[tripCode]/kind.ts')
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
  ok(read('app/trip/[tripCode]/organiser/page.tsx').includes('<PublicPinCard'), 'the organiser can change or take it off')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
