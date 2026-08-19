// Generates the site intro's example screens as tiny SVGs — hand-traced
// from real greendot.live screenshots supplied by Big Dog. Run with
// `npm run intro:shots`; output lands in public/intro/.
//
// Shape: 360x700, no tab bar — the intro shows these full-bleed with the
// user's REAL tab bar as the footer, object-fit cover anchored to the
// top, so the bottom of each artboard is sacrificial: everything that
// matters sits above y=560, and the last stretch is padding that shorter
// phones crop without loss. The bubble floats over the top third, so the
// money content starts around y=200.
import { writeFileSync, mkdirSync } from 'fs'

const W = 360, H = 700
const CREAM = '#F6F4F0', SURF = '#FFFFFF', INK = '#2B2118', BARK = '#4A3728'
const ACC = '#0A9D56', DEEP = '#0A6B3C'
const BORDER = 'rgba(74,55,40,0.14)', MUT = 'rgba(43,33,24,0.55)', MUT2 = 'rgba(43,33,24,0.75)'
const TINT = 'rgba(10,157,86,0.10)'
const SANS = `-apple-system,'Segoe UI',system-ui,sans-serif`
const SERIF = `Georgia,'Times New Roman',serif`

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** The wordmark-ish page title: bold lowercase sans in the brown, closed
    by the emerald dot, like the real generated marks. */
function header(title) {
  const tw = title.length * 12.5
  return `<text x="16" y="30" font-family="${SANS}" font-size="21" font-weight="700" fill="${BARK}" letter-spacing="-0.5">${esc(title)}</text>` +
    `<circle cx="${20 + tw}" cy="29" r="3.6" fill="${ACC}"/>` +
    `<line x1="0" y1="44" x2="${W}" y2="44" stroke="${BORDER}"/>`
}

const card = (x, y, w, h, over = {}) => {
  // Overrides replace the defaults — appending a second fill or stroke is
  // a duplicate attribute, which is malformed XML and a blank <img>.
  const fill = over.fill ?? SURF
  const stroke = over.stroke ?? BORDER
  const sw = over.sw ? ` stroke-width="${over.sw}"` : ''
  const so = over.so ? ` stroke-opacity="${over.so}"` : ''
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}"${sw}${so}/>`
}
const t = (x, y, size, fill, txt, { w = 400, f = SERIF, a = 'start', ls = 0, it = false } = {}) =>
  `<text x="${x}" y="${y}" font-family="${f}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${a}"${ls ? ` letter-spacing="${ls}"` : ''}${it ? ` font-style="italic"` : ''}>${esc(txt)}</text>`
const backBtn = (x, y) =>
  `<rect x="${x}" y="${y}" width="34" height="34" rx="10" fill="${SURF}" stroke="${BORDER}"/>` +
  `<path d="M${x + 21} ${y + 10} L${x + 14} ${y + 17} L${x + 21} ${y + 24}" stroke="${BARK}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`

const wrap = body =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
  `<rect width="${W}" height="${H}" fill="${CREAM}"/>${body}</svg>`

