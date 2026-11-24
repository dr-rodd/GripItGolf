// The test club, the only copy of its rules (D308–D317, Ross, 24 Nov 2026).
//
// Pints Golf Club is played by fictional characters alongside Ross and a few
// real friends, so a season can be watched end to end on the live site
// without waiting for real people to play it. A club is a test club only
// while `clubs.is_test` says so (migration 103, set by hand) — nothing here
// ever turns it on.
//
// This file decides; `app/admin/test-club/wipe.ts` does, on an injected
// store, and `/admin/test-club` is the page. Pure.

import type { CardForm } from './testClubCards'

/** Pints, the one test club so far — named so the page can say what it is about. */
export const PINTS_SLUG = 'pints-golf-club'

/** Where a fictional account's address lives (D308): nothing is ever sent there. */
export const TEST_EMAIL_DOMAIN = 'greendot.invalid'

/** A fictional character's address, e.g. `jed.bartlet@pints.greendot.invalid`. */
export function testEmail(username: string, clubSlug: string): string {
  const club = clubSlug.split('-')[0] || 'test'
  return `${username}@${club}.${TEST_EMAIL_DOMAIN}`
}

/** Said while migration 103 is not in. */
export const TEST_CLUB_NOT_READY = 'The test club is not set up yet — paste migration 103 first.'

// ─── The keep-list (D311) ─────────────────────────────────────────

/** The usernames typed into the keep-list: one a line or comma, trimmed, lower case, no repeats. */
export function readKeepList(raw: string): string[] {
  const out: string[] = []
  for (const part of String(raw ?? '').split(/[\n,]+/)) {
    const u = part.trim().replace(/^@/, '').toLowerCase()
    if (u && !out.includes(u)) out.push(u)
  }
  return out
}

/** The most the keep-list holds — Ross and a few friends. */
export const MAX_KEEP = 12

// ─── The wipe (D311) ──────────────────────────────────────────────

/** One row of the club's list, as the wipe sees it. */
export interface WipeRow { id: string; userId: string | null; owner?: boolean }

/**
 * Which of the club's list rows go. Every row but a keep-list account's own
 * row and an owner's (a club keeps its owner, keep-list or not — Ross, 24
 * Nov 2026) — and never a keep-list account's row, even one taken off the list.
 * A fictional account in the keep-list is not kept: the characters are
 * always the wipe’s (D311 — a reseed makes them afresh).
 */
export function rowsToWipe(
  rows: readonly WipeRow[],
  keep: ReadonlySet<string>,
  fictional: ReadonlySet<string>,
): { wipe: string[]; kept: string[] } {
  const wipe: string[] = []
  const kept: string[] = []
  for (const r of rows) {
    if (r.userId && !fictional.has(r.userId) && (keep.has(r.userId) || r.owner)) kept.push(r.id)
    else wipe.push(r.id)
  }
  return { wipe, kept }
}

/** The club's own tables a wipe empties, child before parent (each `club_id`-keyed). */
export const CLUB_TABLES = [
  'club_tee_bookings', 'club_activity', 'club_awards', 'club_events',
  'club_presets', 'club_labels', 'club_locations', 'feed_reports',
  'test_week_loads',
] as const

/** The tables whose rows outside the club are counted before and after a wipe (D311's check). */
export const OUTSIDE_TABLES = [
  'trips', 'players', 'rounds', 'scores', 'trip_members', 'club_members',
  'club_events', 'club_tee_bookings', 'card_summaries', 'feed_items',
  'account_usernames',
] as const
export type OutsideTable = (typeof OUTSIDE_TABLES)[number]
export type Counts = Partial<Record<OutsideTable, number>>

/**
 * Whether nothing outside the club changed: every table's count the same
 * before and after. The site is live, so a real trip scoring meanwhile moves
 * a count — `changed` names each table so the page can say which.
 */
export function outsideUnchanged(before: Counts, after: Counts): { same: boolean; changed: OutsideTable[] } {
  const changed = OUTSIDE_TABLES.filter(t => before[t] !== undefined && after[t] !== undefined && before[t] !== after[t])
  return { same: changed.length === 0, changed }
}

