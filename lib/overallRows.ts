/**
 * The Dynamic Overall Leaderboard's rows — the only place they are built
 * (Ross, 9 Nov 2026; lib/sessions.ts holds the rules).
 *
 * Each session is ranked in its own format first, by the board that session
 * plays (`buildRows`, the one copy of reading cards), and the Overall then
 * repackages those results into points:
 *
 *  · a **stroke** session pays by finishing position — the session's table
 *    read for the entrants the Overall ranks, places through `placeRound`
 *    (lib/tiebreak.ts), level entrants sharing the prizes their places cover;
 *  · a **Matches** session pays per match — win, half, loss — to the tag the
 *    side carries, to each player on it, or to the team it is;
 *  · a **TBC** session, or one set not to count, pays nothing.
 *
 * What the Overall ranks decides how a session is read:
 *
 *  · **tags** — a stroke session is read as a tags board scoped to it: the
 *    tag's best N cards, or for a team format the tag's day teams' cards;
 *  · **individuals** — the session's own rows; on a team format every member
 *    takes the team's place;
 *  · **teams** — a team board on the Overall's sheet with the session's
 *    scoring; a team format keeps its own, an individual one counts the
 *    team's better ball.
 *
 * Ties on the Overall are shared (D-brief 5.3): two level are both 1st.
 * Worked out on every read; nothing here is stored.
 */

import type { Leaderboard } from './leaderboards'
import { buildRows, type BoardRow, type RowContext } from './boardRows'
import { feedFor, matchPoints, sessionBoardFor, type OverallRules, type SessionFeed } from './sessions'
import { placeRound } from './tiebreak'
import { teamsOnSheet, membersOf } from './teamSets'
import { TAG_SET, tagOfTeam } from './tagBoards'

type Entrant = { id: string; name: string; color?: string; playerIds: string[] }

/** Who the Overall ranks, as rows-to-be. */
function entrantsOf(overall: Leaderboard, ctx: RowContext): Entrant[] {
  const ranks = overall.overall?.ranks ?? 'individuals'
  if (ranks === 'individuals') {
    return ctx.players.map(p => ({ id: p.id, name: p.name, playerIds: [p.id] }))
  }
  const sheet = ranks === 'tags' ? TAG_SET : overall.teamSet || 'overall'
  return teamsOnSheet(ctx.teams, sheet).map(t => ({
    id: t.id, name: t.name, color: t.color, playerIds: membersOf(ctx.memberships, t.id),
  }))
}

/** The board a stroke session is read through for what the Overall ranks. */
function readingBoard(overall: Leaderboard, session: Leaderboard, roundId: string): Leaderboard {
  const ranks = overall.overall?.ranks ?? 'individuals'
  if (ranks === 'tags') {
    const team = session.audience === 'team'
    return {
      id: `ov-tags-${roundId}`,
      audience: 'team',
      competition: 'league',
      scoring: session.scoring === 'strokes' ? 'strokes' : 'stableford',
      combine: 'total',
      teamSet: TAG_SET,
      tagMode: team ? 'day_teams' : 'best_cards',
      ...(team ? { teamFormat: session.teamFormat ?? 'better_ball' } : {}),
      ...(!team && overall.overall?.tagCount ? { tagCount: overall.overall.tagCount } : {}),
      ...(session.handicapAllowance != null ? { handicapAllowance: session.handicapAllowance } : {}),
      roundIds: [roundId],
    }
  }
  if (ranks === 'teams') {
    return {
      id: `ov-teams-${roundId}`,
      audience: 'team',
      competition: 'league',
      scoring: session.scoring === 'quota' ? 'stableford' : session.scoring ?? 'stableford',
      combine: 'total',
      teamSet: overall.teamSet || 'overall',
      teamFormat: session.audience === 'team' ? session.teamFormat ?? 'better_ball' : 'better_ball',
      ...(session.handicapAllowance != null ? { handicapAllowance: session.handicapAllowance } : {}),
      roundIds: [roundId],
    }
  }
  return session
}

/** Each entrant's score in one stroke session — only those who played it. */
function sessionScores(
  overall: Leaderboard, session: Leaderboard, roundId: string, ctx: RowContext, entrants: Entrant[],
): { id: string; score: number }[] {
  const rows = buildRows(readingBoard(overall, session, roundId), ctx)
    .filter(r => r.playedRounds.includes(roundId))
  const ranks = overall.overall?.ranks ?? 'individuals'
  if (ranks === 'individuals' && session.audience === 'team') {
    // Every member takes the team's figure.
    const out: { id: string; score: number }[] = []
    for (const r of rows) {
      for (const pid of r.playerIds) {
        if (entrants.some(e => e.id === pid)) out.push({ id: pid, score: r.perRound[roundId] ?? r.total })
      }
    }
    return out
  }
  const known = new Set(entrants.map(e => e.id))
  return rows.filter(r => known.has(r.id)).map(r => ({ id: r.id, score: r.perRound[roundId] ?? r.total }))
}

