// Golf Ireland — every decision, none of the network.
//
// A league can take its cards from Golf Ireland: players hand their scores
// in as they always do, find themselves in their club's membership and
// link that member to their name in the league, and Green Dot reads the
// cards that meet the league's rules. lib/golfIrelandClient.ts is the one
// file that talks to Golf Ireland; this file decides — what the league's
// rules are and how they are stored, what a search may ask and show, when
// a link may be made and read, what a card from Golf Ireland must look like
// before anything trusts it, which cards count and why the others do not,
// and what a sync should add and remove. Pure, so every rule is tested
// against a fake Golf Ireland (`npm run test:golf-ireland`) — the real API
// is not in our hands yet.
//
// ── What is assumed until Golf Ireland's documentation arrives ──
//
//   · Access comes club by club, with each club's permission: Green Dot
//     holds one credential per club and reads that club's members with it.
//     No player signs in to Golf Ireland. docs/golf-ireland.md.
//   · A club's members can be searched by surname or membership number.
//   · A card says when it was played, where, over 9 or 18 holes, and its
//     gross and Stableford totals with the handicap of the day. Hole-by-
//     hole scores are welcome and optional: nothing here needs them.
//   · Only cards Golf Ireland accepted are listed. A card that disappears
//     from the list was withdrawn, and goes from the league too.
//
// If any of that turns out wrong, the change belongs in the client and in
// `normaliseCard`, and nowhere else.
//
// ── What the organiser decides (in the league's creation form) ──
//
//   · Where the scores come from — scored live on Green Dot, from Golf
//     Ireland, or both (`ScoreSource`).
//   · Which Golf Ireland cards count (`GolfIrelandRules`) — every qualifying
//     card automatically, or only the ones each player puts forward; 18
//     holes, 9, or either; which days of the week; any course, or only the
//     league's own venues.
//
// ── What a player's link means ──────────────────────────────────
//
//   · The player ticks consent and picks themselves from a search: a link
//     requested, not made. The organiser confirms it — they know their
//     members, and nothing else proves a member is who they say — and
//     only then is a card read (`linkReadable`).
//   · Unlinking deletes their imported cards at once (decided October
//     2026), and their standing re-tells without them. A club withdrawing
//     does the same for every one of its members.

import { WEEKDAY_NAMES, weekdayOf } from './weekdays'

// Reading numbers out of what Golf Ireland sent — a figure outside sense
// is null, never clamped.
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const inRange = (v: number | null, lo: number, hi: number) =>
  v === null ? null : v >= lo && v <= hi ? v : null

// ─── Configuration ─────────────────────────────────────────────

export type GolfIrelandConfig = { clientId: string; clientSecret: string; apiBase: string }

