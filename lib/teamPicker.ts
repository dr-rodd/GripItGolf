// The team picker — teams and partnerships, made one way (Ross, 27 Oct 2026).
//
// A team is the group a leaderboard makes; a partnership the tight subset of
// teams that goes out together on one tee time (lib/partnerships.ts). Both
// are picked here, the same way: the picker does the linking, and whether a
// team binds the tee sheet is the partnership rule's, never the picker's.
// Tags — the umbrella groups that last the whole event — have their own
// portal and are not picked here.
//
// Who may do what (Ross's answer, 27 Oct 2026, "medium security", as the tee
// sheet keeps it):
//
//   · the organiser — the PIN unlocked on this phone, an event with no PIN,
//     or anybody on a trip, whose teams are the group's — makes, changes and
//     deletes any team, and may move a player from one team to another;
//   · a player, where a board on the sheet lets the field pick its own
//     teams (`teamPick: 'self'`), starts a team or joins one with room, adds
//     partners from the players not yet in a team, and takes out only
//     themselves and the people they added (`team_members.added_by`,
//     migration 066 — before it, themselves only);
//   · anybody else looks.
//
// Pure. No I/O — the screens write through lib/teamMembers.ts `setTeam`.

import { type Leaderboard, boardTitle } from './leaderboards'
import { type Membership, sheetsInUse, sheetForBoard } from './teamSets'
import { teamSizeLimit, teamNoun, type TeamNoun } from './teamLimits'
import { roundPartnership, isPairs, MAX_PARTNERSHIP } from './partnerships'
import { mayRemoveBooking } from './teeSheet'
import { TAG_SET, dayTeamTagIssue } from './tagBoards'
import { joinNames, firstName } from './matchplayEntrants'

/** One list of teams the picker manages — a sheet, and what is played on it. */
export type PickerSheet = {
  /** The sheet's id — `team_members.team_set`. */
  id: string
  /** What a team on it is called — team, or pairing in a pairs draw. */
  noun: TeamNoun
  /** "Team better ball · Pairs match play" — the leaderboards played on it. */
  boardTitles: string
  /** The most players a team may hold, or null. */
  cap: number | null
  /** The field forms its own teams here. */
  selfPick: boolean
  /** Its teams are partnerships — they go out together, and the tee sheet keeps them so. */
  together: boolean
}

/**
 * The lists of teams the picker manages: every sheet a team leaderboard is
 * played on, the event's tags apart (their portal) and a round's own
 * partnerships apart (made on that round's tee sheet). `rounds` and
 * `largestOn` let the partnership rule say which lists go out together.
 */
export function pickerSheets(
  boards: readonly Leaderboard[],
  rounds: readonly string[],
  largestOn: (sheet: string) => number = () => 0,
): PickerSheet[] {
  const out: PickerSheet[] = []
  for (const id of sheetsInUse(boards)) {
    const here = boards.filter(b =>
      b.audience === 'team' && !b.tagMode && sheetForBoard(b) === id)
    if (here.length === 0) continue
    const largest = largestOn(id)
    out.push({
      id,
      noun: teamNoun(here),
      boardTitles: here.map(boardTitle).join(' · '),
      cap: teamSizeLimit(here),
      selfPick: here.some(b => b.teamPick === 'self'),
      together: here.some(b => isPairs(b, largest))
        || rounds.some(r => roundPartnership(boards, r, largest)?.sheet === id),
    })
  }
  return out
}

/** A membership as the picker reads it — who added them, where recorded. */
export type PickerMember = Membership & { added_by?: string | null }

/** Who is holding the phone, as far as the picker is concerned. */
export type PickerViewer = {
  /** The organiser — see the note at the top. */
  organiser: boolean
  /** This phone's claimed player, or null. */
  meId: string | null
  /** The sheet lets the field pick its own teams. */
  selfPick: boolean
  /** Who added whom is recorded (migration 066). */
  addedRecorded: boolean
}

/** Whether this phone may change teams on the sheet at all. */
export function mayPick(v: PickerViewer): boolean {
  return v.organiser || (v.selfPick && !!v.meId)
}

