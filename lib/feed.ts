// The feed and its streams (social v1, D293–D307) — the only copy of the
// rules. Pure: no database, no Next, a clock handed in, so `test:feed` runs
// every rule on its own. The server half is app/api/feed/.
//
// What the feed is: Green Dot members' signed cards, highlights, comments,
// match results and leaderboard moves, split into **streams** a member
// chooses (D300): Friends, a Club (inside that club's area only), Comp (one
// stream with a picker of recent comps), and Team (an interclub panel —
// once the Clubhouse has interclub teams). Nobody without an account is in
// it (D94), juniors get nothing social, runs never appear.
//
// **Who sees an item is decided here and on the server, never on a phone**
// (D305): `mayView` is the one rule, and every comment, dot and highlight
// follows its card (D301).

// ─── Audience (D296) ────────────────────────────────────────────

/** A member's audience. Close friends is not built (Ross, 24 Nov 2026). */
export type Audience = 'wide' | 'me'

export const AUDIENCES: readonly { key: Audience; label: string; line: string }[] = [
  { key: 'wide', label: 'Friends and my clubs', line: 'Your friends, and the people you share a club, competition or team with.' },
  { key: 'me', label: 'Only me', line: 'Nobody else sees your cards in the feed. Leaderboards, scorecards and tee sheets are unchanged.' },
]

export const DEFAULT_AUDIENCE: Audience = 'wide'

export function readAudience(v: unknown): Audience | null {
  return v === 'wide' || v === 'me' ? v : null
}

export function audienceLabel(a: Audience): string {
  return AUDIENCES.find(x => x.key === a)?.label ?? AUDIENCES[0].label
}

/**
 * The audience an item is shown to: **Only me in the member's settings
 * always wins** (D296's test: Only me hides every item from every other
 * member); otherwise the card's own choice at signing, else the setting.
 */
export function effectiveAudience(setting: Audience | null | undefined, override: Audience | null | undefined): Audience {
  if (setting === 'me') return 'me'
  return override ?? setting ?? DEFAULT_AUDIENCE
}

// ─── Items ─────────────────────────────────────────────────────

export type FeedKind = 'card' | 'highlight' | 'comment' | 'board_move' | 'match_result' | 'status' | 'post'

/** The kinds that stand in a stream on their own (everything but what hangs off a card). */
export const TOP_KINDS: readonly FeedKind[] = ['card', 'board_move', 'match_result', 'status', 'post']

/** The kinds a member may comment on and dot (D301, D329): anything standing on its own but a leaderboard move. */
export function talksOn(kind: FeedKind): boolean {
  return kind === 'card' || kind === 'match_result' || kind === 'status' || kind === 'post'
}

/** What every visibility question needs to know about an item. */
export interface ItemFacts {
  id: string
  kind: FeedKind
  authorId: string | null
  parentId: string | null
  tripId: string | null
  clubId: string | null
  /** The effective audience (`effectiveAudience`). */
  audience: Audience
  removed: boolean
  /** A status written before its card exists (a club card waiting for its marker) — never shown. */
  held: boolean
  /** Where a standalone status was posted: 'friends', or a match stream 'match:<id>' (D326, D328). */
  stream?: string | null
}

/** What the server knows about the person looking. */
export interface Viewer {
  userId: string
  junior: boolean
  friends: ReadonlySet<string>
  /** Verified clubs whose list the viewer is on (linked, not taken off). */
  clubs: ReadonlySet<string>
  /** Events the viewer is in — asked for the one event a Comp stream shows. */
  events: ReadonlySet<string>
  /** Match streams the viewer follows, as 'match:<id>' (D326) — none until interclub teams exist. */
  follows?: ReadonlySet<string>
  /** The stream groups the viewer is in (D343), by id. */
  groups?: ReadonlySet<string>
  /** Everybody who shares a group with the viewer (D343) — their signed cards reach the group. */
  groupmates?: ReadonlySet<string>
}

