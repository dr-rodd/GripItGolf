// Generates the site intro's five example screens as tiny SVGs —
// hand-traced from real greendot.live screenshots supplied by Big Dog.
// Output: public/intro/*.svg in the repo.
import { writeFileSync, mkdirSync } from 'fs'

const W = 360, H = 585
const CREAM = '#F6F4F0', SURF = '#FFFFFF', INK = '#2B2118', BARK = '#4A3728'
const ACC = '#0A9D56', DEEP = '#0A6B3C'
const BORDER = 'rgba(74,55,40,0.14)', MUT = 'rgba(43,33,24,0.55)', MUT2 = 'rgba(43,33,24,0.75)'
const SANS = `-apple-system,'Segoe UI',system-ui,sans-serif`
const SERIF = `Georgia,'Times New Roman',serif`

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// ── shared chrome ──
function header(title) {
  // The wordmark-ish page title: bold lowercase sans in the brown, closed
  // by the emerald dot, like the real generated marks.
  const tw = title.length * 12.5
  return `<rect width="${W}" height="44" fill="${CREAM}"/>` +
    `<text x="16" y="30" font-family="${SANS}" font-size="21" font-weight="700" fill="${BARK}" letter-spacing="-0.5">${esc(title)}</text>` +
    `<circle cx="${20 + tw}" cy="29" r="3.6" fill="${ACC}"/>` +
    `<line x1="0" y1="44" x2="${W}" y2="44" stroke="${BORDER}"/>`
}

