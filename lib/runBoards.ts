// Green Dot Run — runs into leaderboard rows, the only copy.
//
// lib/runChallenge.ts says what one run earns and what one day is held to.
// This turns a challenge's whole set of runs into the boards: each runner's
// total, then individuals and teams ranked by it. Every screen that shows a
// standing — the leaderboard, the home page, the Add tab's "your runs" —
// comes through here, so a total cannot read one way on one screen and
// another way on the next.
//
// Four rules that are the whole design:
//
//   · **Only the challenge's days count.** A run dated outside the start and
//     finish is left out here, whatever got it into the table — so moving
//     the dates re-tells the board rather than needing anything rewritten.
//   · **The daily limit is on the day, not the run.** Runs are grouped by
//     runner and by day, and each day's points go through `dayPoints`.
//   · **Places are golf's.** Two level share a place — both 1st, the next
//     3rd — and the order among them is by name, which says nothing.
//   · **A team's average counts everyone on it**, runs or not. That is what
//     makes it fair between a team of four and a team of twelve, and it is
//     what makes a teammate who never runs pull the average down.
//
// What leaves this file about other people is totals — points, distance,
// how many runs — never a run itself. Strava's rules are why
// (docs/run.md); a runner's own runs are listed only to them, elsewhere.
//
// Pure. No I/O.

import {
  type RunActivity, type RunRules, type TeamScore,
  runPoints, dayPoints, round1,
} from './runChallenge'

/** A run as the boards need it — no more of it than that. */
export type BoardRun = {
  playerId: string
  activity: RunActivity
  /** YYYY-MM-DD. */
  date: string
  distanceM: number
}

export type RunnerTotal = {
  points: number
  /** Kilometres of the runs that earned points. */
  km: number
  /** How many runs earned points. */
  runs: number
}

export type RunnerLine = RunnerTotal & {
  playerId: string
  name: string
  teamId: string | null
  place: number
}

export type TeamLine = {
  teamId: string
  name: string
  color: string
  members: number
  total: number
  /** Total over everybody on the team; 0 for a team with nobody on it. */
  average: number
  /** What the team is ranked on — the average or the total. */
  score: number
  km: number
  place: number
}

const EMPTY: RunnerTotal = { points: 0, km: 0, runs: 0 }

/** Whether a day falls inside the challenge. Absent ends do not bound it. */
export function inWindow(date: string, start: string | null, end: string | null): boolean {
  if (start && date < start) return false
  if (end && date > end) return false
  return true
}

/**
 * Every runner's total. Runs outside the challenge's days are left out;
 * the rest are grouped by runner and day, and each day is held to the
 * daily limit before it is added.
 */
export function runnerTotals(
  runs: BoardRun[],
  rules: RunRules,
  window: { start: string | null; end: string | null },
): Map<string, RunnerTotal> {
  const byRunner = new Map<string, Map<string, BoardRun[]>>()
  for (const r of runs) {
    if (!inWindow(r.date, window.start, window.end)) continue
    const days = byRunner.get(r.playerId) ?? new Map<string, BoardRun[]>()
    const day = days.get(r.date) ?? []
    day.push(r)
    days.set(r.date, day)
    byRunner.set(r.playerId, days)
  }

  const out = new Map<string, RunnerTotal>()
  for (const [playerId, days] of byRunner) {
    let points = 0
    let km = 0
    let count = 0
    for (const dayRuns of days.values()) {
      const asRuns = dayRuns.map(r => ({ km: r.distanceM / 1000, activity: r.activity }))
      points += dayPoints(asRuns, rules)
      for (const r of asRuns) {
        if (runPoints(r, rules) > 0) { km += r.km; count++ }
      }
    }
    out.set(playerId, { points: round1(points), km: round1(km), runs: count })
  }
  return out
}

/**
 * Golf's places over a list already in order: equal scores share the
 * place of the first of them, and the next score takes its own position.
 */