/**
 * May this viewer see this item at all? The one rule (D305). A comment,
 * dot or highlight hanging off a card asks it of the card (`mayViewChild`).
 *
 * - Taken down or held: nobody.
 * - A junior sees nothing; nothing is ever written about one (D304).
 * - The author always sees their own.
 * - Only me: nobody else.
 * - Friends and my clubs: friends, and anybody sharing the place it
 *   happened — its club, or its event.
 */
export function mayView(item: ItemFacts, viewer: Viewer): boolean {
  if (item.removed || item.held || viewer.junior) return false
  if (item.authorId && item.authorId === viewer.userId) return true
  // The club's official word (D325): everybody on its list, whatever its poster's own setting.
  if (item.kind === 'post') return !!item.clubId && viewer.clubs.has(item.clubId)
  if (item.audience === 'me') return false
  // A status in a match stream: its followers only (D326).
  if (isMatchStream(item.stream)) return !!viewer.follows?.has(item.stream as string)
  // A post in a stream group: its members only (D343).
  if (isGroupStream(item.stream)) return !!viewer.groups?.has(groupIdOf(item.stream as string))
  if (item.authorId && viewer.friends.has(item.authorId)) return true
  // A groupmate's card reaches the groups they share (D343), where its own audience allows.
  if (item.authorId && viewer.groupmates?.has(item.authorId)) return true
  if (item.clubId && viewer.clubs.has(item.clubId)) return true
  if (item.tripId && viewer.events.has(item.tripId)) return true
  return false
}

/** A comment (or a card's highlight) is seen exactly when its card is (D301). */
export function mayViewChild(child: Pick<ItemFacts, 'removed' | 'held'>, parent: ItemFacts | null, viewer: Viewer): boolean {
  if (!parent || child.removed || child.held) return false
  return mayView(parent, viewer)
}

// ─── Streams (D294, D300; Streams v2 — D318–D332) ───────────────

/**
 * The streams (D321, D343): club.stream (the club's official posts — only in
 * its own area), comp.stream (competitions, club match plays among them —
 * D332), match.stream (head-to-head; vacant until a club lists interclub
 * teams — D332) and **stream groups** — a group a member made and added
 * friends to, each its own stream (D343, Ross, 25 Nov 2026), in
 * friends.stream's place. 'friends' is still read for what was posted
 * there, never offered.
 */
export type StreamKind = 'club' | 'comp' | 'match' | 'friends' | 'group'

/** A stream as stored in a member's list: a club's by id, the other three by name. */
export type StreamRef =
  | { kind: 'friends' }
  | { kind: 'comp' }
  | { kind: 'match' }
  | { kind: 'club'; id: string }
  | { kind: 'group'; id: string }

export function streamKey(s: StreamRef): string {
  return s.kind === 'club' ? `club:${s.id}` : s.kind === 'group' ? `group:${s.id}` : s.kind
}

export function readStreamKey(v: unknown): StreamRef | null {
  if (v === 'friends' || v === 'comp' || v === 'match') return { kind: v }
  if (typeof v !== 'string') return null
  // A Team stream (D300) is match.stream now (D332).
  if (/^team:[0-9a-f-]{36}$/i.test(v)) return { kind: 'match' }
  const g = /^group:([0-9a-f-]{36})$/i.exec(v)
  if (g) return { kind: 'group', id: g[1].toLowerCase() }
  const m = /^club:([0-9a-f-]{36})$/i.exec(v)
  return m ? { kind: 'club', id: m[1].toLowerCase() } : null
}

/** The word before the dot (D321). */
export function streamWord(kind: StreamKind): string {
  return kind
}

/** The most streams a member keeps. */
export const MAX_STREAMS = 12

/** The mark a list saved under Streams v2 starts with — so turning match.stream off sticks. */
export const STREAMS_V2 = 'v2'

/** A list as it is kept: the mark, then the keys. */
export function keptStreams(list: readonly StreamRef[]): string[] {
  return [STREAMS_V2, ...list.map(streamKey)]
}

/**
 * A member's stored list read back: only streams that still mean something
 * (a club they are still on), each once. Nothing stored — or before
 * migration 102 — is the starting set: their clubs, comp, match, friends.
 */