// ── 1. Trip hub ──
function golfCard(y, l1, l2, sub) {
  return card(16, y, 328, l2 ? 78 : 64) +
    `<rect x="28" y="${y + 16}" width="22" height="22" rx="5" fill="${CREAM}"/>` +
    `<path d="M36 ${y + 34} V${y + 22} L44 ${y + 24} L36 ${y + 27}" stroke="${BARK}" stroke-width="1.4" fill="none" stroke-linejoin="round"/>` +
    t(60, y + 28, 14, INK, l1, { w: 700 }) +
    (l2 ? t(60, y + 46, 14, INK, l2, { w: 700 }) : '') +
    t(60, y + (l2 ? 65 : 46), 11.5, MUT2, sub)
}
const hub = wrap(
  header('green dot') +
  `<rect x="70" y="58" width="110" height="30" rx="15" fill="${SURF}" stroke="${BARK}" stroke-opacity="0.4"/>` +
  t(125, 77, 12.5, INK, 'Share trip', { w: 700, a: 'middle' }) +
  t(230, 77, 12.5, DEEP, 'QR code') +
  card(16, 100, 328, 118) +
  t(32, 130, 16, INK, 'Rory', { w: 700 }) +
  t(328, 129, 10, MUT, 'NOT YOU?', { f: SANS, a: 'end', ls: 1.2 }) +
  `<line x1="32" y1="142" x2="328" y2="142" stroke="${BORDER}"/>` +
  t(50, 163, 10.5, MUT, "THAT'S THE TRIP", { f: SANS, ls: 1.4 }) +
  t(50, 181, 12, MUT2, 'Every round is in. The leaderboard is final.') +
  `<line x1="32" y1="192" x2="328" y2="192" stroke="${BORDER}"/>` +
  t(32, 210, 12, INK, 'Plays Jack · Quarter-Final') +
  t(16, 268, 22, INK, 'Your Itinerary', { w: 700 }) +
  t(16, 290, 11.5, MUT2, 'Tap a course card for current weather and course') +
  t(16, 305, 11.5, MUT2, 'details.') +
  t(16, 336, 12, INK, 'THURSDAY, 20 AUGUST', { f: SANS, w: 700, ls: 1.6 }) +
  t(104, 361, 11.5, MUT2, 'Dublin to Carne  ·  4 hr drive') +
  golfCard(376, 'Carne Golf Links -- Wild', 'Atlantic Dunes', '2 tee times from 1:00 pm') +
  t(16, 490, 12, INK, 'FRIDAY, 21 AUGUST', { f: SANS, w: 700, ls: 1.6 }) +
  golfCard(504, 'Carne Golf Links -- Wild', 'Atlantic Dunes', '2 tee times from 9:30 am'),
)

// ── 2. Scoring: choose a round (round 1 in play) ──
function roundCard(y, n, course, place, live = false) {
  return card(16, y, 328, 74, live ? { stroke: ACC, sw: 1.6 } : {}) +
    t(32, y + 24, 10.5, MUT, `ROUND ${n}`, { f: SANS, ls: 2 }) +
    t(32, y + 45, 15, INK, course) +
    t(32, y + 63, 11.5, live ? DEEP : MUT2, `${place} · ${live ? 'In play' : 'No scores yet'}`) +
    (live ? `<circle cx="326" cy="${y + 24}" r="3.5" fill="${ACC}"/>` : '')
}
const scoring = wrap(
  header('scoring') +
  t(16, 78, 11, MUT, 'CHOOSE A ROUND', { f: SANS, ls: 2 }) +
  `<rect x="228" y="58" width="116" height="30" rx="15" fill="${SURF}"/>` +
  t(286, 77, 12.5, INK, '+ Add round', { w: 700, a: 'middle' }) +
  roundCard(104, 1, 'Carne Golf Links -- Wild Atlan…', 'Belmullet, Mayo, Ireland', true) +
  roundCard(192, 2, 'Carne Golf Links -- Wild Atlan…', 'Belmullet, Mayo, Ireland') +
  roundCard(280, 3, 'County Sligo Golf Club -- Colt…', 'Rosses Point, Sligo, Ireland') +
  roundCard(368, 4, 'Ballyliffin Golf Club -- Old Links', 'Ballyliffin, Donegal, Ireland') +
  roundCard(456, 5, 'Portsalon Golf Club', 'Portsalon, Donegal, Ireland'),
)