/** The three keys from Vercel, or null when Golf Ireland is not set up. */
export function golfIrelandConfig(env: Record<string, string | undefined> = process.env): GolfIrelandConfig | null {
  const clientId = env.GOLF_IRELAND_CLIENT_ID?.trim()
  const clientSecret = env.GOLF_IRELAND_CLIENT_SECRET?.trim()
  const apiBase = env.GOLF_IRELAND_API_BASE?.trim().replace(/\/+$/, '')
  if (!clientId || !clientSecret || !apiBase) return null
  if (!/^https:\/\//.test(apiBase)) return null
  return { clientId, clientSecret, apiBase }
}

// ─── Where a league's scores come from ─────────────────────────

/**
 * `live` is every league before this question existed, and is the absent
 * default wherever it is stored. `both` lets a player score a league day
 * live and also have Golf Ireland cards count.
 */
export type ScoreSource = 'live' | 'golf_ireland' | 'both'

export const SCORE_SOURCES: { key: ScoreSource; label: string; hint: string }[] = [
  { key: 'live', label: 'Scored here', hint:
    'Players score each league day live on Green Dot.' },
  { key: 'golf_ireland', label: 'From Golf Ireland', hint:
    'Players hand in their cards to Golf Ireland as usual. Green Dot reads the ones that count.' },
  { key: 'both', label: 'Both', hint:
    'League days are scored live here, and Golf Ireland cards count as well.' },
]

/** Does this league score live on Green Dot? */
export const scoresLive = (s: ScoreSource | undefined) => s !== 'golf_ireland'
/** Does this league read cards from Golf Ireland? */
export const readsGolfIreland = (s: ScoreSource | undefined) => s === 'golf_ireland' || s === 'both'

// ─── Which cards count ─────────────────────────────────────────

/**
 * `automatic` — every card that meets the rules counts, as soon as it is
 * read. `player_picks` — a player puts forward the cards they want counted,
 * from those that meet the rules; nothing counts until they do.
 */
export type CardEntry = 'automatic' | 'player_picks'

export const CARD_ENTRIES: { key: CardEntry; label: string; hint: string }[] = [
  { key: 'automatic', label: 'Every round that qualifies', hint:
    'Any card that meets the rules below counts, as soon as it is read.' },
  { key: 'player_picks', label: 'Players choose', hint:
    'Each player picks which of their qualifying Golf Ireland rounds to put forward.' },
]

export type HoleRule = 18 | 9 | 'either'

export const HOLE_RULES: { key: HoleRule; label: string }[] = [
  { key: 18, label: '18 holes' },
  { key: 9, label: '9 holes' },
  { key: 'either', label: 'Either' },
]

export type CourseRule = 'any' | 'venues'

export const COURSE_RULES: { key: CourseRule; label: string; hint: string }[] = [
  { key: 'any', label: 'Any course', hint:
    'A card counts wherever it was played.' },
  { key: 'venues', label: 'League venues only', hint:
    'A card counts only if it was played at one of the league\'s own venues.' },
]

export type GolfIrelandRules = {
  /**
   * Golf Ireland's ids for the clubs the league draws its members from —
   * only clubs that have granted Green Dot access are offered. At least
   * one; ascending, once each.
   */
  clubs: string[]
  entry: CardEntry
  holes: HoleRule
  /**
   * The days of the week a card may be played on (0 = Sunday … 6 =
   * Saturday), ascending. Absent means any day — and so does every day
   * ticked, which is stored as absent.
   */
  weekdays?: number[]
  courses: CourseRule
}

/**
 * What the form starts on: every 18-hole card, any day, anywhere — the
 * clubs given, because there is no sensible default for those. A club's
 * own winter league starts with its one club.
 */
export function defaultRules(clubs: readonly string[] = []): GolfIrelandRules {
  return { clubs: tidyClubs(clubs) ?? [], entry: 'automatic', holes: 18, courses: 'any' }
}

/**
 * Read stored rules. Complete rules come back whole and tidy; anything
 * missing a required answer comes back null — dropped, never repaired, the
 * same posture as every parser on the platform.
 */
export function parseGolfIrelandRules(raw: unknown): GolfIrelandRules | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const clubs = tidyClubs(r.clubs)
  const entry = CARD_ENTRIES.find(e => e.key === r.entry)?.key
  const holes = HOLE_RULES.find(h => h.key === r.holes)?.key
  const courses = COURSE_RULES.find(c => c.key === r.courses)?.key
  // No club means no member can ever be found, so rules without one are
  // not rules — dropped, like any other missing answer.
  if (!clubs || !entry || holes === undefined || !courses) return null

  const weekdays = tidyWeekdays(r.weekdays)
  return { clubs, entry, holes, ...(weekdays ? { weekdays } : {}), courses }
}

/** Club ids as stored: non-blank strings, trimmed, once each, ascending. Null when none. */
export function tidyClubs(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const ids = [...new Set(raw
    .filter((c): c is string => typeof c === 'string')
    .map(c => c.trim())
    .filter(Boolean))].sort()
  return ids.length > 0 ? ids : null
}

/**
 * Weekdays as stored: whole numbers 0–6, once each, ascending. Null when
 * that leaves none or all seven — both mean "any day", which is absent.
 */