export function readStreams(stored: unknown, clubs: readonly string[]): StreamRef[] {
  // friends.stream is no longer kept (D343) and a member's groups are never stored — `withGroups` adds them.
  const valid = (s: StreamRef) => s.kind !== 'friends' && s.kind !== 'group' && (s.kind !== 'club' || clubs.includes(s.id))
  if (Array.isArray(stored)) {
    const seen = new Set<string>()
    const out: StreamRef[] = []
    for (const raw of stored) {
      const s = readStreamKey(raw)
      if (!s || !valid(s) || seen.has(streamKey(s))) continue
      seen.add(streamKey(s))
      out.push(s)
      if (out.length >= MAX_STREAMS) break
    }
    // A list kept before Streams v2 (no STREAMS_V2 mark) gains match.stream, after comp (D332).
    if (stored[0] !== STREAMS_V2 && !seen.has('match')) {
      const at = out.findIndex(s => s.kind === 'comp')
      out.splice(at >= 0 ? at + 1 : out.length, 0, { kind: 'match' })
    }
    return out
  }
  return startingStreams(clubs)
}

export function startingStreams(clubs: readonly string[]): StreamRef[] {
  return [...clubs.map(id => ({ kind: 'club' as const, id })), { kind: 'comp' }, { kind: 'match' }]
}

/** A member's streams with their groups after them (D343): every group they are in, always shown. */
export function withGroups(streams: readonly StreamRef[], groupIds: readonly string[]): StreamRef[] {
  return [...streams, ...groupIds.map(id => ({ kind: 'group' as const, id }))]
}

/** Every stream a member could keep, in the order they are offered (D321). */
export function offeredStreams(clubs: readonly string[]): StreamRef[] {
  return startingStreams(clubs)
}

/**
 * The pills in order (D295 as amended): a live Comp first, then the rest as
 * the member keeps them. A club's stream only inside that club's area (D294),
 * never on /home.
 */
export function pillsFor(streams: readonly StreamRef[], o: { here: string | null; compLive: boolean }): StreamRef[] {
  const shown = streams.filter(s => (s.kind === 'club' ? s.id === o.here : true))
  if (!o.compLive) return shown
  const comp = shown.filter(s => s.kind === 'comp')
  return [...comp, ...shown.filter(s => s.kind !== 'comp')]
}

/** A match stream's key, 'match:<id>' (D326). */
export function isMatchStream(v: unknown): boolean {
  return typeof v === 'string' && /^match:[0-9a-f-]{36}$/i.test(v)
}

/** A stream group's key, 'group:<id>' (D343). */
export function isGroupStream(v: unknown): boolean {
  return typeof v === 'string' && /^group:[0-9a-f-]{36}$/i.test(v)
}
export function groupIdOf(key: string): string {
  return key.slice('group:'.length).toLowerCase()
}

// ─── Stream groups (D343) ───────────────────────────────────────

/** A group's name, at most this long. */
export const GROUP_NAME_MAX = 40
/** The most people in one group. */
export const GROUP_MAX_MEMBERS = 50
/** The most groups one member is in. */
export const GROUPS_MAX = 20

export function groupNameIssue(name: string): string | null {
  const t = name.trim()
  if (!t) return 'Give the group a name.'
  if ([...t].length > GROUP_NAME_MAX) return `Keep the name to ${GROUP_NAME_MAX} characters.`
  return null
}

export interface GroupMember { userId: string; admin: boolean; joinedAt: string }

/**
 * Somebody leaving a group (D343): they go; if nobody is left the group goes
 * with them; if nobody left is an admin, the longest-standing member becomes
 * one — a group is never left with nobody to run it.
 */
export function leavePlan(members: readonly GroupMember[], leaving: string): { deleteGroup: boolean; promote: string | null } {
  const rest = members.filter(m => m.userId !== leaving)
  if (rest.length === 0) return { deleteGroup: true, promote: null }
  if (rest.some(m => m.admin)) return { deleteGroup: false, promote: null }
  const first = [...rest].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId))[0]
  return { deleteGroup: false, promote: first.userId }
}