const TABS = [
  ['Home', 'home'], ['Scoring', 'clip'], ['Leaderboard', 'cup'], ['Stats', 'bars'], ['Trip Setup', 'gear'],
]
function icon(kind, cx, cy, c) {
  const s = `stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"`
  switch (kind) {
    case 'home': return `<path d="M${cx - 6} ${cy + 1} L${cx} ${cy - 5} L${cx + 6} ${cy + 1} M${cx - 4} ${cy} V${cy + 6} H${cx + 4} V${cy}" ${s}/>`
    case 'clip': return `<rect x="${cx - 5}" y="${cy - 6}" width="10" height="12" rx="2" ${s}/><line x1="${cx - 2.5}" y1="${cy - 2}" x2="${cx + 2.5}" y2="${cy - 2}" ${s}/><line x1="${cx - 2.5}" y1="${cy + 1.5}" x2="${cx + 2.5}" y2="${cy + 1.5}" ${s}/>`
    case 'cup': return `<path d="M${cx - 4.5} ${cy - 6} H${cx + 4.5} V${cy - 2} A4.5 4.5 0 0 1 ${cx - 4.5} ${cy - 2} Z M${cx} ${cy + 2.5} V${cy + 5} M${cx - 3.5} ${cy + 6} H${cx + 3.5}" ${s}/>`
    case 'bars': return `<path d="M${cx - 5.5} ${cy + 6} V${cy - 1} M${cx} ${cy + 6} V${cy - 6} M${cx + 5.5} ${cy + 6} V${cy - 3}" ${s}/>`
    case 'gear': return `<circle cx="${cx}" cy="${cy}" r="3" ${s}/><circle cx="${cx}" cy="${cy}" r="6.2" ${s} stroke-dasharray="2.4 2.1"/>`
  }
}
function tabbar(activeIdx) {
  let out = `<rect y="${H - 52}" width="${W}" height="52" fill="${SURF}"/>` +
    `<line x1="0" y1="${H - 52}" x2="${W}" y2="${H - 52}" stroke="${BORDER}"/>`
  TABS.forEach(([label, kind], i) => {
    const cx = 36 + i * 72
    const c = i === activeIdx ? ACC : 'rgba(74,55,40,0.6)'
    out += icon(kind, cx, H - 34, c)
    out += `<text x="${cx}" y="${H - 12}" text-anchor="middle" font-family="${SANS}" font-size="8.5" font-weight="${i === activeIdx ? 600 : 400}" fill="${c}">${esc(label)}</text>`
  })
  return out
}
const card = (x, y, w, h, r = 12) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${SURF}" stroke="${BORDER}"/>`
const t = (x, y, size, fill, txt, { w = 400, f = SERIF, a = 'start', ls = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${f}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${a}"${ls ? ` letter-spacing="${ls}"` : ''}>${esc(txt)}</text>`

const wrap = body =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
  `<rect width="${W}" height="${H}" fill="${CREAM}"/>${body}</svg>`

// ── 1. Trip hub ──
const hub = wrap(
  header('green dot') +
  // Share trip / QR row
  `<rect x="70" y="58" width="110" height="30" rx="15" fill="${SURF}" stroke="${BARK}" stroke-opacity="0.4"/>` +
  t(125, 77, 12.5, INK, 'Share trip', { w: 700, f: SERIF, a: 'middle' }) +
  t(230, 77, 12.5, DEEP, 'QR code', { f: SERIF }) +
  // status card
  card(16, 100, 328, 118) +
  t(32, 130, 16, INK, 'Rory', { w: 700 }) +
  t(328, 129, 10, MUT, 'NOT YOU?', { f: SANS, a: 'end', ls: 1.2 }) +
  `<line x1="32" y1="142" x2="328" y2="142" stroke="${BORDER}"/>` +
  t(50, 163, 10.5, MUT, "THAT'S THE TRIP", { f: SANS, ls: 1.4 }) +
  t(50, 181, 12, MUT2, 'Every round is in. The leaderboard is final.') +
  `<line x1="32" y1="192" x2="328" y2="192" stroke="${BORDER}"/>` +
  t(32, 210, 12, INK, 'Plays Jack · Quarter-Final') +
  // itinerary
  t(16, 258, 22, INK, 'Your Itinerary', { w: 700 }) +
  t(16, 280, 11.5, MUT2, 'Tap a course card for current weather and course') +
  t(16, 295, 11.5, MUT2, 'details.') +
  t(16, 322, 12, INK, 'THURSDAY, 20 AUGUST', { f: SANS, w: 700, ls: 1.6 }) +
  t(100, 347, 11.5, MUT2, 'Dublin to Carne   4 hr drive') +
  card(16, 362, 328, 78) +
  t(60, 390, 14, INK, 'Carne Golf Links -- Wild', { w: 700 }) +
  t(60, 408, 14, INK, 'Atlantic Dunes', { w: 700 }) +
  t(60, 427, 11.5, MUT2, '2 tee times from 1:00 pm') +
  `<rect x="28" y="378" width="22" height="22" rx="5" fill="${CREAM}"/>` +
  `<path d="M36 396 V384 L44 386 L36 389" stroke="${BARK}" stroke-width="1.4" fill="none" stroke-linejoin="round"/>` +
  tabbar(0),
)

// ── 2. Scoring: choose a round ──
function roundCard(y, n, course, place) {
  return card(16, y, 328, 74) +
    t(32, y + 24, 10.5, MUT, `ROUND ${n}`, { f: SANS, ls: 2 }) +
    t(32, y + 45, 15, INK, course) +
    t(32, y + 63, 11.5, MUT2, `${place} · No scores yet`)
}
const scoring = wrap(
  header('scoring') +
  t(16, 78, 11, MUT, 'CHOOSE A ROUND', { f: SANS, ls: 2 }) +
  `<rect x="228" y="58" width="116" height="30" rx="15" fill="${SURF}"/>` +
  t(286, 77, 12.5, INK, '+ Add round', { w: 700, a: 'middle' }) +
  roundCard(102, 1, 'Carne Golf Links -- Wild Atlan…', 'Belmullet, Mayo') +
  roundCard(188, 2, 'Carne Golf Links -- Wild Atlan…', 'Belmullet, Mayo') +
  roundCard(274, 3, 'County Sligo Golf Club -- Colt…', 'Rosses Point, Sligo') +
  roundCard(360, 4, 'Ballyliffin Golf Club -- Old Links', 'Ballyliffin, Donegal') +
  card(16, 446, 328, 74).replace('height="74"', 'height="60"') +
  t(32, 470, 10.5, MUT, 'ROUND 5', { f: SANS, ls: 2 }) +
  t(32, 491, 15, INK, 'Portsalon Golf Club') +
  tabbar(1),
)

// ── 3. Leaderboard ──
const rows = [
  ['1', 'Ross', 32, 29, 33, 30, 124], ['2', 'Dave', 26, 33, 33, 29, 121],
  ['3', 'Jeff', 32, 32, 24, 32, 120], ['3', 'Mark', 27, 29, 31, 33, 120],
  ['5', 'Jack', 22, 31, 25, 29, 107], ['6', 'Matt', 19, 26, 31, 27, 103],
]
let table = ''
rows.forEach((r, i) => {
  const y = 284 + i * 36
  table += `<line x1="16" y1="${y - 23}" x2="344" y2="${y - 23}" stroke="${BORDER}"/>` +
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
  card(16, 186, 328, 314) +
  t(30, 212, 11.5, MUT2, 'Showing every round') +
  `<rect x="252" y="196" width="80" height="26" rx="13" fill="${SURF}" stroke="${BORDER}"/>` +
  t(292, 213, 9.5, MUT, 'DISCARD', { f: SANS, a: 'middle', ls: 1.2 }) +
  t(44, 249, 10.5, MUT, 'NAME', { f: SANS, ls: 1.5 }) +
  [1, 2, 3, 4].map((n, j) => t(158 + j * 46, 249, 10.5, MUT, String(n), { f: SANS, a: 'middle' })).join('') +
  t(340, 249, 10.5, MUT, 'TOT', { f: SANS, a: 'end', ls: 1 }) +
  table +
  tabbar(2),
)

// ── 4. Stats hub ──
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
  // chips
  `<rect x="16" y="100" width="82" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(57, 118, 12, MUT2, 'Everyone', { a: 'middle' }) +
  `<rect x="106" y="100" width="56" height="28" rx="14" fill="${DEEP}"/>` +
  t(134, 118, 12, '#F6F4F0', 'You', { w: 700, a: 'middle' }) +
  `<rect x="170" y="100" width="60" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(200, 118, 12, MUT2, 'Dave', { a: 'middle' }) +
  `<rect x="238" y="100" width="58" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(267, 118, 12, MUT2, 'Jack', { a: 'middle' }) +
  card(16, 140, 328, 46) +
  t(32, 160, 10, MUT, 'COURSES', { f: SANS, ls: 1.6 }) +
  t(32, 177, 13.5, INK, 'All courses', { w: 700 }) +
  t(300, 170, 12, MUT2, '4 rounds', { a: 'end' }) +
  card(16, 198, 328, 200) +
  t(32, 226, 16, INK, 'Scoring', { w: 700 }) +
  t(32, 245, 11.5, MUT2, 'Every scored hole, against your own par.') +
  statRow(276, 'BIRDIES', 2, DEEP) +
  statRow(310, 'PARS', 27) +
  statRow(344, 'BOGEYS', 25) +
  statRow(378, 'DOUBLES OR WORSE', 18) +
  card(16, 410, 328, 70) +
  t(32, 440, 16, INK, 'Strokes gained', { w: 700 }) +
  `<rect x="216" y="424" width="60" height="28" rx="14" fill="rgba(10,157,86,0.12)" stroke="${DEEP}"/>` +
  t(246, 442, 12, DEEP, 'Gross', { a: 'middle' }) +
  `<rect x="284" y="424" width="48" height="28" rx="14" fill="${SURF}" stroke="${BORDER}"/>` +
  t(308, 442, 12, MUT2, 'Net', { a: 'middle' }) +
  tabbar(3),
)

// ── 5. Trip setup ──
const setup = wrap(
  header('settings') +
  card(16, 58, 328, 66) +
  `<rect x="28" y="72" width="30" height="30" rx="8" fill="${CREAM}"/>` +
  icon('gear', 43, 87, BARK) +
  t(70, 82, 14.5, INK, 'Trip Settings', { w: 700 }) +
  t(70, 100, 11.5, MUT2, 'Name, dates, itinerary and stats —') +
  t(70, 115, 11.5, MUT2, 'leaderboards are below') +
  t(330, 96, 14, MUT, '›', { a: 'end' }) +
  card(16, 138, 328, 336) +
  t(32, 166, 12.5, DEEP, 'LEADERBOARDS', { f: SANS, w: 700, ls: 2 }) +
  t(32, 186, 11.5, MUT2, 'Choose your Competition Leaderboards. Add as') +
  t(32, 201, 11.5, MUT2, 'many formats as you like.') +
  card(30, 214, 300, 118) +
  t(44, 242, 17, INK, 'Stableford Points', { w: 700 }) +
  `<rect x="44" y="252" width="74" height="20" rx="10" fill="rgba(10,157,86,0.16)"/>` +
  t(81, 266, 9.5, DEEP, 'PRIMARY', { f: SANS, w: 600, a: 'middle', ls: 1.2 }) +
  t(44, 290, 11, MUT2, "Stableford points. Man's greatest achievement.") +
  t(44, 305, 11, MUT2, 'One running total across the trip. Worst round') +
  t(44, 320, 11, MUT2, 'dropped. Played off 90% of course handicap.') +
  card(30, 344, 300, 96) +
  t(44, 372, 17, INK, 'Team better ball', { w: 700 }) +
  t(44, 394, 11, MUT2, "A composite card: the team's best score on") +
  t(44, 409, 11, MUT2, 'every hole, and everyone counts on the last 3.') +
  tabbar(4),
)

mkdirSync('public/intro', { recursive: true })
for (const [name, svg] of Object.entries({ hub, scoring, leaderboard, stats, setup })) {
  writeFileSync(`public/intro/${name}.svg`, svg)
  console.log(name, svg.length, 'bytes')
}