/** What a wipe will take, counted, for the page to show before it asks. */
export interface WipePreview {
  club: { id: string; name: string; slug: string }
  events: number
  listRows: number
  keptRows: number
  fictionalAccounts: number
  clubRows: Partial<Record<(typeof CLUB_TABLES)[number] | 'club_categories' | 'feed_items', number>>
  keep: { userId: string; username: string | null; onList: boolean }[]
}

/** The words a wipe must be confirmed with: the club's name, exactly (case aside). */
export function wipeConfirmed(typed: string, clubName: string): boolean {
  return String(typed ?? '').trim().toLowerCase() === clubName.trim().toLowerCase()
}

// ─── Platform figures (D316) ──────────────────────────────────────

/**
 * Whether a trip counts in a platform-wide figure — the admin's counts,
 * anything sent to Golf Ireland. A test club's events never do. Handed the
 * set of test clubs' trip ids (`testTripIds` in app/admin/test-club/store.ts).
 */
export const countsOnPlatform = (tripId: string, testTrips: ReadonlySet<string>) => !testTrips.has(tripId)

// ─── The characters (D309) ────────────────────────────────────────

export type CommentRate = 'low' | 'mid' | 'high' | 'every card'
const COMMENT_RATES: readonly CommentRate[] = ['low', 'mid', 'high', 'every card']

/** One fictional member, as data/test-club/characters.json keeps them. */
export interface Character {
  key: string
  name: string
  username: string
  /** A handicap index; below zero is a plus handicap (-0.4 is +0.4). */
  handicap: number
  gender: 'M' | 'F'
  /** A membership's name, one of `MEMBERSHIPS`. */
  membership: string
  birthDate: string
  voice: string
  needles: string[]
  defersTo: string[]
  commentRate: CommentRate
  officer?: boolean
  clubhouse?: boolean
}

/** The test club's memberships (D311): name, code, days played (0 Monday … 6 Sunday), junior. */
export const MEMBERSHIPS: readonly { name: string; code: string; days: number[]; junior: boolean }[] = [
  { name: 'Full', code: 'FULL', days: [0, 1, 2, 3, 4, 5, 6], junior: false },
  { name: 'Senior', code: 'SNR', days: [0, 1, 2, 3, 4, 5, 6], junior: false },
  { name: '6 Day', code: 'SIX', days: [0, 1, 2, 3, 4, 6], junior: false },
  { name: 'Junior', code: 'JNR', days: [0, 1, 2, 3, 4, 5, 6], junior: true },
]

/** Where a keep-list member with no membership is put by a reseed. */
export const DEFAULT_MEMBERSHIP = 'Full'

/** The test club's labels (D311): each as a label's groups, memberships named rather than by id. */
export const TEST_LABELS: readonly { name: string; colour: string; genders?: ('M' | 'F')[]; memberships?: string[]; maxIndex?: number }[] = [
  { name: 'Ladies', colour: '#C24D7C', genders: ['F'] },
  { name: 'Seniors', colour: '#4F6B7A', memberships: ['Senior'] },
  { name: 'Single figures', colour: '#22375E', maxIndex: 9.9 },
]

/** Why a character will not do, in a sentence — null when it will. */
export function characterIssue(c: Partial<Character>, deny: readonly string[]): string | null {
  const who = c.name || c.key || 'A character'
  if (!c.key || !/^[a-z0-9-]{1,40}$/.test(c.key)) return `${who}: a key is lower-case letters, numbers and dashes.`
  if (!c.name || !c.name.trim()) return `${who}: no name.`
  if (!c.username || !/^[a-z0-9._]{3,20}$/.test(c.username) || /^[.]|[.]$/.test(c.username)) return `${who}: the username is 3 to 20 letters, numbers, dots and underscores.`
  if (typeof c.handicap !== 'number' || c.handicap < -10 || c.handicap > 54) return `${who}: a handicap is +10 to 54.`
  if (c.gender !== 'M' && c.gender !== 'F') return `${who}: gender is M or F.`
  if (!MEMBERSHIPS.some(m => m.name === c.membership)) return `${who}: no membership called ${c.membership}.`
  if (!c.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)) return `${who}: a date of birth is YYYY-MM-DD.`
  if (!COMMENT_RATES.includes(c.commentRate as CommentRate)) return `${who}: the comment rate is low, mid, high or every card.`
  const real = deniedName(c.name, deny)
  if (real) return `${who}: the name ${real} is a real person’s (deny-list.txt).`
  return null
}