/**
 * Whom an admin may add (D343, Ross: "add friends to the group"): their own
 * accepted friends, not already in, never past the group's size.
 */
export function addIssue(o: { adderFriends: ReadonlySet<string>; members: readonly string[]; adding: readonly string[] }): string | null {
  if (o.adding.length === 0) return 'Choose somebody to add.'
  if (o.adding.some(id => !o.adderFriends.has(id))) return 'You can add your friends only.'
  if (o.adding.some(id => o.members.includes(id))) return 'Somebody chosen is in the group already.'
  if (o.members.length + o.adding.length > GROUP_MAX_MEMBERS) return `A group holds ${GROUP_MAX_MEMBERS} people at most.`
  return null
}

/**
 * Which stream an item belongs in (D321–D328). `pulled` is a card a friend
 * commented on (D327): it belongs in friends.stream too — the caller has
 * already asked `mayView` of the card itself, which is the guard.
 *
 * - friends: friends' (and your own) cards, statuses and results — never a
 *   club post, never a status posted to a match stream.
 * - club: the club's own posts only (D325) — its cards are comp.stream's.
 * - comp: one competition's cards and results — never a status or a post.
 * - match: statuses posted to that match stream (D326).
 * - group: what its members posted in it, and their signed cards and
 *   results (`o.members`, D343) — never a club post, never another stream's.
 */
export function inStream(
  item: Pick<ItemFacts, 'authorId' | 'tripId' | 'clubId'> & { kind?: FeedKind; stream?: string | null },
  stream: { kind: StreamKind; id?: string | null },
  viewer: Pick<Viewer, 'userId' | 'friends'>,
  o: { pulled?: boolean; members?: ReadonlySet<string> } = {},
): boolean {
  const kind = item.kind ?? 'card'
  switch (stream.kind) {
    case 'friends':
      if (kind === 'post' || isMatchStream(item.stream)) return false
      return !!o.pulled || (!!item.authorId && (item.authorId === viewer.userId || viewer.friends.has(item.authorId)))
    case 'club': return kind === 'post' && !!stream.id && item.clubId === stream.id
    case 'comp': return kind !== 'post' && kind !== 'status' && !!stream.id && item.tripId === stream.id
    case 'match': return !!stream.id && item.stream === `match:${stream.id}`
    case 'group':
      if (!stream.id) return false
      if (kind === 'status') return item.stream === `group:${stream.id}`
      return (kind === 'card' || kind === 'match_result') && !!item.authorId && !!o.members?.has(item.authorId)
  }
}

// ─── Comments grouped on their card (D329) ──────────────────────

/** A comment as the grouping needs it, newest first. */
export interface CommenterFacts { authorId: string | null; name: string }

/**
 * The line under a card (D329): "2 comments · John and 1 other". The name
 * is a friend of the viewer's who commented, if any — the most recent of
 * them — else the most recent commenter; "others" counts the other people,
 * so two comments from one person are "2 comments · John". Never the
 * viewer's own name: their own comment reads "You".
 */
export function commentLine(newestFirst: readonly CommenterFacts[], viewer: Pick<Viewer, 'userId' | 'friends'>): { count: string; who: string } | null {
  if (newestFirst.length === 0) return null
  const people: CommenterFacts[] = []
  const seen = new Set<string>()
  for (const c of newestFirst) {
    const k = c.authorId ?? `name:${c.name}`
    if (seen.has(k)) continue
    seen.add(k)
    people.push(c)
  }
  const lead = people.find(p => p.authorId && p.authorId !== viewer.userId && viewer.friends.has(p.authorId)) ?? people[0]
  const name = lead.authorId && lead.authorId === viewer.userId ? 'You' : lead.name
  const others = people.length - 1
  return {
    count: `${newestFirst.length} comment${newestFirst.length === 1 ? '' : 's'}`,
    who: others === 0 ? name : `${name} and ${others} other${others === 1 ? '' : 's'}`,
  }
}

// ─── Comps for the picker (D300) ────────────────────────────────