/**
 * Whether this phone may take a player out of their team: the organiser
 * always; a player picking their own, themselves and anyone they added;
 * nobody else. The tee sheet's own rule (lib/teeSheet.ts
 * `mayRemoveBooking`) — one copy of "medium security".
 */
export function mayTakeOut(v: PickerViewer, member: { playerId: string; addedBy?: string | null }): boolean {
  return mayRemoveBooking(
    { organiser: v.organiser, meId: v.meId, playersBook: v.selfPick },
    { playerId: member.playerId, bookedBy: member.addedBy },
  )
}

/** Whether this phone may put somebody other than itself in a team. */
export function mayAddOthers(v: PickerViewer): boolean {
  return v.organiser || (v.selfPick && !!v.meId && v.addedRecorded)
}

/** A player as the picker offers them. */
export type PickerChoice = {
  id: string
  name: string
  /** Ticked now. */
  picked: boolean
  /** Cannot be changed by this phone — shown, greyed, as it stands. */
  locked: boolean
  /** In another team on this sheet — the organiser moves them; nobody else sees them. */
  otherTeamId: string | null
}

/**
 * Who the picker offers for one team, and how.
 *
 * The organiser is offered everybody — a player in another team moves when
 * ticked. A player is offered the team's members and the players not yet in
 * a team on this sheet; they themselves are always in the team they are
 * making or changing (leaving is its own button), the members they did not
 * add are fixed, and, before 066 records who added whom, nobody else is
 * offered at all.
 */
export function pickChoices(input: {
  players: readonly { id: string; name: string }[]
  memberships: readonly PickerMember[]
  sheet: string
  /** The team being changed, or null for a new one. */
  teamId: string | null
  viewer: PickerViewer
}): PickerChoice[] {
  const { players, memberships, sheet, teamId, viewer } = input
  const onSheet = memberships.filter(m => m.team_set === sheet)
  const teamOf = new Map(onSheet.map(m => [m.player_id, m]))
  const out: PickerChoice[] = []
  for (const p of players) {
    const m = teamOf.get(p.id)
    const inThis = !!teamId && m?.team_id === teamId
    const otherTeamId = m && !inThis ? m.team_id : null
    const isMe = p.id === viewer.meId
    if (!viewer.organiser) {
      if (otherTeamId) continue
      if (!inThis && !isMe && !mayAddOthers(viewer)) continue
    }
    const picked = inThis || (isMe && !viewer.organiser)
    const locked = !viewer.organiser && (isMe
      || (inThis && !mayTakeOut(viewer, { playerId: p.id, addedBy: m?.added_by ?? null })))
    out.push({ id: p.id, name: p.name, picked, locked, otherTeamId })
  }
  return out
}

/** Why this selection cannot be saved, or null when it can. */
export function selectionIssue(
  picked: readonly string[],
  cap: number | null,
  noun: TeamNoun,
): string | null {
  if (picked.length === 0) return 'Pick at least one player.'
  if (cap !== null && picked.length > cap) {
    return `${noun.Many} of ${cap} — take somebody out first.`
  }
  return null
}

/** What saving a team changes: who goes in, and who comes out. */
export function pickPlan(
  before: readonly string[],
  after: readonly string[],
): { add: string[]; remove: string[] } {
  return {
    add: after.filter(id => !before.includes(id)),
    remove: before.filter(id => !after.includes(id)),
  }
}

/**
 * The name a picked team is stored under: its players' first names, as a
 * self-made team has always been named ("Ross & Dave"). lib/partnerships.ts
 * `isMadeName` recognises it, so a name somebody chose elsewhere is never
 * overwritten by this — the screens keep a chosen name as it is.
 */
export function madeTeamName(memberFullNames: readonly string[]): string {
  return joinNames(memberFullNames.map(firstName))
}

/** Whether there is room for one more in a team of this size. */
export function hasRoom(size: number, cap: number | null): boolean {
  return cap === null || size < cap
}