// ── 3. Scoring: the group's scorecard — players and tees ──
function playerBlock(y, dotC, name, hcp, ph, ninety) {
  return `<rect x="16" y="${y}" width="328" height="46" rx="6" fill="${TINT}" stroke="${DEEP}" stroke-opacity="0.5"/>` +
    `<circle cx="34" cy="${y + 23}" r="4.5" fill="${dotC}"/>` +
    t(48, y + 29, 15, DEEP, name, { w: 700 }) +
    t(328, y + 28, 12, DEEP, `HCP ${hcp}`, { a: 'end' }) +
    `<rect x="30" y="${y + 56}" width="66" height="30" rx="4" fill="#FAFAF8" stroke="#3B82F6" stroke-width="1.4"/>` +
    `<circle cx="44" cy="${y + 71}" r="4" fill="#3B82F6"/>` +
    t(56, y + 76, 11.5, INK, 'BLUE', { f: SANS, ls: 1 }) +
    `<rect x="104" y="${y + 56}" width="76" height="30" rx="4" fill="${SURF}" stroke="${BORDER}"/>` +
    `<circle cx="118" cy="${y + 71}" r="4" fill="none" stroke="${MUT}"/>` +
    t(130, y + 76, 11.5, MUT2, 'WHITE', { f: SANS, ls: 1 }) +
    t(30, y + 108, 12.5, INK, 'Playing HC:') + t(102, y + 108, 13, INK, String(ph), { w: 700 }) +
    t(126, y + 108, 12.5, MUT2, '90%:') + t(158, y + 108, 13, DEEP, String(ninety), { w: 700 })
}
const scorecard = wrap(
  header('scoring') +
  backBtn(16, 58) +
  t(62, 74, 16, INK, 'Carne Golf Links -- Wild', { w: 700 }) +
  t(62, 95, 16, INK, 'Atlantic Dunes', { w: 700 }) +
  `<rect x="294" y="60" width="52" height="30" rx="10" fill="${TINT}" stroke="${DEEP}" stroke-opacity="0.4"/>` +
  t(320, 80, 13, DEEP, '90%', { w: 700, a: 'middle' }) +
  `<rect x="16" y="112" width="328" height="34" rx="17" fill="${TINT}"/>` +
  `<circle cx="112" cy="129" r="4" fill="${ACC}"/>` +
  t(126, 134, 11.5, DEEP, 'LIVE LEADERBOARD', { f: SANS, ls: 2 }) +
  t(16, 174, 11, MUT, 'SELECT PLAYERS (1–4)', { f: SANS, ls: 2 }) +
  playerBlock(188, '#C0392B', 'Ernie', 10, 11, 10) +
  playerBlock(316, ACC, 'Jack', 3, 4, 3) +
  playerBlock(444, '#C0392B', 'Phil', 10, 11, 10) +
  t(180, 600, 12.5, MUT2, 'Tap a player to add them to the card', { a: 'middle' }),
)

// ── 4. Leaderboard ──
const rows = [
  ['1', 'Ross', 32, 29, 33, 30, 124], ['2', 'Dave', 26, 33, 33, 29, 121],
  ['3', 'Jeff', 32, 32, 24, 32, 120], ['3', 'Mark', 27, 29, 31, 33, 120],
  ['5', 'Jack', 22, 31, 25, 29, 107], ['6', 'Matt', 19, 26, 31, 27, 103],
]
let table = ''
rows.forEach((r, i) => {
  const y = 296 + i * 46
  table += `<line x1="16" y1="${y - 28}" x2="344" y2="${y - 28}" stroke="${BORDER}"/>` +
    t(26, y, 11, MUT, r[0]) + t(44, y, 14.5, INK, r[1], { w: 700 })
  ;[2, 3, 4, 5].forEach((c, j) => {
    table += t(158 + j * 46, y, 15, INK, String(r[c]), { w: 700, a: 'middle' })
  })
  table += t(340, y, 15, INK, String(r[6]), { w: 700, a: 'end' })
})
const leaderboard = wrap(
  header('leaderboard') +
  `<rect x="16" y="56" width="150" height="32" rx="16" fill="${DEEP}"/>` +
  t(91, 77, 12.5, '#F6F4F0', 'Stableford Points', { w: 700, a: 'middle' }) +
  `<rect x="174" y="56" width="140" height="32" rx="16" fill="${SURF}" stroke="${BORDER}"/>` +
  t(244, 77, 12.5, MUT2, 'Team better ball', { a: 'middle' }) +
  card(16, 100, 328, 74) +
  t(30, 122, 13, INK, 'Stableford Points') +
  t(30, 140, 11, MUT2, 'One running total across the trip. Worst round') +
  t(30, 155, 11, MUT2, 'dropped. Played off 90% of course handicap.') +
  card(16, 186, 328, 384) +
  t(30, 212, 11.5, MUT2, 'Showing every round') +
  `<rect x="252" y="196" width="80" height="26" rx="13" fill="${SURF}" stroke="${BORDER}"/>` +
  t(292, 213, 9.5, MUT, 'DISCARD', { f: SANS, a: 'middle', ls: 1.2 }) +
  t(44, 254, 10.5, MUT, 'NAME', { f: SANS, ls: 1.5 }) +
  [1, 2, 3, 4].map((n, j) => t(158 + j * 46, 254, 10.5, MUT, String(n), { f: SANS, a: 'middle' })).join('') +
  t(340, 254, 10.5, MUT, 'TOT', { f: SANS, a: 'end', ls: 1 }) +
  table,
)