/** A comp offered in the Comp stream's picker. */
export interface CompRef {
  tripId: string
  code: string
  name: string
  /** The day it was (or starts) — for ordering and "most recent played". */
  date: string | null
  endDate: string | null
  /** The viewer plays in it (or entered it); else it is a club's comp they may watch. */
  playing: boolean
  /** Still going today (between its dates, or a match play still drawing results). */
  live: boolean
  clubId: string | null
  clubName: string | null
  /** Which heading of the menu it sits under (D323). Absent in a copy kept before: worked out by `compCategory`. */
  category?: CompCategory
}

/**
 * comp.stream's menu headings (D323): the club's competitions, its match
 * plays (D332 — club match plays live in comp.stream), and the member's own
 * events outside a club (trips and tournaments).
 */
export type CompCategory = 'club' | 'matchplay' | 'events'

export const COMP_CATEGORIES: readonly { key: CompCategory; label: string }[] = [
  { key: 'club', label: 'Club competitions' },
  { key: 'matchplay', label: 'Match play' },
  { key: 'events', label: 'Your events' },
]

export function compCategory(c: Pick<CompRef, 'category' | 'clubId'>): CompCategory {
  return c.category ?? (c.clubId ? 'club' : 'events')
}

/** The menu (D323): each heading with its comps newest first, a heading with none left out. */
export function compMenu(comps: readonly CompRef[], today: string): { key: CompCategory; label: string; comps: CompRef[] }[] {
  const shown = comps.filter(c => (c.date ?? '') <= today)
  return COMP_CATEGORIES.map(h => ({
    ...h,
    comps: shown.filter(c => compCategory(c) === h.key).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.name.localeCompare(b.name)),
  })).filter(h => h.comps.length > 0)
}

/** How long a finished comp stays in the picker. */
export const COMP_RECENT_DAYS = 30

/** The picker's order: the comps the viewer plays in, most recent first, then their clubs' others. */
export function orderComps(comps: readonly CompRef[]): CompRef[] {
  const by = (a: CompRef, b: CompRef) => (b.date ?? '').localeCompare(a.date ?? '') || a.name.localeCompare(b.name)
  return [...comps.filter(c => c.playing).sort(by), ...comps.filter(c => !c.playing).sort(by)]
}

/**
 * The comp the stream opens on (D323, amending D300): the most recent one
 * that is live or finished — one the member plays in first among those on
 * the same day — never one still to come.
 */
export function defaultComp(comps: readonly CompRef[], today: string): CompRef | null {
  const started = comps.filter(c => !!c.date && c.date <= today)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || Number(b.playing) - Number(a.playing) || Number(b.live) - Number(a.live) || a.name.localeCompare(b.name))
  return started[0] ?? null
}

/**
 * Which comp to show (D300, question 2, amended by D323): the one the member
 * picked, **kept until a newer comp goes live or finishes**. `pick` is what the
 * phone remembered — the comp chosen and the default it was chosen over. A
 * pick still to come is never shown.
 */
export function shownComp(comps: readonly CompRef[], today: string, pick: { code: string; over: string | null } | null): CompRef | null {
  const fallback = defaultComp(comps, today)
  if (!pick) return fallback
  if ((fallback?.code ?? null) !== pick.over) return fallback
  const picked = comps.find(c => c.code === pick.code)
  return picked && (picked.date ?? '') <= today ? picked : fallback
}

// ─── Cards, highlights, words ───────────────────────────────────

/** One hole of a signed card as the writers read it. */
export interface CardHoleFacts { number: number; par: number; gross: number | null; noReturn: boolean; points: number | null }

export interface CardFacts {
  holes: number
  /** Only for a card with every hole finished — an NR's figure is nobody's score. */
  gross: number | null
  points: number
  /** Holes made in two or more under par, gross. */
  eagles: number[]
  holesInOne: number[]
}

export function cardFacts(holes: readonly CardHoleFacts[]): CardFacts {
  const played = holes.filter(h => !h.noReturn && h.gross != null)
  const complete = holes.length > 0 && played.length === holes.length
  return {
    holes: holes.length,
    gross: complete ? played.reduce((a, h) => a + (h.gross as number), 0) : null,
    points: holes.reduce((a, h) => a + (h.points ?? 0), 0),
    eagles: played.filter(h => (h.gross as number) - h.par <= -2 && h.gross !== 1).map(h => h.number),
    holesInOne: played.filter(h => h.gross === 1).map(h => h.number),
  }
}