export function tidyWeekdays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  const days = [...new Set(raw.filter((d): d is number =>
    Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
  return days.length === 0 || days.length === 7 ? null : days
}

/** "Saturdays", "Saturdays and Sundays", "Tuesdays, Thursdays and Saturdays". */
export function describeWeekdays(days: readonly number[]): string {
  const names = days.map(d => `${WEEKDAY_NAMES[d]}s`)
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The rules in the facts style a board uses — "18 holes · Saturdays · league venues · players choose". */
export function describeRules(rules: GolfIrelandRules): string {
  const parts = [
    rules.holes === 'either' ? '9 or 18 holes' : `${rules.holes} holes`,
    rules.weekdays ? describeWeekdays(rules.weekdays) : 'any day',
    rules.courses === 'venues' ? 'league venues' : 'any course',
  ]
  if (rules.entry === 'player_picks') parts.push('players choose')
  return parts.join(' · ')
}

// ─── Clubs ─────────────────────────────────────────────────────
//
// A club is the unit of access: Golf Ireland opens one club's members to
// Green Dot, with that club's permission. The credential itself is a
// secret and never leaves the server (lib/golfIrelandClient.ts,
// `golf_ireland_clubs`); what is decided here is only whether it stands.

export type ClubAccess = {
  clubId: string
  name: string
  /** When the club's permission was recorded. */
  grantedAt: string
  /** When the club withdrew it, or null while it stands. */
  withdrawnAt: string | null
}

/** Why Green Dot cannot read this club's members, or null when it can. */
export function clubIssue(club: ClubAccess | null | undefined): string | null {
  if (!club) return 'That club has not given Green Dot access to its members.'
  if (club.withdrawnAt) return `${club.name || 'That club'} has withdrawn Green Dot's access to its members.`
  return null
}

// ─── Finding yourself in the membership ────────────────────────
//
// The search lets a player find *themselves*. It must never become a way
// to browse a club's members, which is the club's data, not the player's:
// a search needs a surname or a membership number, answers only close
// matches, at most a handful, and shows only enough to recognise yourself.

/** A search by surname, or by membership number — nothing looser. */
export type MemberQuery =
  | { kind: 'surname'; surname: string }
  | { kind: 'number'; number: string }

/** The fewest letters a surname search takes. "O" is a browse, not a search. */
export const MIN_SURNAME_LETTERS = 2

/** The most matches a search shows. More than this asks for the number instead. */
export const MAX_MEMBER_MATCHES = 5

/**
 * What a player typed, as a search — or a sentence saying why it is not
 * one. Anything with five or more digits is a membership number; anything
 * else is a surname, which needs two letters.
 */
export function parseMemberQuery(input: string): MemberQuery | { issue: string } {
  const typed = input.trim()
  const compact = typed.replace(/[\s-]/g, '')
  if (/\d/.test(compact)) {
    // Golf Ireland's number format is not known yet; up to three letters
    // then five or more digits covers the shapes seen on Irish cards.
    return /^[A-Za-z]{0,3}\d{5,}$/.test(compact)
      ? { kind: 'number', number: compact.toUpperCase() }
      : { issue: 'A membership number is five digits or more.' }
  }
  if (foldName(typed).length < MIN_SURNAME_LETTERS) {
    return { issue: 'Type your surname, or your membership number.' }
  }
  return { kind: 'surname', surname: typed }
}

/**
 * A name folded for comparing: case, accents, apostrophes, spaces and
 * hyphens gone — O'Grady, OGrady, O Grady and Ó Grádaigh's accents all
 * meet. The stored name is never changed; this is only for matching.
 */
export function foldName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '')
}

/** A member of a club, as this app holds one — checked, never raw. */
export type GolfIrelandMember = {
  memberId: string
  clubId: string
  firstName: string
  surname: string
  /** Their current handicap index, when Golf Ireland says. */
  handicapIndex: number | null
}

/** A member from the client, checked: the member, or null when it cannot be trusted. */
export function normaliseMember(raw: unknown): GolfIrelandMember | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''
  const memberId = str(r.memberId)
  const clubId = str(r.clubId)
  const surname = str(r.surname)
  if (!memberId || !clubId || !surname) return null
  return {
    memberId,
    clubId,
    firstName: str(r.firstName),
    surname,
    handicapIndex: inRange(num(r.handicapIndex), -10, 54),
  }
}

/**
 * The membership number with all but its last three characters hidden —
 * enough for somebody to recognise their own, not enough to read anyone
 * else's.
 */
export function maskMembershipNumber(id: string): string {
  const shown = 3
  if (id.length <= shown) return '•'.repeat(id.length)
  return `${'•'.repeat(id.length - shown)}${id.slice(-shown)}`
}

/** One search result as the browser sees it: a name, a masked number, and a sealed pick. */
export type MemberMatch = { name: string; masked: string; clubId: string; memberId: string }

