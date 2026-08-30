// Generates the site intro's example screens as tiny SVGs — hand-traced
// from real greendot.live screenshots supplied by Big Dog. Run with
// `npm run intro:shots`; output lands in public/intro/.
//
// Shape: 360x728 including each page's OWN tab bar (below TAB_TOP), the
// described tab lit — the intro shows the whole artboard as a floating
// card, so nothing is cropped and no viewport band rules apply any
// more. Two things still hold: content stays above TAB_TOP, and
// ART_W/ART_H in SiteIntro.tsx must match W/H here, since the card's
// aspect and its `focus` ring coordinates are these units.
import { writeFileSync, mkdirSync } from 'fs'

const W = 360, H = 728
const TAB_TOP = 664
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

// ── The tab bar every card carries — five tabs, the described one lit,
//    mirroring the real bar in app/components/TabBar.tsx. ──
function icon(key, cx, cy, c) {
  const s = `stroke="${c}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"`
  switch (key) {
    case 'home':
      return `<path d="M${cx - 8} ${cy + 2} L${cx} ${cy - 7} L${cx + 8} ${cy + 2} M${cx - 5.5} ${cy} V${cy + 8} H${cx + 5.5} V${cy}" ${s}/>`
    case 'scoring':
      return `<rect x="${cx - 6.5}" y="${cy - 8}" width="13" height="16" rx="2.5" ${s}/>` +
        `<rect x="${cx - 3}" y="${cy - 10}" width="6" height="4" rx="1.5" fill="${c}"/>` +
        `<path d="M${cx - 3} ${cy} H${cx + 3} M${cx - 3} ${cy + 4} H${cx + 3}" ${s}/>`
    case 'leaderboard':
      return `<path d="M${cx - 6} ${cy - 8} H${cx + 6} V${cy - 3} A6 6 0 0 1 ${cx - 6} ${cy - 3} Z M${cx} ${cy + 3} V${cy + 6} M${cx - 4} ${cy + 7} H${cx + 4}" ${s}/>`
    case 'stats':
      return `<path d="M${cx - 7} ${cy + 8} V${cy + 1} M${cx} ${cy + 8} V${cy - 7} M${cx + 7} ${cy + 8} V${cy - 2}" stroke="${c}" stroke-width="3" stroke-linecap="round" fill="none"/>`
    case 'settings':
      return `<circle cx="${cx}" cy="${cy}" r="3" ${s}/>` +
        `<circle cx="${cx}" cy="${cy}" r="7" stroke="${c}" stroke-width="1.7" fill="none" stroke-dasharray="2.6 2.3"/>`
  }
  return ''
}
function tabbar(active) {
  const tabs = [
    ['home', 'Home', 38],
    ['scoring', 'Scoring', 109],
    ['leaderboard', 'Leaderboard', 180],
    ['stats', 'Stats', 251],
    ['settings', 'Trip Setup', 322],
  ]
  let out = `<rect x="0" y="${TAB_TOP}" width="${W}" height="${H - TAB_TOP}" fill="${SURF}"/>` +
    `<line x1="0" y1="${TAB_TOP}" x2="${W}" y2="${TAB_TOP}" stroke="${BORDER}"/>`
  for (const [key, label, cx] of tabs) {
    const on = key === active
    if (on) out += `<circle cx="${cx}" cy="${TAB_TOP + 26}" r="17" fill="${TINT}"/>`
    out += icon(key, cx, TAB_TOP + 26, on ? DEEP : MUT)
    out += t(cx, TAB_TOP + 56, 8.5, on ? DEEP : MUT, label, { f: SANS, a: 'middle', w: on ? 700 : 400 })
  }
  return out
}

const wrap = (body, tab) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
  `<rect width="${W}" height="${H}" fill="${CREAM}"/>${body}${tabbar(tab)}</svg>`

// ── 1. Trip hub — rings: the itinerary heading and a golf card. ──
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
  t(16, 360, 22, INK, 'Your Itinerary', { w: 700 }) +
  t(16, 381, 11.5, MUT2, 'Tap a course card for weather and course details.') +
  t(16, 410, 12, INK, 'THURSDAY, 20 AUGUST', { f: SANS, w: 700, ls: 1.6 }) +
  t(104, 431, 11.5, MUT2, 'Dublin to Carne  ·  4 hr drive') +
  card(16, 442, 328, 70) +
  `<rect x="28" y="456" width="22" height="22" rx="5" fill="${CREAM}"/>` +
  `<path d="M36 474 V462 L44 464 L36 467" stroke="${BARK}" stroke-width="1.4" fill="none" stroke-linejoin="round"/>` +
  t(60, 468, 14, INK, 'Carne Golf Links -- Wild Atlantic…', { w: 700 }) +
  t(60, 488, 11.5, MUT2, '2 tee times from 1:00 pm') +
  t(16, 550, 12, INK, 'FRIDAY, 21 AUGUST', { f: SANS, w: 700, ls: 1.6 }),
 'home')

// ── 2. Scoring: choose a round — ring: Round 1. No emerald border of
//      its own: the intro's ring is the only box, so the live dot and
//      the "In play" line carry the in-play state here. ──
function roundCard(y, n, course, place, live = false) {
  return card(16, y, 328, 74) +
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
  roundCard(96, 1, 'Carne Golf Links -- Wild Atlan…', 'Belmullet, Mayo, Ireland', true) +
  roundCard(184, 2, 'Carne Golf Links -- Wild Atlan…', 'Belmullet, Mayo, Ireland') +
  roundCard(272, 3, 'County Sligo Golf Club -- Colt…', 'Rosses Point, Sligo, Ireland') +
  roundCard(360, 4, 'Ballyliffin Golf Club -- Old Links', 'Ballyliffin, Donegal, Ireland') +
  roundCard(448, 5, 'Portsalon Golf Club', 'Portsalon, Donegal, Ireland'),
 'scoring')

