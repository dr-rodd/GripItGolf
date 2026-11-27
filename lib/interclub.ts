/**
 * Interclub — reading the national inter-club draws, the only copy of the
 * rules (Ross, 27 Nov 2026; docs/interclub.md, stage 1).
 *
 * Golf Ireland publishes every inter-club competition's draw on a Golf
 * Genius site: a hub (`/pages/12071759943296907291`) with a tab a province,
 * each tab a dropdown of competitions, each competition its own small site
 * whose "Draw / Latest Results" page is **a spreadsheet pasted in as an HTML
 * table**. Nothing there is data: the bracket lives in the table's layout —
 * a row per first-round place, a column per round, each later round's cell
 * spanning 2, 4, 8… rows — and every cell is typed by hand ("Ballinrobe (H)
 * 3.5", "Team 12 BYE", "Laytown Bettystown .(A )4 H", "Rockmount [H] - 6").
 *
 * So everything here is forgiving, and **a draw it cannot read is said to
 * be unreadable, never guessed at**: the page links to the original. Pure —
 * no fetching (`app/interclub/source.ts` does that), so `test:interclub`
 * runs it on saved copies of the real pages.
 *
 * What is never taken off a draw: the convenor's name, email and phone. They
 * are a volunteer's own details, published for team captains, and Green Dot
 * has no reason to copy them.
 */

// ─── Where things are ──────────────────────────────────────────

export const GOLF_GENIUS = 'https://www.golfgenius.com'
/** The 2026 inter-club hub, as linked from Golf Ireland's own site. */
export const INTERCLUB_HUB = `${GOLF_GENIUS}/pages/12071759943296907291`

/** The provinces, each one the hub's tab and its dropdown widget. */
export const PROVINCES = [
  { key: 'connacht', name: 'Connacht', widgetPage: '12671072698546288706' },
  { key: 'leinster', name: 'Leinster', widgetPage: '12671054921777313857' },
  { key: 'munster', name: 'Munster', widgetPage: '12670992333064403008' },
  { key: 'ulster', name: 'Ulster', widgetPage: '12669037533796005893' },
] as const
export type ProvinceKey = typeof PROVINCES[number]['key']

/** The hub's league, under which its widgets are served. */
export const HUB_LEAGUE = '12071744588218398734'

export function provinceOf(key: string): typeof PROVINCES[number] | null {
  return PROVINCES.find(p => p.key === key) ?? null
}

/** A widget's own address — what the hub and each competition page load in a frame. */
export function widgetUrl(league: string, page: string): string {
  return `${GOLF_GENIUS}/leagues/${league}/widgets/text_pages?page_id=${page}&shared=false`
}

export function siteUrl(id: string): string {
  return `${GOLF_GENIUS}/websites/${id}`
}

export function pageUrl(id: string): string {
  return `${GOLF_GENIUS}/pages/${id}`
}

// ─── Reading HTML without a parser ─────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
  rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…',
}

/** HTML entities decoded and every run of whitespace (the pages' &nbsp; included) one space. */
export function textOf(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : m
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/[\s ​]+/g, ' ')
    .trim()
}

/** Scripts and styles out, so nothing inside them is read as the page. */
function withoutCode(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
}

// ─── The competitions ──────────────────────────────────────────

export type Competition = {
  /** The competition's Golf Genius site. */
  id: string
  name: string
  province: ProvinceKey
  /** Its address here: unique in its province. */
  slug: string
}