// ── 5. Matchplay bracket ──
function tie(x, y, w, top, topScore, bottom, botScore, opts = {}) {
  const h = 86
  const mid = y + h / 2
  const hl = opts.hl
  return card(x, y, w, h, hl ? { stroke: DEEP, so: 0.5, fill: TINT } : {}) +
    (hl ? `<rect x="${x + 8}" y="${y + 12}" width="3" height="24" rx="1.5" fill="${DEEP}"/>` : '') +
    `<line x1="${x + 10}" y1="${mid}" x2="${x + w - 10}" y2="${mid}" stroke="${BORDER}"/>` +
    (opts.seedTop ? t(x + 16, y + 28, 10, MUT, opts.seedTop) : '') +
    t(x + (opts.seedTop ? 32 : 16), y + 29, 14, hl ? DEEP : INK, top, { w: hl ? 700 : 400 }) +
    (topScore != null ? t(x + w - 14, y + 29, 13, hl ? DEEP : INK, String(topScore), { a: 'end' }) : '') +
    (opts.seedBot ? t(x + 16, y + 62, 10, MUT, opts.seedBot) : '') +
    (opts.byeBot
      ? t(x + 32, y + 63, 11, MUT, 'BYE', { f: SANS, ls: 2 })
      : t(x + (opts.seedBot ? 32 : 16), y + 63, 14, opts.tbd ? MUT : INK, bottom, { it: !!opts.tbd })) +
    (botScore != null ? t(x + w - 14, y + 63, 13, INK, String(botScore), { a: 'end' }) : '')
}
const elbow = (x1, y1, x2, y2) =>
  `<path d="M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}" stroke="rgba(74,55,40,0.25)" fill="none"/>`
