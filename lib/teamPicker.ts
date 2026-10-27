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
import { roundPartnership, isPairs } from './partnerships'
import { mayRemoveBooking } from './teeSheet'
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