/** A deny-list name found in `name`, whole words, case aside — null when none. */
export function deniedName(name: string, deny: readonly string[]): string | null {
  const n = ` ${name.toLowerCase().replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ')} `
  for (const d of deny) {
    const t = d.trim().toLowerCase().replace(/\s+/g, ' ')
    if (t && n.includes(` ${t} `)) return d.trim()
  }
  return null
}

/** The deny-list file read: one name a line, `#` comments and blank lines skipped. */
export function readDenyList(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
}

/** The characters file read and checked — the cast, or the first thing wrong. */
export function readCharacters(raw: unknown, deny: readonly string[]): { ok: true; cast: Character[] } | { ok: false; error: string } {
  const list = (raw && typeof raw === 'object' ? (raw as { characters?: unknown }).characters : null)
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'characters.json lists nobody.' }
  const cast: Character[] = []
  for (const c of list as Partial<Character>[]) {
    const issue = characterIssue(c, deny)
    if (issue) return { ok: false, error: issue }
    if (cast.some(x => x.key === c.key)) return { ok: false, error: `Two characters have the key ${c.key}.` }
    if (cast.some(x => x.username === c.username)) return { ok: false, error: `Two characters have the username ${c.username}.` }
    cast.push({ needles: [], defersTo: [], ...c } as Character)
  }
  for (const c of cast) {
    for (const k of c.defersTo) if (!cast.some(x => x.key === k)) return { ok: false, error: `${c.name} defers to ${k}, who is not a character.` }
  }
  return { ok: true, cast }
}

/** A character's number on the club's list: T01, T02… — never a real member's. */
export const memberNumber = (i: number) => `T${String(i + 1).padStart(2, '0')}`

// ─── Casual tee times for the coming week (D311) ──────────────────

/** A small, steady hash — the same characters book the same times every reseed. */
export function seedHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/**
 * Who books a casual tee time on each of the next seven days, in twos and
 * threes, at a morning time — by the characters' keys, never a real member.
 * The times are wishes: the club's own sheet decides what exists (the seed
 * books the nearest open time and skips a day it cannot).
 */
export function casualPlan(cast: readonly Character[], from: string, days = 7): { day: string; time: string; who: string[] }[] {
  const out: { day: string; time: string; who: string[] }[] = []
  const start = Date.parse(`${from}T12:00:00Z`)
  for (let d = 1; d <= days; d++) {
    const day = new Date(start + d * 86_400_000).toISOString().slice(0, 10)
    const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
    const h = seedHash(day)
    const groups = 1 + (h % 2)
    const used = new Set<string>()
    for (let g = 0; g < groups; g++) {
      const size = 2 + ((h >>> (g + 3)) % 2)
      const who: string[] = []
      for (let i = 0; who.length < size && i < cast.length * 3; i++) {
        const c = cast[(seedHash(`${day}:${g}:${i}`)) % cast.length]
        if (used.has(c.key)) continue
        // A 6 Day member does not play on Saturday.
        if (!(MEMBERSHIPS.find(m => m.name === c.membership)?.days ?? []).includes(weekday)) continue
        used.add(c.key); who.push(c.key)
      }
      const minutes = 8 * 60 + 30 + ((h >>> (g * 4)) % 12) * 30
      if (who.length >= 2) out.push({ day, time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, who })
    }
  }
  return out
}

// ─── Playing a competition (D311, D312) ───────────────────────────


/**
 * One competition the test club plays — the reseed's history and, from
 * stage s2, a week file's. `key` names it for good (`test:<key>` on the
 * event), so playing it again finds it rather than making a second.
 */
export interface PlaySpec {
  key: string
  name: string
  /** The day, YYYY-MM-DD (Irish). */
  day: string
  scoring: 'stableford' | 'strokes'
  /** Who may enter: the ladies (women only), or one membership by name. */
  entry?: { genders?: ('M' | 'F')[]; membership?: string }
  /** Each player's form, by character key. */
  players: Record<string, CardForm>
  /** The tee times' groups, by character key, first tee first. */
  groups: string[][]
  set?: { who: string; hole: number; gross: number }[]
  certify: boolean
}