// ─── From the tee sheet ────────────────────────────────────────
//
// Ross, 27 Oct 2026: a player picking a tee time on a round that plays in
// partnerships, and in none yet, is sent to the picker first and comes back
// with the team on that time — or goes on alone. Anybody already on the
// time and in no team is in the team, and cannot be taken out of it, so
// long as they all fit; a time holding more than one team's worth offers
// them first instead. The organiser takes a player off the time, and that
// takes them out of a round's own partnership with it.

/**
 * The list a round's partnerships are picked on, from its tee sheet: the
 * board that governs the round, its sheet — a round's own (`day:<roundId>`)
 * as well as the event's — and at most a tee time's worth. Null for a round
 * without partnerships.
 *
 * The field picks a round's own partnerships wherever it books its own
 * times (`playersBook`), as the sheet's "Make this group a team" always
 * let it; an event-long partnership only where the board lets the field
 * pick (`teamPick: 'self'`).
 */
export function roundPickerSheet(
  boards: readonly Leaderboard[],
  roundId: string,
  largestOn: (sheet: string) => number,
  playersBook: boolean,
): PickerSheet | null {
  const first = roundPartnership(boards, roundId)
  const p = first && roundPartnership(boards, roundId, largestOn(first.sheet))
  if (!p) return null
  const here = p.isDay
    ? [p.board]
    : boards.filter(b => b.audience === 'team' && !b.tagMode && sheetForBoard(b) === p.sheet)
  return {
    id: p.sheet,
    noun: teamNoun(here),
    boardTitles: here.map(boardTitle).join(' · '),
    cap: Math.min(p.size ?? teamSizeLimit(here) ?? MAX_PARTNERSHIP, MAX_PARTNERSHIP),
    selfPick: here.some(b => b.teamPick === 'self') || (p.isDay && playersBook),
    together: true,
  }
}

/** The tee time a team is being made for. */
export type TeeTimePick = {
  /** "8:10 am", or "Group 3" on a sheet with no clock. */
  label: string
  /** Everybody on the time now. */
  onSlot: string[]
  /** Those on it and in no team here, this phone's player apart. */
  mates: string[]
  /** Players on no time this round and in no team here — the others who can go on with them. */
  free: string[]
  /** Places left on the time. */
  vacancy: number
  /** Who booked whom is recorded (migration 065) — before it, a player books only themselves. */
  bookerRecorded: boolean
}

/** Whether the players on the time who are in no team all go into this one. */
export function matesLockedIn(
  at: Pick<TeeTimePick, 'mates' | 'onSlot'>,
  viewer: Pick<PickerViewer, 'organiser' | 'meId'>,
  inTeam: number,
  cap: number,
): boolean {
  const me = !viewer.organiser && viewer.meId && !at.onSlot.includes(viewer.meId) ? 1 : 0
  return at.mates.length > 0 && at.mates.length + inTeam + me <= cap
}

/**
 * Who the picker offers when the team is for one tee time: the team's own
 * members, this phone's player, the players on the time in no team, and
 * those on no time this round — nobody on another time, who would have to
 * be moved, and nobody in another team. Those on the time are ticked and
 * fixed when they all fit (`matesLockedIn`); the organiser can untick them.
 * A player offers the free field only once who added and who booked whom
 * are both recorded (066 and 065), the tee sheet's own rule for bringing
 * somebody along.
 */