const matchplay = wrap(
  header('green dot') +
  backBtn(16, 58) +
  t(180, 82, 20, INK, 'Matchplay', { w: 700, a: 'middle' }) +
  `<line x1="0" y1="106" x2="${W}" y2="106" stroke="${BORDER}"/>` +
  t(180, 140, 15, INK, 'Quarter-Final', { a: 'middle' }) +
  `<rect x="308" y="120" width="32" height="32" rx="10" fill="${SURF}" stroke="${BORDER}"/>` +
  `<path d="M321 128 L328 136 L321 144" stroke="${BARK}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
  tie(16, 170, 176, 'Ernie', 10, '', null, { seedTop: '1', byeBot: true }) +
  tie(16, 272, 176, 'Scottie', '4/1', 'Phil', 10, { seedTop: '4', seedBot: '5', hl: true }) +
  elbow(192, 213, 216, 264) + elbow(192, 315, 216, 264) +
  tie(216, 221, 128, 'Ernie', 10, 'Scottie', 6) +
  tie(16, 420, 176, 'Tiger', 8, '', null, { seedTop: '2', byeBot: true }) +
  tie(16, 522, 176, 'Rory', 0, 'Jack', 3, { seedTop: '3', seedBot: '6' }) +
  elbow(192, 463, 216, 514) + elbow(192, 565, 216, 514) +
  tie(216, 471, 128, 'Tiger', 8, 'To be decided', null, { tbd: true }) +
  `<rect x="160" y="640" width="24" height="5" rx="2.5" fill="${ACC}"/>` +
  `<circle cx="196" cy="642.5" r="2.5" fill="rgba(74,55,40,0.25)"/>` +
  `<circle cx="208" cy="642.5" r="2.5" fill="rgba(74,55,40,0.25)"/>`,
)

// ── 6. Stats hub ──
const statRow = (y, label, val, valC = INK) =>
  t(32, y, 11, MUT, label, { f: SANS, ls: 1.6 }) +
  t(328, y, 15, valC, String(val), { w: 700, a: 'end' }) +
  `<line x1="32" y1="${y + 12}" x2="328" y2="${y + 12}" stroke="${BORDER}"/>`
const stats = wrap(
  header('stats hub') +
  `<rect x="16" y="56" width="158" height="34" rx="10" fill="${DEEP}"/>` +
  t(95, 78, 13, '#F6F4F0', 'Players', { w: 700, a: 'middle' }) +
  `<rect x="186" y="56" width="158" height="34" rx="10" fill="${SURF}" stroke="${BORDER}"/>` +
  t(265, 78, 13, MUT2, 'Courses', { a: 'middle' }) +
  `<rect x="16" y="102" width="82" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(57, 120, 12, MUT2, 'Everyone', { a: 'middle' }) +
  `<rect x="106" y="102" width="56" height="28" rx="14" fill="${DEEP}"/>` +
  t(134, 120, 12, '#F6F4F0', 'You', { w: 700, a: 'middle' }) +
  `<rect x="170" y="102" width="60" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(200, 120, 12, MUT2, 'Dave', { a: 'middle' }) +
  `<rect x="238" y="102" width="58" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(267, 120, 12, MUT2, 'Jack', { a: 'middle' }) +
  card(16, 142, 328, 46) +
  t(32, 162, 10, MUT, 'COURSES', { f: SANS, ls: 1.6 }) +
  t(32, 179, 13.5, INK, 'All courses', { w: 700 }) +
  t(300, 172, 12, MUT2, '4 rounds', { a: 'end' }) +
  card(16, 202, 328, 224) +
  t(32, 232, 16, INK, 'Scoring', { w: 700 }) +
  t(32, 251, 11.5, MUT2, 'Every scored hole, against your own par.') +
  statRow(284, 'BIRDIES', 2, DEEP) +
  statRow(320, 'PARS', 27) +
  statRow(356, 'BOGEYS', 25) +
  statRow(392, 'DOUBLES OR WORSE', 18) +
  card(16, 440, 328, 156) +
  t(32, 470, 16, INK, 'Strokes gained', { w: 700 }) +
  `<rect x="216" y="454" width="60" height="28" rx="14" fill="${TINT}" stroke="${DEEP}"/>` +
  t(246, 472, 12, DEEP, 'Gross', { a: 'middle' }) +
  `<rect x="284" y="454" width="48" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(308, 472, 12, MUT2, 'Net', { a: 'middle' }) +
  statRow(512, 'TO THE GREEN', 5, DEEP) +
  statRow(548, 'PUTTING', 2, DEEP),
)

// ── 7. Trip setup ──
const setup = wrap(
  header('settings') +
  card(16, 58, 328, 66) +
  `<rect x="28" y="72" width="30" height="30" rx="8" fill="${CREAM}"/>` +
  `<circle cx="43" cy="87" r="3" stroke="${BARK}" stroke-width="1.6" fill="none"/>` +
  `<circle cx="43" cy="87" r="6.2" stroke="${BARK}" stroke-width="1.6" fill="none" stroke-dasharray="2.4 2.1"/>` +
  t(70, 82, 14.5, INK, 'Trip Settings', { w: 700 }) +
  t(70, 100, 11.5, MUT2, 'Name, dates, itinerary and stats —') +
  t(70, 115, 11.5, MUT2, 'leaderboards are below') +
  t(330, 96, 14, MUT, '›', { a: 'end' }) +
  card(16, 138, 328, 452) +
  t(32, 168, 12.5, DEEP, 'LEADERBOARDS', { f: SANS, w: 700, ls: 2 }) +
  t(32, 188, 11.5, MUT2, 'Choose your Competition Leaderboards. Add as') +
  t(32, 203, 11.5, MUT2, 'many formats as you like.') +
  card(30, 218, 300, 128) +
  t(44, 246, 17, INK, 'Stableford Points', { w: 700 }) +
  `<rect x="44" y="256" width="74" height="20" rx="10" fill="rgba(10,157,86,0.16)"/>` +
  t(81, 270, 9.5, DEEP, 'PRIMARY', { f: SANS, w: 600, a: 'middle', ls: 1.2 }) +
  t(44, 296, 11, MUT2, "Stableford points. Man's greatest achievement.") +
  t(44, 311, 11, MUT2, 'One running total across the trip. Worst round') +
  t(44, 326, 11, MUT2, 'dropped. Played off 90% of course handicap.') +
  card(30, 360, 300, 104) +
  t(44, 388, 17, INK, 'Team better ball', { w: 700 }) +
  t(44, 410, 11, MUT2, "A composite card: the team's best score on") +
  t(44, 425, 11, MUT2, 'every hole, and everyone counts on the last 3.') +
  card(30, 478, 300, 96) +
  t(44, 506, 17, INK, 'Matchplay knockout', { w: 700 }) +
  t(44, 528, 11, MUT2, 'A seeded singles draw. Quarter-finals through') +
  t(44, 543, 11, MUT2, 'to the final, settled from the cards.'),
)

mkdirSync('public/intro', { recursive: true })
const files = { hub, scoring, scorecard, leaderboard, matchplay, stats, setup }
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(`public/intro/${name}.svg`, svg)
  console.log(name, svg.length, 'bytes')
}