/**
 * What a search may show, from what the club's membership answered.
 *
 * Only members of the league's clubs, and only exact matches: the same
 * surname once folded, or the same membership number. A partial match is
 * never shown, because "Gr" matching every Grady, Graham and Grant is the
 * browse this exists to prevent. More than `MAX_MEMBER_MATCHES` shows none
 * and says so, rather than showing a page of strangers.
 *
 * `memberId` is on each match for the server to seal (`MemberPick`) — the
 * route sends the browser the name, the masked number and the seal, never
 * the id itself.
 */
export function memberMatches(
  members: readonly GolfIrelandMember[], query: MemberQuery, leagueClubs: readonly string[],
): { matches: MemberMatch[]; tooMany: boolean } {
  const want = query.kind === 'surname' ? foldName(query.surname) : query.number
  const found = members.filter(m => leagueClubs.includes(m.clubId) && (query.kind === 'surname'
    ? foldName(m.surname) === want
    : m.memberId.replace(/[\s-]/g, '').toUpperCase() === want))
  const unique = [...new Map(found.map(m => [`${m.clubId}:${m.memberId}`, m])).values()]
  if (unique.length > MAX_MEMBER_MATCHES) return { matches: [], tooMany: true }
  return {
    matches: unique
      .map(m => ({
        name: [m.firstName, m.surname].filter(Boolean).join(' '),
        masked: maskMembershipNumber(m.memberId),
        clubId: m.clubId,
        memberId: m.memberId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.masked.localeCompare(b.masked)),
    tooMany: false,
  }
}

/**
 * A search result the player picked, as it travels through the browser and
 * back — sealed by the server with its secret (`sealJson` in
 * lib/signedState.ts), so a player can only ask to link a member the
 * search actually showed them, in this league, for this player, in time.
 */
export type MemberPick = { tripCode: string; playerId: string; clubId: string; memberId: string; expires: number }

/** Ten minutes from the search to the pick. */
export const MEMBER_PICK_TTL_MS = 10 * 60 * 1000

/** A pick as sealed — short keys, it travels in a request. */
export function packPick(p: MemberPick): Record<string, string | number> {
  return { t: p.tripCode, p: p.playerId, c: p.clubId, m: p.memberId, e: p.expires }
}

/** An opened seal as a pick, if it is one and still in time; null otherwise. */
export function unpackPick(raw: unknown, now: number): MemberPick | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const s = (v: unknown) => typeof v === 'string' && v.length > 0
  if (!s(r.t) || !s(r.p) || !s(r.c) || !s(r.m) || typeof r.e !== 'number') return null
  if (r.e < now) return null
  return { tripCode: r.t as string, playerId: r.p as string, clubId: r.c as string, memberId: r.m as string, expires: r.e }
}

// ─── Links ─────────────────────────────────────────────────────

/** A player's link to a member, as stored (`golf_ireland_links`). */
export type MemberLink = {
  playerId: string
  memberId: string
  clubId: string
  consentedAt: string
  /** When the organiser confirmed it; null while it is only requested. */
  confirmedAt: string | null
}

/**
 * Why this player cannot ask to link this member, or null when they can.
 * One member feeds one player per league, and one player has one member —
 * the rule the database also holds (UNIQUE on both).
 */
export function linkIssue(args: {
  playerId: string
  pick: Pick<MemberPick, 'clubId' | 'memberId'>
  rules: GolfIrelandRules
  club: ClubAccess | null | undefined
  links: readonly MemberLink[]
  consented: boolean
}): string | null {
  const { playerId, pick, rules, club, links, consented } = args
  if (!consented) return 'Tick the box to agree before linking.'
  if (!rules.clubs.includes(pick.clubId)) return 'That member is not at one of this league\'s clubs.'
  const clubProblem = clubIssue(club)
  if (clubProblem) return clubProblem
  const mine = links.find(l => l.playerId === playerId)
  if (mine) {
    return mine.memberId === pick.memberId && mine.clubId === pick.clubId
      ? 'You have already asked to link this member.'
      : 'You are linked to another member. Unlink first.'
  }
  if (links.some(l => l.memberId === pick.memberId)) {
    return 'That member is already linked to somebody in this league.'
  }
  return null
}

/**
 * May this link's cards be read? Only once the organiser has confirmed it,
 * and only while its club's access stands. A requested link reads nothing.
 */
export function linkReadable(link: MemberLink, club: ClubAccess | null | undefined): boolean {
  return link.confirmedAt !== null && clubIssue(club) === null
}

/** What a player sees about their own link — "Waiting for the organiser to confirm", and so on. */
export function describeLink(link: MemberLink | null, club: ClubAccess | null | undefined): string {
  if (!link) return 'Not linked to Golf Ireland.'
  const clubProblem = clubIssue(club)
  if (clubProblem) return clubProblem
  return link.confirmedAt
    ? 'Linked. Your Golf Ireland cards are read into the league.'
    : 'Waiting for the organiser to confirm it is you.'
}

// ─── A card from Golf Ireland ──────────────────────────────────

/** A Golf Ireland card as this app holds it — checked, never raw. */
export type GolfIrelandCard = {
  /** Golf Ireland's own id for the card. */
  cardId: string
  /** `YYYY-MM-DD`, the day it was played. */
  playedOn: string
  holesPlayed: 9 | 18
  /** Golf Ireland's id for the course, when it gave one. */
  courseId: string | null
  courseName: string
  grossTotal: number | null
  stablefordPoints: number | null
  /** The player's handicap index on the day — the official figure. */
  handicapIndex: number | null
  /** The course handicap Golf Ireland played them off, when it says. */
  courseHandicap: number | null
  /** Gross per hole, in hole order, when Golf Ireland gives it. Null = a pick-up. */
  holeScores: (number | null)[] | null
}

/** The highest gross a hole can sensibly carry; a misread past it is refused. */
export const MAX_HOLE_GROSS = 20

/**
 * A card from the client, checked: the card if it can be trusted, null if
 * it cannot. A card with nothing to score — no gross and no points — is
 * refused; so is a date that is not one, or a hole count other than 9 or
 * 18. A figure outside sense costs that figure, not the card: an absurd
 * handicap index is dropped, and hole scores that disagree with the gross
 * are dropped in favour of Golf Ireland's own total, which is the official
 * one.
 */
export function normaliseCard(raw: unknown): GolfIrelandCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const cardId = typeof r.cardId === 'string' ? r.cardId.trim() : ''
  const playedOn = typeof r.playedOn === 'string' ? r.playedOn.slice(0, 10) : ''
  const holesPlayed = r.holesPlayed === 9 || r.holesPlayed === 18 ? r.holesPlayed : null
  if (!cardId || weekdayOf(playedOn) === null || !holesPlayed) return null

  const grossTotal = inRange(int(r.grossTotal), holesPlayed, holesPlayed * MAX_HOLE_GROSS)
  // Six a hole is a hole-in-one on a par 5 off a big handicap — past that
  // is a misread.
  const stablefordPoints = inRange(int(r.stablefordPoints), 0, holesPlayed * 6)
  if (grossTotal === null && stablefordPoints === null) return null

  let holeScores: (number | null)[] | null = null
  if (Array.isArray(r.holeScores) && r.holeScores.length === holesPlayed) {
    const holes = r.holeScores.map(h => h === null ? null : inRange(int(h), 1, MAX_HOLE_GROSS))
    const allRead = r.holeScores.every((h, i) => h === null || holes[i] !== null)
    const complete = holes.every(h => h !== null)
    const sum = holes.reduce<number>((a, h) => a + (h ?? 0), 0)
    // A full card must add up to the gross; a card with pick-ups has no
    // gross to agree with, so it is taken as read.
    if (allRead && (!complete || grossTotal === null || sum === grossTotal)) holeScores = holes
  }

  const courseId = typeof r.courseId === 'string' && r.courseId.trim() ? r.courseId.trim() : null
  const courseName = typeof r.courseName === 'string' ? r.courseName.trim() : ''

  return {
    cardId,
    playedOn,
    holesPlayed,
    courseId,
    courseName,
    grossTotal,
    stablefordPoints,
    // WHS runs from +10-ish to 54; a figure outside that is not a handicap.
    handicapIndex: inRange(num(r.handicapIndex), -10, 54),
    courseHandicap: inRange(int(r.courseHandicap), -15, 72),
    holeScores,
  }
}