export function placesFor(scores: number[]): number[] {
  const places: number[] = []
  scores.forEach((s, i) => {
    places.push(i > 0 && s === scores[i - 1] ? places[i - 1] : i + 1)
  })
  return places
}

/** Everyone in the challenge, ranked — a runner with no runs is on it at 0. */
export function individualBoard(
  roster: { id: string; name: string; teamId: string | null }[],
  totals: Map<string, RunnerTotal>,
): RunnerLine[] {
  const lines = roster.map(p => ({
    ...(totals.get(p.id) ?? EMPTY),
    playerId: p.id,
    name: p.name,
    teamId: p.teamId,
    place: 0,
  }))
  lines.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  const places = placesFor(lines.map(l => l.points))
  return lines.map((l, i) => ({ ...l, place: places[i] }))
}

/**
 * The teams, ranked on their average per member or their total. A team
 * with nobody on it scores 0 either way rather than dividing by nothing.
 */
export function teamBoard(
  teams: { id: string; name: string; color: string; memberIds: string[] }[],
  totals: Map<string, RunnerTotal>,
  teamScore: TeamScore = 'average',
): TeamLine[] {
  const lines = teams.map(t => {
    const own = t.memberIds.map(id => totals.get(id) ?? EMPTY)
    const total = round1(own.reduce((s, x) => s + x.points, 0))
    const km = round1(own.reduce((s, x) => s + x.km, 0))
    const average = t.memberIds.length > 0 ? round1(total / t.memberIds.length) : 0
    return {
      teamId: t.id,
      name: t.name,
      color: t.color,
      members: t.memberIds.length,
      total,
      average,
      score: teamScore === 'total' ? total : average,
      km,
      place: 0,
    }
  })
  lines.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const places = placesFor(lines.map(l => l.score))
  return lines.map((l, i) => ({ ...l, place: places[i] }))
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** "12.4 km", "3 km" — a distance as the boards print it. */
export function formatKm(km: number): string {
  return `${round1(km)} km`
}

// ─── Frozen final results ──────────────────────────────────────
//
// What a run challenge keeps once it is final: the team standings as they
// stood, and nothing about any one runner. Taken in the same breath as the
// challenge's Strava runs are deleted (app/api/run/finalise.ts), so the
// leaderboard can go on saying who won after the runs that decided it are
// gone.

export type FinalTeam = Pick<TeamLine, 'name' | 'color' | 'members' | 'total' | 'average' | 'score' | 'km' | 'place'>

export type FinalResults = {
  /** YYYY-MM-DD — the day the standings were frozen. */
  frozenOn: string
  teamScore: TeamScore
  teams: FinalTeam[]
  /** Strava runs were part of the challenge, and were deleted at the freeze. */
  stravaRemoved: boolean
  /** Some of what was frozen was recorded on Garmin — the credit stays with it. */
  garmin: boolean
}

export function freezeResults(
  teams: TeamLine[], teamScore: TeamScore, frozenOn: string, stravaRemoved: boolean, garmin = false,
): FinalResults {
  return {
    frozenOn,
    teamScore,
    stravaRemoved,
    garmin,
    teams: teams.map(t => ({
      name: t.name, color: t.color, members: t.members,
      total: t.total, average: t.average, score: t.score, km: t.km, place: t.place,
    })),
  }
}

/** Read `trips.run_results` — whole, or null when there is none (or it is junk). */
export function parseFinalResults(raw: unknown): FinalResults | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.frozenOn !== 'string' || !Array.isArray(r.teams)) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const teams = r.teams
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && typeof (t as Record<string, unknown>).name === 'string')
    .map(t => ({
      name: String(t.name),
      color: typeof t.color === 'string' ? t.color : '#4A3728',
      members: num(t.members), total: num(t.total), average: num(t.average),
      score: num(t.score), km: num(t.km), place: num(t.place) || 1,
    }))
  return {
    frozenOn: r.frozenOn,
    teamScore: r.teamScore === 'total' ? 'total' : 'average',
    stravaRemoved: r.stravaRemoved === true,
    garmin: r.garmin === true,
    teams,
  }
}