/** A list in a seeded order — the same every time for the same seed. */
export function seededOrder<T>(items: readonly T[], seed: string): T[] {
  return [...items].map((x, i) => ({ x, k: seedHash(`${seed}:${i}`) })).sort((a, b) => a.k - b.k).map(p => p.x)
}

/** Players into tee-time groups: fours, then threes so nobody plays alone. */
export function groupsOf(keys: readonly string[]): string[][] {
  const n = keys.length
  if (n <= 4) return n ? [[...keys]] : []
  // Five cannot be fours and threes: a three and a two.
  if (n === 5) return [keys.slice(0, 3), keys.slice(3)]
  const threes = (4 - (n % 4)) % 4
  const fours = (n - threes * 3) / 4
  const out: string[][] = []
  let i = 0
  for (let g = 0; g < fours; g++) { out.push(keys.slice(i, i + 4)); i += 4 }
  for (let g = 0; g < threes; g++) { out.push(keys.slice(i, i + 3)); i += 3 }
  return out
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const weekday = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7

/** Whether a character may play on a day by their membership (0 Monday … 6 Sunday). */
const playsOn = (c: Character, day: string) => (MEMBERSHIPS.find(m => m.name === c.membership)?.days ?? []).includes(weekday(day))

/** A form for a character on a day — Jed's is always wild (D312). */
export function formFor(c: Character, seed: string): CardForm {
  if (c.key === 'jed') return 'wild'
  const roll = seedHash(`${seed}:${c.key}`) % 20
  return roll < 2 ? 'hot' : roll < 6 ? 'good' : roll < 14 ? 'steady' : roll < 18 ? 'poor' : 'awful'
}

/**
 * The reseed's history (D311): eight competitions over the last eight weeks
 * before `today` — six Saturdays (Full and Senior members; a 6 Day member
 * cannot play a Saturday), a ladies' Tuesday and a seniors' Wednesday — all
 * certified, so Results and Golfer of the Year have a season behind them.
 * Jed's 4 on the 18th in the President's Prize is the set piece.
 */
export function seasonPlan(cast: readonly Character[], today: string): PlaySpec[] {
  const lastSat = addDays(today, -(((weekday(today) - 5) + 7) % 7 || 7))
  const saturdays = ['Autumn Medal', 'Saturday Stableford', 'President’s Prize', 'Captain’s Prize', 'November Medal', 'November Stableford']
  const out: PlaySpec[] = []
  saturdays.forEach((name, i) => {
    const day = addDays(lastSat, -7 * (saturdays.length - 1 - i))
    const key = `season-${String(i + 1).padStart(2, '0')}`
    const eligible = cast.filter(c => playsOn(c, day))
    // Most weeks most of the club plays; somebody always has a reason not to.
    const field = seededOrder(eligible, key).slice(0, Math.max(6, eligible.length - (seedHash(key) % 3)))
    out.push({
      key, name, day, scoring: name.includes('Medal') ? 'strokes' : 'stableford',
      players: Object.fromEntries(field.map(c => [c.key, formFor(c, key)])),
      groups: groupsOf(field.map(c => c.key)),
      ...(name === 'President’s Prize' && field.some(c => c.key === 'jed') ? { set: [{ who: 'jed', hole: 18, gross: 4 }] } : {}),
      certify: true,
    })
  })
  const ladies = cast.filter(c => c.gender === 'F')
  const ladiesDay = addDays(lastSat, -4 - 14)
  out.push({
    key: 'season-ladies', name: 'Ladies’ Stableford', day: ladiesDay, scoring: 'stableford', entry: { genders: ['F'] },
    players: Object.fromEntries(ladies.filter(c => playsOn(c, ladiesDay)).map(c => [c.key, formFor(c, 'season-ladies')])),
    groups: groupsOf(ladies.filter(c => playsOn(c, ladiesDay)).map(c => c.key)), certify: true,
  })
  const seniors = cast.filter(c => c.membership === 'Senior')
  const seniorsDay = addDays(lastSat, -3 - 28)
  out.push({
    key: 'season-seniors', name: 'Seniors’ Stableford', day: seniorsDay, scoring: 'stableford', entry: { membership: 'Senior' },
    players: Object.fromEntries(seniors.map(c => [c.key, formFor(c, 'season-seniors')])),
    groups: groupsOf(seniors.map(c => c.key)), certify: true,
  })
  return out.sort((a, b) => a.day.localeCompare(b.day))
}

// ─── Statuses, comments and dots (D313) ───────────────────────────

/** A competition's banter: statuses by the card's own player, comments by anybody on a card in it. */
export interface Banter {
  statuses?: Record<string, string>
  comments?: { on: string; by: string; text: string }[]
}

/** The feed's own limits (lib/feed.ts STATUS_MAX, COMMENT_MAX) — repeated here only to check a file; the feed checks again. */
export const BANTER_STATUS_MAX = 140
export const BANTER_COMMENT_MAX = 280

/** Why a competition's banter will not do, in a sentence — null when it will. `players` are the keys who played it. */
export function banterIssue(b: Banter, cast: readonly Character[], players: readonly string[]): string | null {
  const known = new Set(cast.map(c => c.key))
  for (const [k, text] of Object.entries(b.statuses ?? {})) {
    if (!players.includes(k)) return `A status for ${k}, who did not play.`
    if (!text.trim() || [...text].length > BANTER_STATUS_MAX) return `${k}’s status is empty or over ${BANTER_STATUS_MAX} characters.`
  }
  for (const c of b.comments ?? []) {
    if (!players.includes(c.on)) return `A comment on ${c.on}’s card, who did not play.`
    if (!known.has(c.by)) return `A comment by ${c.by}, who is not a character.`
    if (!c.text.trim() || [...c.text].length > BANTER_COMMENT_MAX) return `${c.by}’s comment on ${c.on} is empty or over ${BANTER_COMMENT_MAX} characters.`
  }
  return null
}

/** How many of a competition's other cards each comment rate puts a dot on. */
const DOTS: Record<CommentRate, number> = { 'every card': 99, high: 3, mid: 1, low: 0 }

/** Who dots whose card in a competition, by the characters' comment rates — never their own, the same every time. */
export function dotPlan(cast: readonly Character[], players: readonly string[], seed: string): { by: string; on: string }[] {
  const out: { by: string; on: string }[] = []
  for (const c of cast) {
    const others = seededOrder(players.filter(p => p !== c.key), `${seed}:dot:${c.key}`)
    for (const on of others.slice(0, DOTS[c.commentRate])) out.push({ by: c.key, on })
  }
  return out
}

// ─── The club match play, part-way through its draw (D311) ────────

/** How far each match of the reseeded match play has got. */
export type MatchStage = 'finalised' | 'live' | 'waiting'

/**
 * The reseeded match play (D311, s1c): made three weeks ago, entries closed
 * the Friday before last, the draw made then **by handicap** (so the best
 * players have byes), the first round played and decided, the quarter-finals
 * part-way — two decided, one in play, one not even arranged, and so a day
 * or two overdue. Every date comes off `today`, so a reseed always reads
 * as a match play in its fourth week.
 */
export interface MatchPlayPlan {
  key: string
  name: string
  /** When it is made (the clock it is made at). */
  madeOn: string
  /** Entries close: a day, 18:00. The draw is made then. */
  closesOn: string
  /** A play-by date a round, the Final last. */
  deadlines: string[]
  /** The day each round's matches were played, by round number — a later match plays a day after an earlier one. */
  playedOn: Record<number, string>
  /** What each real match has reached, by round number then the match's order among that round's real matches. */
  stages: Record<number, MatchStage[]>
  /** How many holes the match in play has been scored through. */
  liveHoles: number
}

const dayOffset = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export function matchPlayPlan(today: string): MatchPlayPlan {
  return {
    key: 'matchplay-1',
    name: 'Pints Matchplay',
    madeOn: dayOffset(today, -21),
    closesOn: dayOffset(today, -18),
    deadlines: [dayOffset(today, -9), dayOffset(today, -2), dayOffset(today, 12), dayOffset(today, 26)],
    playedOn: { 1: dayOffset(today, -12), 2: dayOffset(today, -4) },
    stages: {
      1: ['finalised', 'finalised', 'finalised'],
      2: ['finalised', 'finalised', 'live', 'waiting'],
    },
    liveHoles: 9,
  }
}

/** The stage of the nth real match of a round — anything beyond the plan is waiting. */
export const stageOf = (p: MatchPlayPlan, round: number, n: number): MatchStage => p.stages[round]?.[n] ?? 'waiting'
