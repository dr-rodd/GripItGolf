// Partnerships — the playing unit (Ross, 27 Oct 2026).
//
// Three words, because there are three things:
//
//   · a tag — the umbrella group a player carries all event, or all series:
//     Europe and USA, the club sides. On the main sheet (lib/tagBoards.ts).
//   · a team — the group a leaderboard makes, which need not play together:
//     teammates may go out at different times, every card counting.
//   · a partnership — the tight subset of teams: two to four who go out on
//     one tee time and enter the tee sheet and the leaderboard as one — a
//     pair in a pairs bracket, a fourball's team card. On screen still a
//     "team"; a pair reads "Ross & Dave", with the field's usual shortening.
//
// Teams and partnerships are picked in the same way (one selection wizard,
// to come); which one a board's teams are is the rule below.
//
// Whether a round has partnerships is never a switch of its own. It is read
// off the board that governs how the round is played — the round's own
// board, else the first board covering it (the primary) — and that board
// alone: a secondary board ranks the golf, it does not shape it.
//
//   · a pairs knockout: always, in twos;
//   · a team league whose teams are at most four: yes, unless the organiser
//     said its players play apart. Asked once, where tee times are set up —
//     "Do players play in their teams?" (`teeTeams`, absent until answered,
//     and read as yes meanwhile, which is what every board did before);
//   · anything else — individuals, the event's tags, teams of five or
//     more: no; those teams stay teams.
//
// A partnership is a team row on the governing board's sheet: a round's own
// board keeps that round's (`day:<roundId>`), so they can change from round
// to round; a board covering every round keeps one set for all of them.
//
// Pure. No I/O.

import { type Leaderboard, dayBoardFor } from './leaderboards'
import { sheetForBoard, isDaySheet, type Membership } from './teamSets'
import { joinNames } from './matchplayEntrants'

/** The most players a partnership holds — one tee time. */
export const MAX_PARTNERSHIP = 4

/** A pair. */
export const PAIR = 2

/**
 * The board that governs how one round is played: the round's own board
 * when it has one (lib/leaderboards.ts `dayBoardFor`), else the first board
 * covering the round. The first board made is the one the event is about.
 */
export function governingBoard(
  boards: readonly Leaderboard[],
  roundId: string,
): Leaderboard | null {
  return dayBoardFor(boards, roundId)
    ?? boards.find(b => !b.roundIds?.length || b.roundIds.includes(roundId))
    ?? null
}

/** A round's partnerships: whose they are, where they are kept, and how big. */
export type RoundPartnership = {
  board: Leaderboard
  /** The sheet the partnerships are team rows on. */
  sheet: string
  /** The round's own — made, and changed, for this round alone. */
  isDay: boolean
  /** A fixed size where one is known: two for a pair, a self-picked team's size. */
  size: number | null
}

/**
 * The board whose teams could be this round's partnerships — a team league
 * or a pairs knockout governing the round, not the event's tags, and no
 * bigger than a tee time. Whether they play together is the next question.
 */
function candidate(
  boards: readonly Leaderboard[],
  roundId: string,
  largestTeam: number,
): Leaderboard | null {
  const board = governingBoard(boards, roundId)
  if (!board || board.audience !== 'team' || board.tagMode) return null
  if (board.competition === 'matchplay') return board
  const size = board.teamPick === 'self' ? board.teamSize ?? null : null
  if ((size ?? 0) > MAX_PARTNERSHIP || largestTeam > MAX_PARTNERSHIP) return null
  return board
}

/**
 * This round's partnerships, or null when it has none.
 *
 * `largestTeam` is the biggest team already on the board's sheet, where the
 * caller has the memberships: a league whose organiser put six in a team is
 * not playing in partnerships, whatever it was never asked.
 */
export function roundPartnership(
  boards: readonly Leaderboard[],
  roundId: string,
  largestTeam = 0,
): RoundPartnership | null {
  const board = candidate(boards, roundId, largestTeam)
  if (!board) return null
  if (board.competition !== 'matchplay' && board.teeTeams === 'separate') return null
  const sheet = sheetForBoard(board)
  return {
    board,
    sheet,
    isDay: isDaySheet(sheet),
    size: board.competition === 'matchplay' ? PAIR
      : board.teamPick === 'self' ? board.teamSize ?? null : null,
  }
}