export type HighlightType = 'eagle' | 'hole_in_one' | 'personal_best' | 'handicap_cut' | 'won'

export interface Highlight { type: HighlightType; line: string }

/**
 * A card's own highlights (D302): eagle or better, a hole in one, and a
 * personal best — the lowest gross over a complete 18 at that course, with
 * at least one earlier card there to beat. `earlier` is those earlier grosses.
 */
export function cardHighlights(f: CardFacts, earlier: readonly number[], courseName: string | null): Highlight[] {
  const out: Highlight[] = []
  if (f.holesInOne.length) out.push({ type: 'hole_in_one', line: `Hole in one on the ${f.holesInOne.map(ordinal).join(' and ')}` })
  if (f.eagles.length) out.push({ type: 'eagle', line: f.eagles.length === 1 ? `Eagle on the ${ordinal(f.eagles[0])}` : `${f.eagles.length} eagles` })
  if (f.holes === 18 && f.gross != null && earlier.length > 0 && f.gross < Math.min(...earlier)) {
    out.push({ type: 'personal_best', line: `Personal best${courseName ? ` at ${courseName}` : ''}` })
  }
  return out
}

/** The handicap cut line: an account's index came down (D302). */
export function cutLine(name: string, now: number): string {
  return `${name} is cut to ${formatIndex(now)}`
}

export function wonLine(name: string, event: string): string {
  return `${name} won ${event}`
}

