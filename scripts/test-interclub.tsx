/**
 * Interclub — reading the national draws (lib/interclub.ts). Run with:
 * npm run test:interclub
 *
 * The fixtures are the real Golf Genius pages (November 2026), trimmed to
 * the parts read and with every convenor's name, email and phone blanked.
 * Each one is here for a way the draws are typed: points (Connacht Shield),
 * holes written only on the winner (Barton Shield), tee times and venues in
 * the cells (Ulster North), "[H" and "- 6" and a walkover (Ulster South),
 * a re-drawn round (Munster East).
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  readCompetitionList, readSitePages, drawPageOf, readPageWidget, readDraw, readCell,
  readDrawDate, drawToBracket, drawStatus, winnerOf, sameClub, clubKey, slugOf, scoreText,
  roundName, textOf, PROVINCES, type DrawSide,
} from '../lib/interclub'
import MatchplayBracket, { type BracketMatchRow } from '../app/golf/[root]/[tripCode]/matchplay/MatchplayBracket'

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

const DIR = join(__dirname, 'fixtures', 'interclub')
const fixture = (name: string) => readFileSync(join(DIR, name), 'utf8')
const draw = (name: string) => {
  const d = readDraw(fixture(name), 2026)
  if (!d) throw new Error(`${name} did not read`)
  return d
}
const side = (s: DrawSide | null) => s ? `${s.name}${s.score ? ' ' + s.score : ''}` : '—'

// ─── The fixtures carry nobody's details ───────────────────────

section('Fixtures: no convenor details')
for (const f of readdirSync(DIR)) {
  const t = fixture(f)
  ok(!/@(?!example\.invalid)[a-z0-9-]+\./i.test(t), `${f}: no email but the placeholder`)
  ok(!/(?<![\d/=_])(?:\+353|\+44|0)\s?\(?0?\)?\s?\d{2,3}[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/.test(t.replace(/000 0000000/g, '')), `${f}: no phone number`)
}

// ─── The hub's competitions ────────────────────────────────────

section('A province’s competitions')
{
  const list = readCompetitionList(fixture('connacht-list.html'), 'connacht')
  ok(list.length >= 20, `Connacht lists its competitions (${list.length})`)
  const shield = list.find(c => c.name === 'Connacht Shield (m)')
  eq(shield && { id: shield.id, slug: shield.slug }, { id: '12642291381881043035', slug: 'connacht-shield-m' }, 'the Connacht Shield: its site and its address here')
  ok(!list.some(c => /select a competition/i.test(c.name)), 'the dropdown’s prompt is no competition')
  eq(new Set(list.map(c => c.slug)).size, list.length, 'every address unique')
  eq(PROVINCES.map(p => p.key), ['connacht', 'leinster', 'munster', 'ulster'], 'the four provinces')
  eq(slugOf('AIG Women’s Junior Cup (Ulster North)'), 'aig-womens-junior-cup-ulster-north', 'a curly apostrophe is no gap')
  eq(slugOf("Jack O'Sullivan Trophy (m)"), 'jack-osullivan-trophy-m', 'nor a straight one')
}

section('A competition’s site and its draw page')
{
  const pages = readSitePages(fixture('site.html'))
  eq(drawPageOf(pages)?.id, '12642291406543550933', 'the draw is "Draw / Latest Results"')
  eq(drawPageOf([{ id: '1', name: 'Team Captain Information' }, { id: '2', name: 'Match Play Stage' }])?.id, '2', 'or "Match Play Stage"')
  eq(drawPageOf([{ id: '1', name: 'Event Information' }, { id: '3', name: 'Prize Winners' }]), null, 'a site with no draw page has none')
  eq(drawPageOf([{ id: '1', name: 'Results Sheet' }, { id: '2', name: 'Stroke Play Qualifying Scores' }, { id: '3', name: 'MATCHPLAY - Semi Finals - Final' }])?.id, '3',
    'a qualifier’s results sheet is not the draw; its "MATCHPLAY" page is')
  const w = readPageWidget(fixture('draw-page.html'))
  eq(w.kind, 'table', 'the draw page loads a pasted table')
  ok(w.kind === 'table' && w.url.includes('widgets/text_pages?page_id=12642291406543550933'), 'from its own widget')
  eq(readPageWidget(fixture('picture-page.html')), { kind: 'elsewhere', what: 'picture' }, 'a draw posted as a picture is read only there')
}

// ─── A cell ────────────────────────────────────────────────────

section('A cell')
{
  const c = (raw: string) => {
    const s = readCell(raw)
    return s && { name: s.name, score: s.score, home: s.home, away: s.away, bye: s.bye, out: s.out, playoff: s.playoff }
  }
  const w = (raw: string) => {
    const s = readCell(raw)
    return s && [s.name, s.score, s.won]
  }
  eq(c('Team 1 Ballinrobe  2.5'), { name: 'Ballinrobe', score: '2½', home: false, away: false, bye: false, out: false, playoff: false }, '"Team 1" off, the score read')
  eq(c(' Ballinrobe (H) 3.5'), { name: 'Ballinrobe', score: '3½', home: true, away: false, bye: false, out: false, playoff: false }, 'at home')
  eq(c('Ballyhaunis ( Away) 2.5')?.away, true, '"( Away)" is away')
  eq(c('Laytown Bettystown .(A )4 H'), { name: 'Laytown Bettystown', score: '4 holes', home: false, away: true, bye: false, out: false, playoff: false }, 'a stray full stop and "4 H"')
  eq(c('Rockmount [H] - 6')?.score, '6', '"[H] - 6"')
  eq(c('Royal County Down Ladies [H')?.home, true, '"[H" never closed')
  eq(c('Portumna (Home) 2 P/O')?.playoff, true, 'P/O is a playoff')
  eq(c('Athlone 2 P/0')?.playoff, true, 'and so is P/0')
  eq(c('Team 12 BYE')?.bye, true, 'a bye')
  eq(c('  '), null, 'an empty place is nobody yet')
  eq(c('BALLYHAUNIS')?.name, 'Ballyhaunis', 'capitals read in title case')
  eq(c('Clandeboye - Tie Hole [H]'), { name: 'Clandeboye', score: 'tie hole', home: true, away: false, bye: false, out: false, playoff: false }, 'a spaced dash ends the name')
  eq(c('Belvoir - "WO" [H]')?.score, 'W/O', 'a walkover')
  eq(c('Bandon W/O (H)'), { name: 'Bandon', score: 'W/O', home: true, away: false, bye: false, out: false, playoff: false }, 'W/O after the name')
  eq(c('Rosapenna (Disq')?.out, true, '"(Disq" is out')
  eq(c('Gweedore w/d')?.score, 'W/D', 'withdrawn')
  eq(c('Ballyclare at 08.30 Moyola Park 6 holes')?.name, 'Moyola Park', 'a tee time and venue ahead of the club')
  eq(c('at Castlerock 08.00 Buncrana')?.name, 'Buncrana', 'and the other way round')
  eq(c('Cork 19th')?.score, '19th', 'won at the 19th')
  eq(c('Heritage (Home)')?.name, 'Heritage', '"(Home)" is a marker, a club called Heritage is not')
  eq(c('The Heritage')?.home, false, 'and never read as at home')
  eq(w('Kilcock 2 (19th'), ['Kilcock', '2 (19th)', true], 'won at the 19th, the bracket never closed')
  eq(w('Omagh 2 Tie Holes'), ['Omagh', '2 (tie hole)', true], 'on a tie hole')
  eq(w('Galgorm Castle 2 19th hl'), ['Galgorm Castle', '2 (19th)', true], '"19th hl"')
  eq(w('Castlerock 7xtr'), ['Castlerock', '7 (tie hole)', true], '"xtr"')
  eq(w('Castletroy W'), ['Castletroy', null, true], 'a bare W')
  eq(w('East Clare Won'), ['East Clare', null, true], '"Won"')
  eq(w('Mahon 2(W'), ['Mahon', '2', true], '"(W"')
  eq(w('Balmoral W O'), ['Balmoral', 'W/O', true], '"W O" is a walkover')
  eq(w('Westport'), ['Westport', null, false], 'a W inside a name is no win')
  eq([c('Wexford GC Home')?.name, c('Wexford GC Home')?.home, c('Courtown GC Away')?.away], ['Wexford GC', true, true], 'Home and Away as words')
  eq(w('Enniskillen. H. W.O'), ['Enniskillen', 'W/O', true], '"W.O", and a bare H')
  eq([c('Headfort 2.5 H')?.score, c('Headfort 2.5 H')?.home, c('Carrickfergus 2,5')?.score], ['2½', true, '2½'], 'a score then H; a comma for a point')
  eq(w('East Clare W//O'), ['East Clare', 'W/O', true], '"W//O"')
  ok(sameClub(clubKey('The Royal Dublin'), clubKey('Royal Dublin')), '"The" is no part of who a club is')
  eq(c('Ballina')?.name, 'Ballina', 'a capital inside a name is left alone')
  eq(c('at Blackwood/Mahee at 13.00 Clandeboye')?.name, 'Clandeboye', 'a venue of two courses and a tee time')
  eq([scoreText('3.00'), scoreText('0.5'), scoreText('4Hls'), scoreText('1 hole'), scoreText('2.25')], ['3', '½', '4 holes', '1 hole', '2.25'], 'scores as people say them')
}

section('One club, however it is spelt')
{
  ok(sameClub(clubKey('St Anne’s.'), clubKey('St. Annes')), 'St Anne’s and St. Annes')
  ok(sameClub(clubKey('Royal Dublin'), clubKey('Royal Dublin Golf Club')), 'Golf Club or not')
  ok(sameClub(clubKey('Ballybofey/Stranorlar'), clubKey('Ballybofey Stranorlar')), 'a slash is a space')
  ok(!sameClub(clubKey('Royal Co. Down Ladies'), clubKey('Royal Co. Down')), 'the ladies’ club is its own')
  ok(sameClub(clubKey('Laytown Bettystown'), clubKey('Laytown & Bettystown')), 'with or without the ampersand')
  ok(sameClub(clubKey('Royal County Down Ladies'), clubKey('Royal Co. Down Ladies')), 'County and Co.')
  ok(sameClub(clubKey('Belvoir'), clubKey('Belvoir Park')), 'a name and its longer self')
  ok(!sameClub(clubKey('Galway'), clubKey('Galway Bay')), 'but not Galway and Galway Bay — too short a stem to trust')
  ok(!sameClub(clubKey('Cork'), clubKey('Co. Cork')), 'nor Cork and Co. Cork')
}

section('Who went through')
{
  const s = (name: string, extra: Partial<DrawSide> = {}): DrawSide =>
    ({ name, key: clubKey(name), bye: false, home: false, away: false, score: null, playoff: false, out: false, won: false, ...extra })
  eq(winnerOf(s('Bye', { bye: true, key: '' }), s('Boyle'), null), 'b', 'a bye’s opponent')
  eq(winnerOf(s('Gort'), s('Oughterard'), s('Oughterard')), 'b', 'the side the next round names')
  eq(winnerOf(s('Mountbellew', { score: '2' }), s('Athlone', { score: '2', playoff: true }), s('Athlone')), 'b', 'level and a playoff: the next round says who')
  eq(winnerOf(s('Skibbereen'), s('Macroom', { score: '2 holes' }), s('Waterford')), 'b', 'a re-drawn next round passed over; the winner’s holes say who')
  eq(winnerOf(s('Buncrana'), s('Rosapenna', { out: true, score: 'DQ' }), null), 'a', 'disqualified loses')
  eq(winnerOf(s('Ballinrobe', { score: '2½' }), s('Castlebar', { score: '1½' }), null), 'a', 'the bigger score, with nobody named yet')
  eq(winnerOf(s('Ballyhaunis'), s('Oughterard'), null), null, 'nothing written: undecided')
  eq(winnerOf(s('Ballyhaunis', { score: '2' }), s('Oughterard', { score: '2' }), null), null, 'level and nobody named: undecided, never a guess')
}

section('Dates')
{
  eq(readDrawDate('10th August 2026', 2026), '2026-08-10', '"10th August 2026"')
  eq(readDrawDate('24-May-26', 2026), '2026-05-24', '"24-May-26"')
  eq(readDrawDate('14/06/2026', 2026), '2026-06-14', 'day first')
  eq(readDrawDate('To be completed by: 5-Jun', 2026), '2026-06-05', 'the draw’s year where none is written')
  eq(readDrawDate('Leg 1 : 3rd October Oughterard Time-1300hrs', 2026), '2026-10-03', 'inside a sentence')
  eq(readDrawDate('31/02/2026', 2026), null, 'no 31st of February')
  eq(readDrawDate('Top Half at Ballyclare', 2026), null, 'no date at all')
  eq([roundName('Quarterfinals (8)'), roundName('Round 1 (64)'), roundName('Final (2)')], ['Quarter-finals', 'Round 1', 'Final'], 'round names')
  eq(textOf('St&#39;Anne&rsquo;s&nbsp;&amp; Co'), 'St\'Anne’s & Co', 'entities')
}

// ─── The draws ─────────────────────────────────────────────────

section('Connacht Shield — points, playoffs, a final in two legs')
{
  const d = draw('connacht-shield.html')
  eq([d.title, d.area], ["Men's Connacht Shield", 'Connacht'], 'its title and area')
  eq(d.rounds.map(r => [r.name, r.by]), [
    ['Round 1', '2026-08-10'], ['Round 2', '2026-08-24'], ['Quarter-finals', '2026-09-07'],
    ['Semi-finals', '2026-09-21'], ['Final', '2026-10-03'],
  ], 'five rounds and their play-by dates')
  ok(d.rounds[4].notes.some(n => /Leg 2/.test(n)), 'the final’s second leg kept as a note')
  eq(d.matches.length, 16 + 8 + 4 + 2 + 1, 'a match a place')
  const m = (r: number, s: number) => d.matches.find(x => x.round === r && x.slot === s)!
  eq([side(m(0, 0).a), side(m(0, 0).b), m(0, 0).winner], ['Ballinrobe 2½', 'Castlebar 1½', 'a'], 'the first match')
  eq([side(m(0, 5).a), m(0, 5).b?.bye, m(0, 5).winner], ['Ballinasloe', true, 'a'], 'a bye')
  eq([m(1, 0).a?.home, m(1, 0).b?.away], [true, true], 'round 2’s home and away')
  eq([side(m(3, 0).a), side(m(3, 0).b), m(3, 0).winner], ['Ballyhaunis 2½', 'Portumna 1½', 'a'], 'a semi-final')
  eq([side(m(4, 0).a), side(m(4, 0).b), m(4, 0).winner], ['Ballyhaunis', 'Oughterard', null], 'the final, its result not on this page')
  eq(d.champion, null, 'no champion written')
  eq(drawStatus(d), 'Final to play', 'where it stands')
  eq(d.matches.filter(x => x.a && x.b && !x.a.bye && !x.b.bye && !x.winner).length, 1, 'every match decided but the final')
}

section('The Barton Shields — holes, tee times, a re-drawn round')
for (const [file, champion, size] of [
  ['munster-east-barton.html', 'Douglas', 64],
  ['ulster-north-barton.html', 'Royal Portrush', 64],
  ['leinster-north-barton.html', 'Royal Dublin', 64],
  ['ulster-south-womens-junior.html', 'Rockmount', 16],
] as const) {
  const d = draw(file)
  eq(d.champion?.name, champion, `${file}: won by ${champion}`)
  eq(d.matches.filter(m => m.round === 0).length, size / 2, `${file}: ${size} places`)
  const open = d.matches.filter(m => m.a && m.b && !m.a.bye && !m.b.bye && !m.winner)
  eq(open.map(m => `r${m.round}s${m.slot} ${side(m.a)} v ${side(m.b)}`), [], `${file}: every match played is decided`)
  eq(drawStatus(d), `Won by ${champion}`, `${file}: where it stands`)
  ok(d.rounds.every(r => !!r.by), `${file}: every round has its date`)
}
{
  const d = draw('ulster-north-barton.html')
  ok(d.rounds[1].notes.includes('Top Half at Ballyclare'), 'a round’s venues kept as notes')
  const r1 = d.matches.filter(m => m.round === 1).map(m => side(m.a))
  ok(r1.includes('Moyola Park 6 holes') && !r1.some(n => /\bat\b/.test(n)), 'tee times and venues off the clubs’ names')
}

section('Not a draw')
{
  eq(readDraw('<p>Draw to follow</p>', 2026), null, 'no table')
  eq(readDraw('<table><tr><td>Results</td><td>Score</td></tr></table>', 2026), null, 'a table that is no bracket')
  const short = fixture('connacht-shield.html').replace(/<tr>(?![\s\S]*<tr>)[\s\S]*$/, '</table>')
  ok(readDraw(short.slice(0, Math.floor(short.length / 2)) + '</table>', 2026) === null, 'a draw cut short is unreadable, not half read')
}

// ─── Into the bracket ──────────────────────────────────────────

section('Into the bracket')
{
  const d = draw('connacht-shield.html')
  const b = drawToBracket(d)
  eq(b.deadlines, ['2026-08-10', '2026-08-24', '2026-09-07', '2026-09-21', '2026-10-03'], 'the play-by dates, round by round')
  eq([1, 2, 3, 4, 5].map(n => b.matches.filter(m => m.round_number === n).length), [16, 8, 4, 2, 1], 'every place a row')
  const ids = new Map(b.matches.map(m => [m.id, m]))
  ok(b.matches.every(m => !m.next_match_id || ids.has(m.next_match_id)), 'every next match exists')
  const name = (id: string | null) => b.entrants.find(e => e.id === id)?.name ?? null
  const r1 = b.matches.find(m => m.id === 'r1s0')!
  eq([name(r1.player_a_id), name(r1.player_b_id), name(r1.winner_player_id), r1.score_a, r1.home], ['Ballinrobe', 'Enniscrone', 'Ballinrobe', '3½', 'A'], 'a round-2 match, its winner and home')
  eq(b.entrants.filter(e => e.name === 'Ballyhaunis').length, 1, 'a club is one entrant across the rounds — "BALLYHAUNIS" in the final included')
  eq(b.entrants.length, 31, 'thirty-one clubs and a bye')
  eq(drawToBracket(d), b, 'the same draw gives the same rows')

  const html = renderToStaticMarkup(React.createElement(MatchplayBracket, {
    matches: b.matches as unknown as BracketMatchRow[], entrants: b.entrants, deadlines: b.deadlines, today: '2026-11-27', readOnly: true,
  }))
  ok(html.includes('Ballinrobe') && html.includes('2½'), 'the bracket draws the clubs and their scores')
  ok(html.includes('title="At home"'), 'and who was at home')
  ok(!html.includes('cursor-pointer'), 'read-only: no tile can be tapped')
  ok(html.includes('Swipe to move between rounds') && !html.includes('hold a finished match'), 'and it says only how to move')
  const ordinary = renderToStaticMarkup(React.createElement(MatchplayBracket, {
    matches: b.matches.map(({ score_a: _a, score_b: _b, home: _h, ...m }) => m) as unknown as BracketMatchRow[], entrants: b.entrants,
  }))
  ok(!ordinary.includes('title="At home"') && ordinary.includes('cursor-pointer'), 'a Green Dot draw reads as before')
}

section('The pages and the reads share one clock')
{
  const seconds = Number(readFileSync(join(__dirname, '..', 'app', 'interclub', 'source.ts'), 'utf8').match(/INTERCLUB_SECONDS = (\d+)/)?.[1])
  for (const page of ['app/interclub/page.tsx', 'app/interclub/[province]/[slug]/page.tsx']) {
    const src = readFileSync(join(__dirname, '..', page), 'utf8')
    eq(Number(src.match(/export const revalidate = (\d+)/)?.[1]), seconds, `${page} is regenerated as often as the draws are read`)
  }
  const reader = readFileSync(join(__dirname, '..', 'lib', 'interclub.ts'), 'utf8')
  ok(!/convenor\s*(name|email|phone)\b[^\n]*=/i.test(reader.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'the reader takes nothing off a convenor')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) { console.log('\nFailures:\n  ' + failures.join('\n  ')); process.exit(1) }