/**
 * The board to ask "Do players play in their teams?" of, for this round —
 * or null when there is nothing to ask: a pair always plays together, and
 * individuals, the event's tags and teams over four never do.
 *
 * Asked whether or not it has been answered, so the answer can be changed
 * where it was given.
 */
export function playTogetherQuestion(
  boards: readonly Leaderboard[],
  roundId: string,
  largestTeam = 0,
): Leaderboard | null {
  const board = candidate(boards, roundId, largestTeam)
  return board && board.competition === 'league' ? board : null
}

/**
 * The stored boards with one board's answer written in — `trips.leaderboards`
 * as it was read, raw, so nothing else in it is normalised on the way past.
 * Yes is stored as 'together' so the question reads as answered.
 */
export function withPlayTogether(raw: unknown, boardId: string, together: boolean): unknown[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map(b => {
    if (!b || typeof b !== 'object' || (b as { id?: unknown }).id !== boardId) return b
    return { ...(b as Record<string, unknown>), teeTeams: together ? 'together' : 'separate' }
  })
}

/** A partnership to make on a round's own sheet, copied from an earlier round. */
export type CarriedPartnership = { name: string; color: string; playerIds: string[] }

/**
 * The partnerships a round starts from — Ross, 27 Oct 2026: "each round,
 * carried over". When a round makes its own partnerships (a round's own
 * board, on its own sheet) and has none yet, it starts from the latest
 * earlier round that had any, so nobody re-picks unless they want to
 * change. Empty when there is nothing to carry, or the round already has
 * its own — never a merge into partnerships somebody has started making.
 *
 * Only partnerships of two or more carry: a pair whose partner has gone is
 * not a partnership any more.
 */
export function carriedPartnerships(input: {
  /** The round being opened, and every round, with its number. */
  roundId: string
  rounds: readonly { id: string; roundNumber: number }[]
  /** The sheet the round's partnerships go on (`day:<roundId>`). */
  sheet: string
  /** Every team row and membership on the trip. */
  teams: readonly { id: string; name: string; color: string; team_set: string | null }[]
  memberships: readonly Membership[]
  /** Each earlier round's own sheet, where it has one. */
  sheetOf: (roundId: string) => string | null
}): CarriedPartnership[] {
  const { roundId, rounds, sheet, teams, memberships, sheetOf } = input
  if (!isDaySheet(sheet)) return []
  if (memberships.some(m => m.team_set === sheet)) return []
  const me = rounds.find(r => r.id === roundId)
  if (!me) return []
  const earlier = rounds
    .filter(r => r.roundNumber < me.roundNumber)
    .sort((a, b) => b.roundNumber - a.roundNumber)
  for (const r of earlier) {
    const from = sheetOf(r.id)
    if (!from || from === sheet) continue
    const out: CarriedPartnership[] = []
    for (const t of teams.filter(t => t.team_set === from)) {
      const playerIds = memberships.filter(m => m.team_set === from && m.team_id === t.id).map(m => m.player_id)
      if (playerIds.length >= PAIR) out.push({ name: t.name, color: t.color, playerIds })
    }
    if (out.length > 0) return out
  }
  return []
}

/**
 * Whether a team's name is one nobody chose: a lettered default ("Team A",
 * "Pair B"), or its members' first names as a self-made team is named.
 */
export function isMadeName(name: string, memberFullNames: readonly string[]): boolean {
  const n = name.trim()
  if (!n) return true
  if (/^(team|pair|pairing|group)\s+([a-z]|\d+)$/i.test(n)) return true
  const firsts = memberFullNames.map(m => m.trim().split(/\s+/)[0] ?? m)
  return n === joinNames(firsts)
}

/**
 * What a partnership is called on screen. A pair reads as its players —
 * "Ross & Dave" — unless somebody gave it a name of its own; three or four
 * read as their name, or as their players when nobody named them.
 *
 * `shortOf` is the field's short names (lib/displayNames.ts `boardNames`),
 * so two Rosses in different pairs are still told apart.
 */
export function partnershipName(
  team: { name: string },
  members: readonly { id: string; name: string }[],
  shortOf: ReadonlyMap<string, string>,
): string {
  if (members.length === 0 || members.length > MAX_PARTNERSHIP) return team.name
  if (!isMadeName(team.name, members.map(m => m.name))) return team.name
  return joinNames(members.map(m => shortOf.get(m.id) ?? m.name.split(/\s+/)[0]))
}