/** "AIG Men’s Junior Cup (Ulster North)" → "aig-mens-junior-cup-ulster-north" */
export function slugOf(name: string): string {
  return name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * A province's competitions, off its dropdown: every option whose value is
 * a competition's site. A name twice in one province (it has not happened)
 * keeps both, the second with its site's id on its slug.
 */
export function readCompetitionList(html: string, province: ProvinceKey): Competition[] {
  const out: Competition[] = []
  const slugs = new Set<string>()
  const ids = new Set<string>()
  // The real dropdown never closes its options: each one's name runs to the next tag.
  const options = /<option[^>]*value=(["'])([^"']*)\1[^>]*>([^<]*)/gi
  for (const m of withoutCode(html).matchAll(options)) {
    const id = m[2].match(/\/websites\/(\d+)/)?.[1]
    const name = textOf(m[3])
    if (!id || !name || ids.has(id)) continue
    ids.add(id)
    let slug = slugOf(name) || id
    if (slugs.has(slug)) slug = `${slug}-${id}`
    slugs.add(slug)
    out.push({ id, name, province, slug })
  }
  return out
}

// ─── A competition's own site ──────────────────────────────────

export type SitePage = { id: string; name: string }

/**
 * The pages a competition's site lists in its menu, once each, in order.
 * The draw is usually "Draw / Latest Results"; some call it "Match Play
 * Stage"; a few have no draw page at all (a stroke-play qualifier first).
 */
export function readSitePages(html: string): SitePage[] {
  const out: SitePage[] = []
  const seen = new Set<string>()
  for (const m of withoutCode(html).matchAll(/<a[^>]*href=["']\/pages\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = textOf(m[2])
    if (!name || seen.has(m[1])) continue
    seen.add(m[1])
    out.push({ id: m[1], name })
  }
  return out
}

/** Which of a site's pages holds its draw, or null. */
export function drawPageOf(pages: SitePage[]): SitePage | null {
  const tests = [/\bdraw\b/i, /match\s*play/i, /latest results/i]
  for (const t of tests) {
    const hit = pages.find(p => t.test(p.name) && !/prize|info|rules|dress|pin|captain/i.test(p.name))
    if (hit) return hit
  }
  return null
}

export type PageWidget =
  | { kind: 'table'; url: string }
  /** A picture of the draw, a stroke-play results table, or anything else: shown on Golf Ireland's site only. */
  | { kind: 'elsewhere'; what: 'picture' | 'results' | 'other' }

/** What a page loads in its frame — a pasted table, or something read only there. */
export function readPageWidget(html: string): PageWidget {
  const found = [...html.matchAll(/https:\/\/www\.golfgenius\.com\/leagues\/(\d+)\/widgets\/([a-z_]+)\?page_id=(\d+)/g)]
  const text = found.find(m => m[2] === 'text_pages')
  if (text) return { kind: 'table', url: widgetUrl(text[1], text[3]) }
  if (found.some(m => m[2] === 'images')) return { kind: 'elsewhere', what: 'picture' }
  if (found.some(m => /results/.test(m[2]))) return { kind: 'elsewhere', what: 'results' }
  return { kind: 'elsewhere', what: 'other' }
}

// ─── The table ─────────────────────────────────────────────────

type Cell = { text: string; row: number; col: number; rowSpan: number }

/**
 * The table as a grid: `grid[r][c]` is the cell covering that place, a cell
 * spanning rows or columns standing in every place it covers — the browser's
 * own layout, so a cell lands in the column the reader sees it in.
 */
export function tableGrid(tableHtml: string): Cell[][] {
  const grid: Cell[][] = []
  const rows = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => m[0])
  rows.forEach((row, r) => {
    grid[r] ??= []
    let c = 0
    for (const m of row.matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      while (grid[r][c]) c++
      const attrs = m[2]
      const rowSpan = Math.max(1, Math.min(256, Number(attrs.match(/rowspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1)))
      const colSpan = Math.max(1, Math.min(32, Number(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1)))
      const cell: Cell = { text: textOf(m[3]), row: r, col: c, rowSpan }
      for (let dr = 0; dr < rowSpan; dr++) {
        grid[r + dr] ??= []
        for (let dc = 0; dc < colSpan; dc++) grid[r + dr][c + dc] = cell
      }
      c += colSpan
    }
  })
  // A cell spanning past the last row speaks for rows that do not exist.
  grid.length = Math.min(grid.length, rows.length)
  return grid
}

/** The largest table on the page: the draw, where there is one. */
export function drawTable(html: string): string | null {
  const tables = [...withoutCode(html).matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0])
  if (tables.length === 0) return null
  return tables.reduce((a, b) => (b.length > a.length ? b : a))
}

// ─── A cell ────────────────────────────────────────────────────

export type DrawSide = {
  /** The club as written, tidied ("Team 3", the markers and the score taken off). */
  name: string
  /** Who it is across the draw — lower case, letters only, "county" read as "co". */
  key: string
  bye: boolean
  home: boolean
  away: boolean
  /** Its score in this round's match, as written: "2½", "3", "6 Hole". */
  score: string | null
  /** Marked as having gone to a playoff (P/O). */
  playoff: boolean
  /** Disqualified, withdrawn or conceded — out of the match whatever else it says. */
  out: boolean
  /** Marked the winner in words: "W", "Won", or settled on an extra hole ("19th", "Tie Hole", "xtr"). */
  won: boolean
}

/**
 * Who a club is, however the draw spelt it this time: its words, lower case,
 * "County" read as "Co", "and", "&", "Golf Club" and every mark dropped —
 * "St. Anne’s" and "St Annes" are both "st annes".
 */
export function clubKey(name: string): string {
  return name
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’‘.]/g, '')
    .replace(/^the\s+/, '')
    .replace(/\bcounty\b/g, 'co')
    .replace(/&|\band\b|\bgolf club\b|\bgc\b/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

/** Words a club's name may carry or drop without being another club: "Belvoir" is "Belvoir Park". */
const FILLER = new Set(['park', 'golf', 'club', 'links'])

/**
 * Two spellings of one club: the same words (spaces aside — "Ballybofey
 * Stranorlar"), or one the other with filler words after it. Never a mere
 * stem: Galway and Galway Bay are two clubs, and so are Cork and Co. Cork.
 */
export function sameClub(x: string, y: string): boolean {
  if (!x || !y) return false
  if (x.replace(/ /g, '') === y.replace(/ /g, '')) return true
  const [short, long] = x.length < y.length ? [x.split(' '), y.split(' ')] : [y.split(' '), x.split(' ')]
  return short.every((w, i) => long[i] === w) && long.slice(short.length).every(w => FILLER.has(w))
}

/** "3.5" → "3½", "3.00" → "3", "0.5" → "½", "4Hls" → "4 holes"; anything else as written. */
export function scoreText(raw: string): string {
  const holes = raw.match(/^(\d+)\s*h(?:ls?|oles?)?$/i)
  if (holes) return `${holes[1]} ${holes[1] === '1' ? 'hole' : 'holes'}`
  const n = raw.match(/^(\d+)(?:\.(\d+))?$/)
  if (!n) return raw
  const whole = Number(n[1])
  const frac = Number(`0.${n[2] ?? '0'}`)
  if (frac === 0) return String(whole)
  if (frac === 0.5) return whole === 0 ? '½' : `${whole}½`
  return raw
}

/** A name typed in capitals read in title case — "BALLYHAUNIS" is Ballyhaunis. */
function tidyCase(name: string): string {
  if (name !== name.toUpperCase() || !/[A-Z]{3}/.test(name)) return name
  return name.toLowerCase().replace(/\b([a-z])/g, (_, ch: string) => ch.toUpperCase())
}

// "(H)", "( Home )", "[H]", "[H" — a bracket, the word or its letter, a bracket or the end — or "Home" on its own.
const HOME = /[([]\s*h(?:ome)?\b\s*[)\]]?|\bhome\b/i
const AWAY = /[([]\s*a(?:way)?\b\s*[)\]]?|\baway\b/i
// Settled on an extra hole: "19th", "(19th", "22nd", "19th hl", "Tie Holes", "Tied Hole", "xtr".
const EXTRA_HOLE = /\b(1[89]|2\d)(st|nd|rd|th)\b(?:\s*(?:hole|hl)s?\b)?|\btie[d]?\s*holes?\b|(?<![a-z])x\s*tra?s?\b|\bextra\s*holes?\b/i
// A walkover: "W/O", "W//O", "W.O", "WO", "W O".
const WALKOVER = /\bw\s*[/.]*\s*o\b/i
// Won, said in words: "W", "(W", "Won", "WON".
const WON = /(?:^|[\s(])(won|w)(?=$|[\s)])/i
const PLAYOFF = /\bp\s*\/\s*[o0]\b|\bpo\b/i
// Out of the match: "(Disq", "DQ", "w/d", "withdrew", "conceded", "scratched".
const OUT = /\(?\s*\b(disq\w*|dq|w\s*\/\s*d|withdr\w*|conced\w*|scratch\w*)\b\s*\)?/i

/** One cell of the draw, read. Null for an empty place — nobody known yet. */
export function readCell(raw: string): DrawSide | null {
  let t = raw.replace(/\s+/g, ' ').trim()
  t = t.replace(/^team\s*\d+\s*[:.-]?\s*/i, '')
  if (!t) return null
  if (/^bye\b/i.test(t)) return { name: 'Bye', key: '', bye: true, home: false, away: false, score: null, playoff: false, out: false, won: false }
  // A tee time and its venue ahead of the club: "Ballyclare at 08.30 Moyola Park", "at Castlerock 08.00 Buncrana",
  // "at Blackwood/Mahee at 13.00 Clandeboye".
  t = t.replace(/^(?:[a-z'’/ ]+?\s)?at\s+(?:[a-z'’/ ]+?\s)?(?:at\s+)?\d{1,2}[.:]\d{2}\s*(?:hrs|am|pm)?\s+/i, '')
  const outWord = t.match(OUT)
  const out = !!outWord
  if (outWord) t = t.replace(OUT, ' ')
  const walkover = WALKOVER.test(t)
  t = t.replace(new RegExp(WALKOVER.source, 'gi'), ' ')
  // A whole number then H is holes ("4 H" in the Barton Shield); otherwise a capital H or A on
  // its own is home or away: "Balmoral H", "Headfort 2.5 H" (points, so not holes), "Enniskillen. H.".
  t = t.replace(/(?<![\d.,])(\d+)\s*H(?=\s|$)/g, '$1 holes')
  const bareHome = /(?:^|[\s.])H\.?(?=\s|$)/.test(t)
  const bareAway = /(?:^|[\s.])A\.?(?=\s|$)/.test(t)
  t = t.replace(/(?:^|[\s.])[HA]\.?(?=\s|$)/g, ' ').replace(/(\d),(5)\b/g, '$1.$2')
  const extra = t.match(EXTRA_HOLE)
  const extraSaid = extra ? (extra[1] ? `${extra[1]}${extra[2].toLowerCase()}` : 'tie hole') : null
  if (extra) t = t.replace(EXTRA_HOLE, ' ')
  const wonWord = WON.test(t)
  t = t.replace(new RegExp(WON.source, 'gi'), ' ')
  const home = bareHome || HOME.test(t)
  const away = !home && (bareAway || AWAY.test(t))
  const playoff = PLAYOFF.test(t)
  t = t.replace(HOME, ' ').replace(AWAY, ' ').replace(PLAYOFF, ' ')
  t = t.replace(/["“”]/g, '')
  // A spaced dash ends the name: "Clandeboye - Tie Hole", "Belvoir - WO".
  const dash = t.search(/\s[-–]\s/)
  const said = dash < 0 ? '' : t.slice(dash).replace(/^[\s\-–]+/, '')
  if (dash >= 0) t = t.slice(0, dash)
  // Otherwise the name runs to the first figure, and whatever follows is its score.
  const cut = t.search(/\d|½/)
  let name = (cut < 0 ? t : t.slice(0, cut)).replace(/[\s.,:;\-–[\]()]+$/g, '').trim()
  let score = [cut < 0 ? '' : t.slice(cut), said]
    .map(x => x.replace(/^[\s\-–]+/, '').replace(/[\s.,\-–[\]()]+$/g, '').trim())
    .filter(Boolean).join(' ')
  if (walkover && !score) score = 'W/O'
  score = score.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!name) return null
  name = tidyCase(name.replace(/\s+/g, ' '))
  score = score.replace(/\s+/g, ' ')
  return {
    name,
    key: clubKey(name),
    bye: false,
    home,
    away,
    score: out ? (/^w/i.test(outWord![1]) ? 'W/D' : /^con/i.test(outWord![1]) ? 'Conceded' : 'DQ')
      : extraSaid ? (score ? `${scoreText(score)} (${extraSaid})` : extraSaid)
      : score ? scoreText(score) : null,
    playoff,
    out,
    won: !out && (wonWord || !!extra || walkover),
  }
}

// ─── Dates ─────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const pad = (n: number) => String(n).padStart(2, '0')

/** The first date in some words and the words it was read from, or null. */
function findDate(text: string, year: number): { date: string; said: string } | null {
  const iso = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
  }
  const slash = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/)
  if (slash) {
    const date = iso(Number(slash[3]), Number(slash[2]), Number(slash[1]))
    return date ? { date, said: slash[0] } : null
  }
  for (const named of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(?:of\s+)?([a-z]{3,9})\.?(?:[\s,-]+(\d{4}|\d{2}\b))?/gi)) {
    const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase())
    if (m < 0) continue
    const date = iso(named[3] ? Number(named[3]) : year, m + 1, Number(named[1]))
    if (date) return { date, said: named[0] }
  }
  return null
}

/**
 * The first date in some words, as YYYY-MM-DD, or null: "10th August 2026",
 * "24-May-26", "14/06/2026" (day first — this is Ireland), "5-Jun" with the
 * draw's own year. A date that cannot be a day of the year is no date.
 */
export function readDrawDate(text: string, year: number): string | null {
  return findDate(text, year)?.date ?? null
}

// ─── The draw ──────────────────────────────────────────────────

export type DrawRound = {
  /** "Round 1", "Quarter-finals", "Final" — the count in brackets taken off. */
  name: string
  /** The date it is to be played by, where the draw gives one. */
  by: string | null
  /** Anything else under the round's name: "Top Half at Ballyclare". */
  notes: string[]
}

export type DrawMatch = {
  /** 0 for the first round. */
  round: number
  slot: number
  a: DrawSide | null
  b: DrawSide | null
  /** Which side went through: 'a', 'b', or null while undecided (or unreadable). */
  winner: 'a' | 'b' | null
}

export type Draw = {
  title: string | null
  area: string | null
  rounds: DrawRound[]
  matches: DrawMatch[]
  champion: DrawSide | null
}

const ROUND_HEAD = /^(round\s*\d+|r\d+|1st round|2nd round|3rd round|last \d+|quarter|semi|final|area final)/i

/** "Quarterfinals (8)" → "Quarter-finals", "Round 1 (64)" → "Round 1". */
export function roundName(head: string): string {
  const t = head.replace(/\(\s*\d+\s*\)/g, '').trim()
  if (/quarter/i.test(t)) return 'Quarter-finals'
  if (/semi/i.test(t)) return 'Semi-finals'
  if (/^final/i.test(t)) return 'Final'
  return t.replace(/\b([a-z])/g, (_, ch: string) => ch.toUpperCase())
}

/** Boilerplate under a round's name that says nothing the date does not. */
const BOILERPLATE = /^(to be (completed|played) (by|on)\s*:?|date|played by:?)$/i

/**
 * A draw, out of its page — or null where the page holds no draw this can
 * read. The rules:
 *
 * - The header row is the one naming rounds ("Round 1 (32)", "Quarterfinals
 *   (8)", "Final (2)") followed by "Champion". Its round columns are the
 *   draw's rounds; there are 2^rounds first-round places.
 * - The bracket starts at the first row below the header where the second
 *   column's cell spans two rows — round 2's first place, sitting over the
 *   first two of round 1.
 * - Column `c` holds the clubs playing round `c`; its place `j` covers rows
 *   `j·2^c` to `(j+1)·2^c − 1`. Places `2j` and `2j + 1` met; whoever is in
 *   place `j` of the next column went through.
 * - The words between the header and the bracket, column by column, are the
 *   round's play-by date and its notes.
 */
export function readDraw(html: string, year: number): Draw | null {
  const table = drawTable(html)
  if (!table) return null
  const grid = tableGrid(table)

  const headerRow = grid.findIndex(row => {
    const texts = (row ?? []).map(c => c?.text ?? '')
    return texts.filter(t => ROUND_HEAD.test(t)).length >= 2 && texts.some(t => /^champion/i.test(t))
  })
  if (headerRow < 0) return null
  const header = grid[headerRow]
  const roundCols: number[] = []
  header.forEach((cell, c) => {
    if (cell && cell.col === c && ROUND_HEAD.test(cell.text)) roundCols.push(c)
  })
  const championCol = header.findIndex(c => !!c && /^champion/i.test(c.text))
  const R = roundCols.length
  // Columns must run 0, 1, 2… with the champion after them — the layout every draw shares.
  if (R < 1 || R > 8 || roundCols.some((c, i) => c !== roundCols[0] + i) || championCol !== roundCols[0] + R) return null
  const first = roundCols[0]
  const places = 2 ** R

  let start = -1
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cell = grid[r]?.[first + 1]
    if (cell && cell.row === r && cell.rowSpan === 2) { start = r; break }
  }
  // A two-club draw has no second column to find it by: the first row below the header with a club in it.
  if (R === 1) {
    for (let r = headerRow + 1; r < grid.length && start < 0; r++) {
      if (grid[r]?.[first] && readCell(grid[r][first].text)) start = r
    }
  }
  if (start < 0 || grid.length < start + places) return null

  const title = textOf(grid[0]?.[0]?.text ?? '') || null
  let area: string | null = null
  for (let r = 0; r < headerRow; r++) {
    const row = grid[r] ?? []
    const i = row.findIndex(c => !!c && /^competition area:?$/i.test(c.text))
    if (i >= 0) area = row.slice(i + 1).find(c => c && c.text && c !== row[i])?.text ?? null
  }

  const rounds: DrawRound[] = roundCols.map(c => {
    const words: string[] = []
    for (let r = headerRow + 1; r < start; r++) {
      const cell = grid[r]?.[c]
      if (!cell || cell.col !== c || cell.row !== r) continue
      const t = cell.text.trim()
      if (t && !BOILERPLATE.test(t)) words.push(t)
    }
    let by: string | null = null
    const notes: string[] = []
    for (const w of words) {
      const said = w.replace(/^to be (completed|played) (by|on)\s*:?\s*/i, '').trim()
      const found: { date: string; said: string } | null = by ? null : findDate(said, year)
      if (found) by = found.date
      // "5-Jun" is only its date; "Leg 1 : 3rd October Oughterard" says more, and is kept whole.
      const left = found ? said.replace(found.said, '').replace(/[\s:,.\-–]+/g, ' ').trim() : said
      if (left) notes.push(said)
    }
    return { name: roundName(header[c].text), by, notes: notes.filter(Boolean) }
  })

  /** Place `j` of column `c` (0 = round 1, R = the champion). */
  const place = (c: number, j: number): DrawSide | null => {
    const cell = grid[start + j * 2 ** c]?.[first + c]
    return cell ? readCell(cell.text) : null
  }

  const matches: DrawMatch[] = []
  for (let c = 0; c < R; c++) {
    const count = places / 2 ** (c + 1)
    for (let j = 0; j < count; j++) {
      const a = place(c, 2 * j)
      const b = place(c, 2 * j + 1)
      matches.push({ round: c, slot: j, a, b, winner: winnerOf(a, b, place(c + 1, j)) })
    }
  }

  return { title, area, rounds, matches, champion: place(R, 0) }
}

