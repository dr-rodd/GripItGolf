// More than one team sheet on one trip.
//
// A group can run a team league and a pairings knockout at the same time, and
// they are not played by the same teams: four teams of three in the league,
// six pairings in the draw. The same twelve players, arranged twice.
//
// So a team leaderboard names the sheet it is played on. Boards sharing a
// sheet share the teams; a board on its own sheet has its own. "Same teams?"
// in settings is the whole of the question, and it is asked once, when a
// second team board is made.
//
// Every rule that used to be trip-wide is now per sheet, and that is the
// point: a pairs draw fixes ITS teams at two. It has no business resizing the
// league's teams, and before sheets existed it did exactly that.
//
// Pure. No I/O — see lib/teamMembers.ts for reading and writing membership.

import { boardTitle, needsPairings, type Leaderboard } from './leaderboards'

/**
 * The sheet every trip starts with, and the one every team was on before
 * sheets existed. Named rather than numbered so a backfilled row reads as
 * something rather than as an accident.
 */
export const MAIN_SET = 'main'

/** Which sheet this board is played on. */
export function setOf(lb: Pick<Leaderboard, 'teamSet'>): string {
  return lb.teamSet || MAIN_SET
}

/** The boards played on one sheet. */
export function boardsOnSheet(
  boards: readonly Leaderboard[],
  teamSet: string,
): Leaderboard[] {
  return boards.filter(lb => lb.audience === 'team' && setOf(lb) === teamSet)
}

/**
 * Every sheet this trip needs, in the order the boards that use them were
 * made. The primary board's sheet leads, which is the sheet settings shows
 * first and the one a new player is placed on.
 */
export function sheetsInUse(boards: readonly Leaderboard[]): string[] {
  const out: string[] = []
  for (const lb of boards) {
    if (lb.audience !== 'team') continue
    const s = setOf(lb)
    if (!out.includes(s)) out.push(s)
  }
  return out
}

/**
 * A sheet id no board is using yet.
 *
 * Numbered from two, because the first sheet is `main` — "sheet 2" beside
 * "main" reads as the second one, which is what it is.
 */
export function nextSheetId(boards: readonly Leaderboard[]): string {
  const used = new Set(sheetsInUse(boards))
  if (!used.has(MAIN_SET)) return MAIN_SET
  for (let n = 2; ; n++) {
    const id = `set-${n}`
    if (!used.has(id)) return id
  }
}

/**
 * Whether a new team board can offer to share a sheet — that is, whether
 * there is one to share. The question is only worth asking the second time.
 */
export function canShareSheet(boards: readonly Leaderboard[]): boolean {
  return sheetsInUse(boards).length > 0
}

/**
 * What to call a sheet on screen.
 *
 * Named after what is played on it rather than given an id, because that is
 * how the organiser thinks of it: these are the pairings, those are the league
 * teams. A sheet carrying both is just "teams" — it is the trip's team sheet
 * and needs no distinguishing.
 */
export function sheetName(
  boards: readonly Leaderboard[],
  teamSet: string,
): string {
  const on = boardsOnSheet(boards, teamSet)
  // Pairings only when that is all the sheet is for. A sheet carrying a draw
  // AND a league is the trip's team sheet, and calling it "Pairings" on the
  // league's own screen would be wrong.
  return needsPairings(on) && !on.some(lb => lb.competition === 'league')
    ? 'Pairings'
    : 'Teams'
}

/**
 * The line under a sheet's heading — which boards are played on it.
 *
 * Two sheets called "Teams" and "Pairings" are clear enough, but a trip may
 * end up with two league sheets, and then only the boards tell them apart.
 */
export function sheetSubtitle(
  boards: readonly Leaderboard[],
  teamSet: string,
  titleOf: (lb: Leaderboard) => string,
): string {
  return boardsOnSheet(boards, teamSet).map(titleOf).join(' · ')
}

/**
 * Why this trip cannot go live yet, or null if it can.
 *
 * Read off the boards, because the boards are what a trip plays for — it used
 * to be answered from `trips.formats`, which a new trip carries as the
 * defaults, so it said yes to a trip with nothing to play for at all.
 *
 * Per sheet, because a trip running a league and a draw between different
 * teams needs both filled in, and the one that is missing is the useful thing
 * to say.
 */
export function finaliseBlockedReason(
  boards: readonly Leaderboard[],
  teams: readonly TeamRow[],
): string | null {
  if (boards.length === 0) return 'Choose what this trip is playing for first.'

  const sheets = sheetsInUse(boards)
  for (const sheet of sheets) {
    if (teamsOnSheet(teams, sheet).length > 0) continue
    const on = boardsOnSheet(boards, sheet)
    if (needsPairings(on)) return 'Your draw is between pairings — pick them first.'
    // With two sheets running, "pick teams" is ambiguous — say which.
    return sheets.length > 1
      ? `The teams for ${sheetSubtitle(boards, sheet, boardTitle)} have not been picked yet.`
      : 'A team leaderboard needs teams — pick them first.'
  }
  return null
}

// ─── Membership ────────────────────────────────────────────────

/** One player's place on one sheet. Mirrors a `team_members` row. */
export type Membership = {
  team_id: string
  team_set: string
  player_id: string
}

export type TeamRow = { id: string; name: string; team_set?: string | null }

/** Which sheet a team is on. A team row from before sheets existed is main. */
export function teamSheet(t: TeamRow): string {
  return t.team_set || MAIN_SET
}

/** The teams making up one sheet. */
export function teamsOnSheet(teams: readonly TeamRow[], teamSet: string): TeamRow[] {
  return teams.filter(t => teamSheet(t) === teamSet)
}

/** Who is in this team. */
export function membersOf(
  memberships: readonly Membership[],
  teamId: string,
): string[] {
  return memberships.filter(m => m.team_id === teamId).map(m => m.player_id)
}

/** Which team this player holds on this sheet, or null. */
export function teamFor(
  memberships: readonly Membership[],
  playerId: string,
  teamSet: string,
): string | null {
  return memberships.find(m => m.player_id === playerId && m.team_set === teamSet)
    ?.team_id ?? null
}

/**
 * Membership on one sheet, in the shape the team-size rules expect.
 *
 * `lib/teamLimits.ts` asks about players carrying a `team_id`, which is what a
 * player looked like when there was only ever one sheet. Projecting a sheet
 * into that shape is what lets those rules stay one implementation: a pairs
 * draw caps ITS sheet at two and says nothing about any other.
 */
export function asMembers(
  playerIds: readonly string[],
  memberships: readonly Membership[],
  teamSet: string,
): { id: string; team_id: string | null }[] {
  return playerIds.map(id => ({ id, team_id: teamFor(memberships, id, teamSet) }))
}