// ─── Does a card count? ────────────────────────────────────────

/**
 * What the rules are read against. `from`/`to` are the league's dates,
 * inclusive; a series has no finish, and no start beyond the day it was
 * made (`leagueWindow`). `venueCourseIds` are the Golf Ireland ids of the
 * league's venues — only read when the rules say venues only. `liveDates`
 * are the days this player already has a Green Dot card for in this league
 * — only read when the league scores both ways.
 */
export type CardContext = {
  from: string | null
  to: string | null
  venueCourseIds: readonly string[]
  source: ScoreSource
  liveDates?: readonly string[]
  /**
   * A league of rounds (a series): a card counts only as one of these
   * rounds — played on its date, at its venue (`roundForCard`). Absent for
   * any other league, whose cards are read against the window alone.
   */
  rounds?: readonly RoundVenue[]
}

/**
 * The window a league's cards must fall inside: its dates when it has
 * them, otherwise from the day it was made with no end — a series is still
 * a league that began somewhere, and a card from before it existed was
 * never played in it.
 */
export function leagueWindow(trip: {
  start_date: string | null; end_date: string | null; created_at: string
}): { from: string; to: string | null } {
  return {
    from: trip.start_date ?? trip.created_at.slice(0, 10),
    to: trip.start_date ? (trip.end_date ?? trip.start_date) : null,
  }
}