export function teeTimeChoices(input: {
  players: readonly { id: string; name: string }[]
  memberships: readonly PickerMember[]
  sheet: string
  teamId: string | null
  viewer: PickerViewer
  at: TeeTimePick
  cap: number
}): PickerChoice[] {
  const { players, memberships, sheet, teamId, viewer, at, cap } = input
  const nameOf = new Map(players.map(p => [p.id, p.name]))
  const members = teamId
    ? memberships.filter(m => m.team_set === sheet && m.team_id === teamId)
    : []
  const inTeam = new Set(members.map(m => m.player_id))
  const lockMates = matesLockedIn(at, viewer, members.length, cap)
  const mayBring = viewer.organiser || (mayAddOthers(viewer) && at.bookerRecorded)
  const me = !viewer.organiser ? viewer.meId : null

  // The team's own first, so one joined reads as it did with the newcomer
  // added — "Mary, John & Ross".
  const order = [
    ...members.map(m => m.player_id),
    ...(me ? [me] : []),
    ...at.mates,
    ...(mayBring ? at.free : []),
  ]
  const out: PickerChoice[] = []
  const seen = new Set<string>()
  for (const id of order) {
    const name = nameOf.get(id)
    if (seen.has(id) || name === undefined) continue
    seen.add(id)
    const mate = at.mates.includes(id) && !inTeam.has(id)
    const member = members.find(m => m.player_id === id)
    const picked = inTeam.has(id) || id === me || (mate && lockMates)
    const locked = !viewer.organiser && (id === me
      || (mate && lockMates)
      || (!!member && !mayTakeOut(viewer, { playerId: id, addedBy: member.added_by ?? null })))
    out.push({ id, name, picked, locked, otherTeamId: null })
  }
  return out
}

/** Whether one more can be ticked: room in the team, and on the time for anybody not on it yet. */
export function roomOnTime(id: string, picked: readonly string[], at: TeeTimePick, cap: number): boolean {
  if (picked.length >= cap) return false
  if (at.onSlot.includes(id)) return true
  return picked.filter(p => !at.onSlot.includes(p)).length < at.vacancy
}

/** Why this team will not go on the time, or null when it will. */
export function teeTimeIssue(picked: readonly string[], at: TeeTimePick): string | null {
  const coming = picked.filter(p => !at.onSlot.includes(p)).length
  if (coming <= at.vacancy) return null
  return at.vacancy === 0
    ? `${at.label} is full now — go back and pick another time.`
    : `Only ${at.vacancy} more fit${at.vacancy === 1 ? 's' : ''} at ${at.label}.`
}

/** Who goes onto the time once the team is saved: its players not on the round's sheet yet. */
export function toPlace(team: readonly string[], onRound: ReadonlySet<string>): string[] {
  return team.filter(id => !onRound.has(id))
}

/**
 * The team on a tee time with room in it — a part-filled one somebody went
 * on with — which whoever picks the time next joins rather than starting a
 * second. Null when there is none, or more than one to choose between.
 */
export function openTeamOnTime(
  memberships: readonly Membership[],
  sheet: string,
  onSlot: readonly string[],
  cap: number,
): string | null {
  const here = memberships.filter(m => m.team_set === sheet)
  const size = new Map<string, number>()
  for (const m of here) size.set(m.team_id, (size.get(m.team_id) ?? 0) + 1)
  const open = [...new Set(here.filter(m => onSlot.includes(m.player_id)).map(m => m.team_id))]
    .filter(id => (size.get(id) ?? 0) < cap)
  return open.length === 1 ? open[0] : null
}

/**
 * A tee time's choice narrowed to this player's tag, where tags are in
 * play: a team's card counts towards one tag, so a team is of one
 * (lib/tagBoards.ts `dayTeamTagIssue`). The organiser is offered everybody
 * and told instead (`teamTagIssue`). Off — a trip, an event without tags —
 * the time is returned as it was.
 */
export function withinMyTag(
  at: TeeTimePick,
  viewer: Pick<PickerViewer, 'organiser' | 'meId'>,
  memberships: readonly Membership[],
  playingForTags: boolean,
): TeeTimePick {
  if (!playingForTags || viewer.organiser || !viewer.meId) return at
  const tags = memberships.filter(m => m.team_set === TAG_SET)
  const mine = tags.find(m => m.player_id === viewer.meId)?.team_id
  if (!mine) return at
  const sameTag = (id: string) => tags.some(m => m.player_id === id && m.team_id === mine)
  return { ...at, mates: at.mates.filter(sameTag), free: at.free.filter(sameTag) }
}

/** Why these players cannot be one team for the tags, or null — and null whenever tags are not in play. */
export function teamTagIssue(
  picked: readonly string[],
  memberships: readonly Membership[],
  playingForTags: boolean,
): string | null {
  return playingForTags ? dayTeamTagIssue(picked, memberships.filter(m => m.team_set === TAG_SET)) : null
}