/**
 * Who went through, in this order of trust:
 *
 * 1. A bye's opponent, always.
 * 2. The side the next round names — where it names exactly one of them. A
 *    round re-drawn ("Re-Draw for last 16") names somebody else entirely,
 *    and is passed over rather than read as nobody winning.
 * 3. A side marked out (DQ, w/d, conceded) loses; one marked the winner in
 *    words — W/O, "W", "Won", or an extra hole ("19th", "Tie Hole") — wins.
 * 4. Two figures: the bigger. One side with a result and the other blank —
 *    the Barton Shield writes only the winner's holes ("Macroom 2Hls",
 *    "Cork 19th") — that side.
 *
 * Otherwise nobody: never a guess.
 */
export function winnerOf(a: DrawSide | null, b: DrawSide | null, next: DrawSide | null): 'a' | 'b' | null {
  if (a?.bye && b && !b.bye) return 'b'
  if (b?.bye && a && !a.bye) return 'a'
  if (!a || !b || a.bye || b.bye) return null
  if (next && !next.bye && next.key) {
    const as = sameClub(a.key, next.key), bs = sameClub(b.key, next.key)
    if (as && !bs) return 'a'
    if (bs && !as) return 'b'
  }
  if (a.out !== b.out) return a.out ? 'b' : 'a'
  if (a.won !== b.won) return a.won ? 'a' : 'b'
  const na = Number(a.score?.replace('½', '.5')), nb = Number(b.score?.replace('½', '.5'))
  if (a.score && b.score && Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na > nb ? 'a' : 'b'
  if (!!a.score !== !!b.score) return a.score ? 'a' : 'b'
  return null
}

// ─── Into the bracket ──────────────────────────────────────────

/**
 * The draw as the bracket component draws it (`MatchplayBracket`): a match
 * a place, round by round, every club one entrant across the rounds however
 * it was spelt, each side carrying its score and whether it was at home.
 * The ids are the draw's own positions, so the same draw gives the same rows.
 */
export type BracketRows = {
  matches: {
    id: string
    trip_id: string
    round_number: number
    round_name: string
    slot: number
    player_a_id: string | null
    player_b_id: string | null
    player_a_is_bye: boolean
    player_b_is_bye: boolean
    seed_a: null
    seed_b: null
    winner_player_id: string | null
    result: null
    next_match_id: string | null
    next_slot: 'A' | 'B' | null
    score_a: string | null
    score_b: string | null
    home: 'A' | 'B' | null
  }[]
  entrants: { id: string; name: string; shortName: string; handicap: null }[]
  /** Each round's play-by date, first round first. */
  deadlines: (string | null)[]
}

export function drawToBracket(draw: Draw): BracketRows {
  const entrants = new Map<string, { id: string; name: string; shortName: string; handicap: null }>()
  /** The entrant a side is, made the first time a club appears. */
  const entrantOf = (side: DrawSide | null): string | null => {
    if (!side || side.bye) return null
    for (const [key, e] of entrants) if (sameClub(key, side.key)) return e.id
    const id = `club-${entrants.size + 1}`
    entrants.set(side.key, { id, name: side.name, shortName: side.name, handicap: null })
    return id
  }
  const R = draw.rounds.length
  const matches = draw.matches.map(m => {
    const a = entrantOf(m.a), b = entrantOf(m.b)
    const last = m.round === R - 1
    return {
      id: `r${m.round}s${m.slot}`,
      trip_id: 'interclub',
      round_number: m.round + 1,
      round_name: draw.rounds[m.round].name,
      slot: m.slot,
      player_a_id: a,
      player_b_id: b,
      player_a_is_bye: !!m.a?.bye,
      player_b_is_bye: !!m.b?.bye,
      seed_a: null,
      seed_b: null,
      winner_player_id: m.winner === 'a' ? a : m.winner === 'b' ? b : null,
      result: null,
      next_match_id: last ? null : `r${m.round + 1}s${Math.floor(m.slot / 2)}`,
      next_slot: last ? null : (m.slot % 2 === 0 ? 'A' as const : 'B' as const),
      score_a: m.a && !m.a.bye ? m.a.score : null,
      score_b: m.b && !m.b.bye ? m.b.score : null,
      home: m.a?.home || m.b?.away ? 'A' as const : m.b?.home || m.a?.away ? 'B' as const : null,
    }
  })
  return { matches, entrants: [...entrants.values()], deadlines: draw.rounds.map(r => r.by) }
}

/** Where a draw stands, in a few words: "Final to play", "Won by Douglas". */
export function drawStatus(draw: Draw): string {
  if (draw.champion && !draw.champion.bye) return `Won by ${draw.champion.name}`
  const open = draw.rounds.findIndex((_, i) =>
    draw.matches.some(m => m.round === i && !m.winner && !(m.a?.bye && m.b?.bye) && (m.a || m.b)))
  return open >= 0 ? `${draw.rounds[open].name} to play` : 'Draw to be made'
}