/**
 * Why this card does not count, in a sentence a player can read on their
 * own list — or null when it does. The first reason found is the one
 * given, in the order a player would think of them: when, how long, which
 * day, where.
 */
export function cardIssue(card: GolfIrelandCard, rules: GolfIrelandRules, ctx: CardContext): string | null {
  if (!readsGolfIreland(ctx.source)) return 'This league does not read Golf Ireland cards.'

  if (ctx.from && card.playedOn < ctx.from) return 'Played before the league started.'
  if (ctx.to && card.playedOn > ctx.to) return 'Played after the league finished.'

  if (rules.holes !== 'either' && card.holesPlayed !== rules.holes) {
    return `A ${card.holesPlayed}-hole round. This league counts ${rules.holes}-hole rounds.`
  }

  const day = weekdayOf(card.playedOn)!
  if (rules.weekdays && !rules.weekdays.includes(day)) {
    return `Played on a ${WEEKDAY_NAMES[day]}. This league counts ${describeWeekdays(rules.weekdays)}.`
  }

  if (rules.courses === 'venues' && !(card.courseId && ctx.venueCourseIds.includes(card.courseId))) {
    return 'Not played at one of the league\'s venues.'
  }

  // A league of rounds: the card is one of the rounds or it is nothing.
  // The reason names which half missed, because "wrong venue" and "the
  // venue is not matched yet" are fixed by different people.
  if (ctx.rounds) {
    const sameDay = ctx.rounds.filter(r => r.date === card.playedOn)
    if (sameDay.length === 0) return 'Not played on the day of a league round.'
    if (!roundForCard(card, ctx.rounds)) {
      return sameDay.every(r => !r.venueId)
        ? 'That round\'s venue is not matched to Golf Ireland yet.'
        : 'Not played at that round\'s venue.'
    }
  }

  // Scored both ways: a player who scored the day live here has that card
  // in the league already, and the same round must not count twice. The
  // Green Dot card is the league day's own, so it is the one kept.
  if (ctx.source === 'both' && ctx.liveDates?.includes(card.playedOn)) {
    return 'Already scored on Green Dot that day.'
  }

  return null
}

// ─── Which round a card is ─────────────────────────────────────
//
// In a league of rounds a Golf Ireland card belongs to a round when it was
// played on that round's date at that round's venue (Ross's story,
// docs/event-use-cases.md). Worked out each time the cards are read, never
// stored: a round re-dated or given its venue later picks up its cards
// with nothing to migrate. The way out of a wrong match is the round's
// gear — the same per-player card switch (`cardKey`) a live card uses.

/**
 * A league round as a card is matched against it: Golf Ireland's id for
 * its venue (`courses.golf_ireland_id`) is null while the venue is not
 * matched. A TBC round has no round yet, so it is never in the list.
 */
export type RoundVenue = { roundId: string; date: string | null; venueId: string | null }