/** Who a match's side is, among what the Overall ranks — null for nobody. */
function sideEntrant(
  overall: Leaderboard, side: readonly string[], ctx: RowContext, entrants: Entrant[],
): string[] {
  const ranks = overall.overall?.ranks ?? 'individuals'
  if (side.length === 0) return []
  if (ranks === 'individuals') return side.filter(id => entrants.some(e => e.id === id))
  if (ranks === 'tags') {
    const tag = tagOfTeam(side, ctx.memberships)
    return tag && entrants.some(e => e.id === tag) ? [tag] : []
  }
  // Teams: the one team every player on the side is in, else nobody.
  const team = entrants.find(e => side.every(id => e.playerIds.includes(id)))
  return team ? [team.id] : []
}

/**
 * The Overall's rows: one column a session, its points in the cell, the
 * total the sum. `boards` is every board on the event — the sessions' own
 * are read from it.
 */
export function overallRows(overall: Leaderboard, boards: readonly Leaderboard[], ctx: RowContext): BoardRow[] {
  const rules: OverallRules = overall.overall ?? { ranks: 'individuals' }
  const entrants = entrantsOf(overall, ctx)
  const perRound = new Map(entrants.map(e => [e.id, {} as Record<string, number>]))
  const played = new Map(entrants.map(e => [e.id, new Set<string>()]))
  const live = new Map(entrants.map(e => [e.id, new Set<string>()]))
  const add = (id: string, roundId: string, points: number) => {
    const cells = perRound.get(id)
    if (!cells) return
    cells[roundId] = (cells[roundId] ?? 0) + points
    played.get(id)!.add(roundId)
  }

  for (const round of ctx.rounds) {
    // A round that does not count is in no board — the Overall included.
    if (round.casual === true) continue
    const session = sessionBoardFor(boards, round.id)
    const feed: SessionFeed = feedFor(rules, round.id, session, entrants.length)
    if (!session || feed.kind === 'none') continue

    if (feed.kind === 'position' && session.competition === 'league') {
      const scores = sessionScores(overall, session, round.id, ctx, entrants)
      const placings = placeRound(scores, feed.points, { lowerWins: session.scoring === 'strokes' })
      for (const [id, p] of placings) add(id, round.id, p.points)
      for (const pid of ctx.livePlayerIds) {
        if (!ctx.liveRoundIds.has(round.id)) continue
        for (const e of entrants) if (e.playerIds.includes(pid) && played.get(e.id)!.has(round.id)) live.get(e.id)!.add(round.id)
      }
      continue
    }

    if (feed.kind === 'match' && session.competition === 'matches') {
      for (const m of ctx.sessionMatches ?? []) {
        if (m.roundId !== round.id) continue
        const a = sideEntrant(overall, m.sideA, ctx, entrants)
        const b = sideEntrant(overall, m.sideB, ctx, entrants)
        if (m.result === null) {
          if (m.live) for (const id of [...a, ...b]) live.get(id)?.add(round.id)
          continue
        }
        const aOut = m.result === 'halved' ? 'half' : m.result === 'a' ? 'win' : 'loss'
        const bOut = m.result === 'halved' ? 'half' : m.result === 'b' ? 'win' : 'loss'
        for (const id of a) add(id, round.id, matchPoints(feed, aOut))
        for (const id of b) add(id, round.id, matchPoints(feed, bOut))
      }
    }
  }

  const unplaced = entrants
    .map(e => {
      const cells = perRound.get(e.id)!
      const total = Object.values(cells).reduce((s, n) => s + n, 0)
      return {
        id: e.id,
        name: e.name,
        subLabel: '',
        ...(e.color ? { color: e.color } : {}),
        perRound: cells,
        playedRounds: [...played.get(e.id)!],
        liveRounds: [...live.get(e.id)!],
        total,
        isLive: live.get(e.id)!.size > 0,
        playerIds: e.playerIds,
      }
    })
    // A tag or team with nobody in it and nothing scored is not an entrant.
    .filter(r => r.playerIds.length > 0 || r.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

  // Ties on the Overall are shared: two level are both 1st, the next 3rd.
  const out: BoardRow[] = []
  unplaced.forEach((r, i) => {
    const prev = out[i - 1]
    const place = prev && Math.abs(prev.total - r.total) < 1e-9 ? prev.place : i + 1
    out.push({ ...r, place })
  })
  return out
}

/** Points still on the table for a Matches session: matches unfinished × what a match is worth. */
export function matchesInSession(ctx: RowContext, roundId: string): number {
  return (ctx.sessionMatches ?? []).filter(m => m.roundId === roundId).length
}