export function formatIndex(v: number): string {
  return v < 0 ? `+${(-v).toFixed(1)}` : v.toFixed(1)
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${s}`
}

/** A leaderboard move: written when a signed card puts its player into the top three. */
export function moveLine(name: string, place: number, tied: boolean): string {
  if (place === 1) return tied ? `${name} shares the lead` : `${name} takes the lead`
  return `${name} moves into ${tied ? 'a share of ' : ''}${ordinal(place)}`
}

export const MOVE_TOP = 3

/** A match result: "Ross beat Dave 3&2". */
export function matchLine(winner: string, loser: string, result: string | null): string {
  const r = (result ?? '').trim()
  return `${winner} beat ${loser}${r ? ` ${r}` : ''}`
}

/** The card's context line: "Saturday medal · Pints GC · co-signed by Mark". */
export function contextLine(d: { event?: string | null; club?: string | null; course?: string | null; marker?: string | null; round?: string | null }): string {
  return [d.event, d.round, d.club ?? d.course, d.marker ? `co-signed by ${d.marker}` : null].filter(Boolean).join(' · ')
}

// ─── Status and comments (D299, D301) ───────────────────────────

/** A card's status at signing (D299, D306) — unchanged. */
export const STATUS_MAX = 140
/** A status on its own (D328). */
export const OWN_STATUS_MAX = 280
/** A club post's words (D325). */
export const POST_MAX = 1000
export const COMMENT_MAX = 280
export const REPORT_REASON_MAX = 200

/** A status or comment as kept: one line of plain words, control characters out. */
export function cleanText(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max + 1)
}

/** Why a status cannot be kept — empty is fine (no status at all). */
export function statusIssue(text: string, max = STATUS_MAX): string | null {
  return [...text].length > max ? `Keep it to ${max} characters.` : null
}

/** A status on its own (D328): something to say, up to 280. */
export function ownStatusIssue(text: string): string | null {
  if (!text) return 'Write something first.'
  return statusIssue(text, OWN_STATUS_MAX)
}

/** A club post's words keep their line breaks (a notice has paragraphs); control characters out. */
export function cleanPost(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, POST_MAX + 1)
}

export function postIssue(text: string): string | null {
  if (!text) return 'Write something first.'
  return [...text].length > POST_MAX ? `Keep it to ${POST_MAX} characters.` : null
}

/**
 * A club post's one link (D325): https only, a real host, at most 500
 * characters. Empty is no link; anything else is refused with why.
 */
export function readLink(v: unknown): { link: string | null } | { issue: string } {
  const t = String(typeof v === 'string' ? v : '').trim()
  if (!t) return { link: null }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
  let u: URL
  try { u = new URL(withScheme) } catch { return { issue: 'That link doesn’t look right.' } }
  if (u.protocol !== 'https:') return { issue: 'Links start https://.' }
  if (!u.hostname.includes('.') || u.username || u.password) return { issue: 'That link doesn’t look right.' }
  const out = u.toString()
  return out.length > 500 ? { issue: 'That link is too long.' } : { link: out }
}

export function commentIssue(text: string): string | null {
  if (!text) return 'Write something first.'
  return [...text].length > COMMENT_MAX ? `Keep it to ${COMMENT_MAX} characters.` : null
}

/** The status box's counter: "44 / 140". */
export function counter(text: string, max = STATUS_MAX): string {
  return `${[...text].length} / ${max}`
}

// ─── Friends (D297) ─────────────────────────────────────────────

export const SEARCH_MIN = 2
export const SEARCH_LIMIT = 20
export const MAX_FRIENDS = 300
/** Searches an account may make in ten minutes — the directory is never browsable. */
export const SEARCH_RATE = { max: 60, windowMs: 10 * 60_000 }

/** A search typed: below two characters nothing is asked at all. */
export function searchTerm(q: unknown): string | null {
  const t = String(typeof q === 'string' ? q : '').replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return [...t].length >= SEARCH_MIN ? t : null
}

/** A friendship row: one per pair, the lower id first. */
export interface FriendRow { userA: string; userB: string; requestedBy: string; accepted: boolean }

export function pair(a: string, b: string): { userA: string; userB: string } {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a }
}

export function otherOf(r: Pick<FriendRow, 'userA' | 'userB'>, me: string): string {
  return r.userA === me ? r.userB : r.userA
}

/** Friends, and requests each way, from the rows involving `me`. */
export function friendState(rows: readonly FriendRow[], me: string): { friends: string[]; incoming: string[]; outgoing: string[] } {
  const friends: string[] = [], incoming: string[] = [], outgoing: string[] = []
  for (const r of rows) {
    if (r.userA !== me && r.userB !== me) continue
    const other = otherOf(r, me)
    if (r.accepted) friends.push(other)
    else if (r.requestedBy === me) outgoing.push(other)
    else incoming.push(other)
  }
  return { friends, incoming, outgoing }
}

/** Where a search result stands with the searcher. */
export type Standing = 'none' | 'friend' | 'asked' | 'asks_you'

export function standingWith(rows: readonly FriendRow[], me: string, other: string): Standing {
  const r = rows.find(x => (x.userA === me && x.userB === other) || (x.userB === me && x.userA === other))
  if (!r) return 'none'
  if (r.accepted) return 'friend'
  return r.requestedBy === me ? 'asked' : 'asks_you'
}

// ─── Paging, keeping, the shared copies (D305) ─────────────────

export const FEED_PAGE = 20
/** How many rows a page reads, so a few the viewer may not see still leave a page. */
export const FEED_READ = 40
/** Club and Comp streams: one shared server copy each, at most this old. */
export const FEED_COPY_SECONDS = 30
/** Items are deleted this long after they were made (the nightly cleanup). */
export const FEED_KEEP_DAYS = 400
/** A resolved report is deleted this long after. */
export const REPORT_KEEP_DAYS = 180
/** A held status whose card never arrived is let go. */
export const HELD_KEEP_HOURS = 48
/** The On the course strip counts a card live while a hole went in this recently. */
export const ON_COURSE_HOURS = 6

export interface Cursor { at: string; id: string }

export function readCursor(v: unknown): Cursor | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  return typeof c.at === 'string' && typeof c.id === 'string' && !Number.isNaN(Date.parse(c.at)) && /^[0-9a-f-]{36}$/i.test(c.id)
    ? { at: c.at, id: c.id } : null
}

/** Newest first, the id breaking a tie — the order every page reads in. */
export function newestFirst<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
}

/** Strictly older than the cursor, in that order. */
export function olderThan(c: Cursor | null) {
  return (x: { createdAt: string; id: string }) => !c || x.createdAt < c.at || (x.createdAt === c.at && x.id < c.id)
}

/** A short "when": "now", "12m", "3h", "2d", or the date. */
export function ago(at: string, now: Date): string {
  const ms = now.getTime() - Date.parse(at)
  if (!(ms >= 0)) return 'now'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', timeZone: 'Europe/Dublin' }).format(new Date(at))
}

// ─── The chat (D346) ────────────────────────────────────────────
//
// A stream reads as a chat (Ross, 26 Nov 2026: "Default to bottom of chat.
// New entries on the bottom"): every item and every reply on it is its own
// message, oldest at the top. A page is read latest activity first (D329),
// so a page holds every message from its cursor on — an item whose replies
// lifted it, and the older of those replies, wait until the page before is
// read, and the chat only ever grows upwards.

export interface ChatRoot { id: string; at: string; thread: { id: string; at: string }[] }
export type ChatEntry =
  | { kind: 'item'; id: string; at: string }
  | { kind: 'reply'; id: string; at: string; rootId: string }

/** The messages to show, oldest first: everything at or after `from` (the oldest page's cursor), or the lot once the stream is read to its start. */
export function chatTimeline(roots: ChatRoot[], from: string | null): ChatEntry[] {
  const out: ChatEntry[] = []
  const seen = new Set<string>()
  for (const r of roots) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (!from || r.at >= from) out.push({ kind: 'item', id: r.id, at: r.at })
    for (const c of r.thread) if (!from || c.at >= from) out.push({ kind: 'reply', id: c.id, at: c.at, rootId: r.id })
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

/**
 * What a reply quotes (D346): the reply it answers, when it answers one;
 * else a card is quoted as a small square of its own, and a status, a post
 * or a result by a note naming whose it was.
 */
export function replyQuote(root: { kind: FeedKind }, replyTo: string | null): 'comment' | 'card' | 'item' {
  return replyTo ? 'comment' : root.kind === 'card' ? 'card' : 'item'
}

/** "Replying to Dave" — the first name, or "you" for your own. */
export function replyNote(target: { name: string; mine: boolean }): string {
  return target.mine ? 'Replying to you' : `Replying to ${target.name.trim().split(/\s+/)[0] || 'a member'}`
}

// ─── Reports (D303) ─────────────────────────────────────────────

/** Where a report goes: a club card's to that club's Clubhouse, anything else to Green Dot's /admin. */
export function reportDestination(item: { clubId: string | null; kind: FeedKind }, parent: { clubId: string | null } | null): { clubId: string } | 'green_dot' {
  const clubId = item.kind === 'comment' ? parent?.clubId ?? null : item.clubId
  return clubId ? { clubId } : 'green_dot'
}

// ─── The empty streams ──────────────────────────────────────────

export function emptyLine(kind: StreamKind): string {
  switch (kind) {
    case 'friends': return 'Your friends’ rounds and statuses land here.'
    case 'club': return 'The club’s notices and news land here.'
    case 'comp': return 'Cards and results land here as they come in.'
    case 'match': return 'Interclub matches land here once your club lists its teams.'
    case 'group': return 'Nothing here yet — post to get it going. Members’ signed cards land here too.'
  }
}

/** What a stream is, in a line (the gear's list). */
export function streamAbout(kind: StreamKind): string {
  switch (kind) {
    case 'friends': return 'Your friends’ cards, statuses and comments'
    case 'club': return 'The club’s own posts — shown only in its area'
    case 'comp': return 'Competitions and club match plays, one at a time'
    case 'match': return 'Interclub matches you follow'
    case 'group': return 'A group you’re in: its posts and its members’ cards'
  }
}

export function streamLabel(s: StreamRef, names: { club?: (id: string) => string | null }): string {
  return s.kind === 'club' ? names.club?.(s.id) ?? 'club' : streamWord(s.kind)
}