/** The round this card was played as, or null. Pure. */
export function roundForCard(
  card: Pick<GolfIrelandCard, 'playedOn' | 'courseId'>, rounds: readonly RoundVenue[],
): string | null {
  if (!card.courseId) return null
  return rounds.find(r => r.date === card.playedOn && r.venueId === card.courseId)?.roundId ?? null
}

/**
 * A Golf Ireland card as a league board reads it — one player's round,
 * totals only. `points` is Golf Ireland's own Stableford, off their
 * handicap of the day; `courseHandicap` is what a strokes board takes off
 * the gross. lib/boardRows.ts reads these beside the live cards.
 */
export type RoundCard = {
  roundId: string
  playerId: string
  cardId: string
  holes: 9 | 18
  points: number | null
  gross: number | null
  courseHandicap: number | null
}

/** A stored card, as the board's reader fetches it. */
export type HeldCard = Pick<GolfIrelandCard,
  'cardId' | 'playedOn' | 'courseId' | 'holesPlayed' | 'stablefordPoints' | 'grossTotal' | 'courseHandicap'
> & { playerId: string }

/**
 * Stored cards placed on their rounds. A card on no round is left out.
 * One card per player per round: a second the same day at the same venue
 * (two rounds in a day) is set aside, the lower card id kept so every
 * screen keeps the same one.
 */
export function cardsOnRounds(cards: readonly HeldCard[], rounds: readonly RoundVenue[]): RoundCard[] {
  const out = new Map<string, RoundCard>()
  const ordered = [...cards].sort((a, b) => a.cardId.localeCompare(b.cardId))
  for (const c of ordered) {
    const roundId = roundForCard(c, rounds)
    if (!roundId) continue
    const key = `${roundId}:${c.playerId}`
    if (out.has(key)) continue
    out.set(key, {
      roundId, playerId: c.playerId, cardId: c.cardId, holes: c.holesPlayed,
      points: c.stablefordPoints, gross: c.grossTotal, courseHandicap: c.courseHandicap,
    })
  }
  return [...out.values()]
}

// ─── What a sync should do ─────────────────────────────────────

/** A card already imported for this player in this league. */
export type StoredCard = { cardId: string }

export type ImportPlan = {
  /** Cards to write — new ones, and fresh copies of ones already held. */
  upsert: GolfIrelandCard[]
  /** Card ids to delete from the league. */
  remove: string[]
}

/**
 * What one player's sync adds and removes, from what is stored and what
 * Golf Ireland just listed.
 *
 * · Automatic: every card that counts is written; a stored card that no
 *   longer counts — the rules changed, or Golf Ireland corrected it — goes.
 * · Players choose: only cards already put forward are refreshed or
 *   removed. A sync never puts a card forward for anybody (`pickIssue`
 *   is the door for that).
 * · Either way, a stored card missing from the list is removed **only when
 *   the list was complete**: a card missing from a list cut short may be on
 *   the page not read.
 */
export function planImport(args: {
  stored: readonly StoredCard[]
  fetched: readonly GolfIrelandCard[]
  rules: GolfIrelandRules
  ctx: CardContext
  complete: boolean
}): ImportPlan {
  const { stored, fetched, rules, ctx, complete } = args
  const held = new Set(stored.map(s => s.cardId))
  const listed = new Map(fetched.map(c => [c.cardId, c]))

  const upsert: GolfIrelandCard[] = []
  const remove: string[] = []

  for (const card of listed.values()) {
    const counts = cardIssue(card, rules, ctx) === null
    const isHeld = held.has(card.cardId)
    if (counts && (isHeld || rules.entry === 'automatic')) upsert.push(card)
    else if (!counts && isHeld) remove.push(card.cardId)
  }
  if (complete) {
    for (const id of held) if (!listed.has(id)) remove.push(id)
  }

  return { upsert, remove }
}

/**
 * Why this card cannot be put forward, or null when it can — the players-
 * choose door. The card's own rules first, so a refusal names the real
 * reason rather than the league's mode.
 */
export function pickIssue(
  card: GolfIrelandCard, rules: GolfIrelandRules, ctx: CardContext, stored: readonly StoredCard[],
): string | null {
  if (rules.entry !== 'player_picks') return 'Every qualifying round counts in this league already.'
  const issue = cardIssue(card, rules, ctx)
  if (issue) return issue
  if (stored.some(s => s.cardId === card.cardId)) return 'This round is already in the league.'
  return null
}