// ── 3. Scoring: the scorecard — rings: Jack's block and his playing-
//      handicap line. Ernie sits above, unringed. ──
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
  playerBlock(190, '#C0392B', 'Ernie', 10, 11, 10) +
  playerBlock(348, ACC, 'Jack', 3, 4, 3),
 'scoring')

// ── 4. Leaderboard — rings: the board tabs and the description card;
//      the table below is scenery. ──
const rows = [
  ['1', 'Ross', 32, 29, 33, 30, 124], ['2', 'Dave', 26, 33, 33, 29, 121],
  ['3', 'Jeff', 32, 32, 24, 32, 120], ['3', 'Mark', 27, 29, 31, 33, 120],
  ['5', 'Jack', 22, 31, 25, 29, 107], ['6', 'Matt', 19, 26, 31, 27, 103],
]
let table = ''
rows.forEach((r, i) => {
  const y = 296 + i * 42
  table += `<line x1="16" y1="${y - 26}" x2="344" y2="${y - 26}" stroke="${BORDER}"/>` +
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
 'leaderboard')

// ── 5. Matchplay bracket — ring: the live tie. ──
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
  t(180, 138, 15, INK, 'Quarter-Final', { a: 'middle' }) +
  `<rect x="308" y="118" width="32" height="32" rx="10" fill="${SURF}" stroke="${BORDER}"/>` +
  `<path d="M321 126 L328 134 L321 142" stroke="${BARK}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
  tie(16, 162, 176, 'Ernie', 10, '', null, { seedTop: '1', byeBot: true }) +
  tie(16, 348, 176, 'Scottie', '4/1', 'Phil', 10, { seedTop: '4', seedBot: '5', hl: true }) +
  elbow(192, 205, 216, 298) + elbow(192, 391, 216, 298) +
  tie(216, 255, 128, 'Ernie', 10, 'Scottie', 6) +
  tie(16, 470, 176, 'Tiger', 8, '', null, { seedTop: '2', byeBot: true }) +
  tie(16, 572, 176, 'Rory', 0, 'Jack', 3, { seedTop: '3', seedBot: '6' }) +
  elbow(192, 513, 216, 564) + elbow(192, 615, 216, 564) +
  tie(216, 521, 128, 'Tiger', 8, 'To be decided', null, { tbd: true }),
 'leaderboard')

// ── 6. Stats hub — rings: the player chips and the strokes-gained
//      panel. ──
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
  card(16, 200, 328, 128) +
  t(32, 228, 16, INK, 'Scoring', { w: 700 }) +
  t(32, 247, 11.5, MUT2, 'Every scored hole, against your own par.') +
  statRow(280, 'BIRDIES', 2, DEEP) +
  statRow(312, 'PARS', 27) +
  card(16, 380, 328, 132) +
  t(32, 410, 16, INK, 'Strokes gained', { w: 700 }) +
  `<rect x="216" y="394" width="60" height="28" rx="14" fill="${TINT}" stroke="${DEEP}"/>` +
  t(246, 412, 12, DEEP, 'Gross', { a: 'middle' }) +
  `<rect x="284" y="394" width="48" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(308, 412, 12, MUT2, 'Net', { a: 'middle' }) +
  statRow(448, 'TO THE GREEN', 5, DEEP) +
  statRow(484, 'PUTTING', 2, DEEP),
 'stats')

// ── 7. Trip setup — rings: Trip Settings and the Stableford card. ──
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
  card(16, 140, 328, 450) +
  t(32, 168, 12.5, DEEP, 'LEADERBOARDS', { f: SANS, w: 700, ls: 2 }) +
  t(32, 188, 11.5, MUT2, 'Choose your Competition Leaderboards. Add as') +
  t(32, 203, 11.5, MUT2, 'many formats as you like.') +
  card(30, 348, 300, 130) +
  t(44, 376, 17, INK, 'Stableford Points', { w: 700 }) +
  `<rect x="44" y="386" width="74" height="20" rx="10" fill="rgba(10,157,86,0.16)"/>` +
  t(81, 400, 9.5, DEEP, 'PRIMARY', { f: SANS, w: 600, a: 'middle', ls: 1.2 }) +
  t(44, 426, 11, MUT2, "Stableford points. Man's greatest achievement.") +
  t(44, 441, 11, MUT2, 'One running total across the trip. Worst round') +
  t(44, 456, 11, MUT2, 'dropped. Played off 90% of course handicap.') +
  card(30, 492, 300, 96) +
  t(44, 520, 17, INK, 'Team better ball', { w: 700 }) +
  t(44, 542, 11, MUT2, "A composite card: the team's best score on") +
  t(44, 557, 11, MUT2, 'every hole, and everyone counts on the last 3.'),
 'settings')

mkdirSync('public/intro', { recursive: true })
const files = { hub, scoring, scorecard, leaderboard, matchplay, stats, setup }
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(`public/intro/${name}.svg`, svg)
  console.log(name, svg.length, 'bytes')
}
