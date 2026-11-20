// Golfer of the Year (Ross, 17 Nov 2026; D264–D271, P14) — the only copy of
// its rules. A club's season-long award: points by finish from each certified
// competition's Results, points by stage reached in each match play, each
// competition's weight changed on its row (×0 leaves it out, ×2 a Major),
// best N, and who appears (the competitions' own entry rules). As many awards
// a year as the club runs — the men's, the ladies', the seniors'.
//
// **The standing is never stored**: `awardStanding` works it out on every
// read from what it is handed, the way a board is, so a weight changed
// re-tells the table at once and a reopened competition drops out until it is
// certified again. Pure — `app/api/club/awards.ts` reads and writes.

import { readEntryRules, type EntryRules } from './clubMembership'

// ─── The rules ─────────────────────────────────────────────────

/** Points by finish, 1st first: 25 for a win down to 1 for 15th (Ross's usual club table). */
export const DEFAULT_POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

/** Match play by stage reached: the winner, the runner-up, each semi-finalist and quarter-finalist out. */
export const DEFAULT_STAGE_POINTS = { winner: 25, runnerUp: 15, semi: 8, quarter: 4 }

export type Stage = keyof typeof DEFAULT_STAGE_POINTS

export const STAGE_WORDS: Record<Stage, string> = { winner: 'Winner', runnerUp: 'Runner-up', semi: 'Semi-final', quarter: 'Quarter-final' }

/** A competition's weight: out, as it is, half again, double (a Major). */
export const WEIGHTS = [0, 1, 1.5, 2] as const
export type Weight = (typeof WEIGHTS)[number]

export const WEIGHT_WORDS: Record<string, string> = { 0: 'Doesn’t count', 1: '×1', 1.5: '×1.5', 2: '×2 · a Major' }

export const AWARD_NAME_MAX = 60
export const MAX_PLACES = 50
export const MAX_POINTS = 1000

export interface AwardRules {
  /** Points by finish, 1st first; a place past the table earns nothing. */
  points: number[]
  stages: typeof DEFAULT_STAGE_POINTS
  /** Which kinds of competition count. */
  kinds: { stroke: boolean; matchPlay: boolean }
  /** A competition's weight by its code; absent is ×1. */
  weights: Record<string, Weight>
  /** Only a player's best N results count; null, every one. */
  bestOf: number | null
  /** Who appears — the competitions' own entry rules (one gender, memberships, an age band); null, everybody who plays here. */
  entry: EntryRules | null
}

export function defaultAwardRules(): AwardRules {
  return { points: [...DEFAULT_POINTS], stages: { ...DEFAULT_STAGE_POINTS }, kinds: { stroke: true, matchPlay: true }, weights: {}, bestOf: null, entry: null }
}

const wholeIn = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v)
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null
}

/** The stored rules, read whole and fail-soft: a bad answer back at its default, never the award refused. */
export function readAwardRules(raw: unknown): AwardRules {
  const d = defaultAwardRules()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d
  const r = raw as Record<string, unknown>
  const pts = Array.isArray(r.points) ? r.points.map(p => wholeIn(p, 0, MAX_POINTS)) : null
  const st = r.stages && typeof r.stages === 'object' ? r.stages as Record<string, unknown> : {}
  const kinds = r.kinds && typeof r.kinds === 'object' ? r.kinds as Record<string, unknown> : {}
  const weights: Record<string, Weight> = {}
  if (r.weights && typeof r.weights === 'object' && !Array.isArray(r.weights)) {
    for (const [code, w] of Object.entries(r.weights as Record<string, unknown>)) {
      const n = Number(w)
      if (/^[A-Z0-9]{4,12}$/.test(code) && (WEIGHTS as readonly number[]).includes(n)) weights[code] = n as Weight
    }
  }
  return {
    points: pts && pts.length > 0 && pts.length <= MAX_PLACES && pts.every(p => p !== null) ? pts as number[] : d.points,
    stages: {
      winner: wholeIn(st.winner, 0, MAX_POINTS) ?? d.stages.winner,
      runnerUp: wholeIn(st.runnerUp, 0, MAX_POINTS) ?? d.stages.runnerUp,
      semi: wholeIn(st.semi, 0, MAX_POINTS) ?? d.stages.semi,
      quarter: wholeIn(st.quarter, 0, MAX_POINTS) ?? d.stages.quarter,
    },
    kinds: { stroke: kinds.stroke !== false, matchPlay: kinds.matchPlay !== false },
    weights,
    bestOf: wholeIn(r.bestOf, 1, 100),
    entry: readEntryRules(r.entry),
  }
}

/** "25, 20, 16" → the table, or null when a figure will not read. */
export function readPointsTable(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  if (parts.length === 0 || parts.length > MAX_PLACES) return null
  const out = parts.map(p => wholeIn(p, 0, MAX_POINTS))
  return out.every(p => p !== null) ? out as number[] : null
}

/** Why an award cannot be saved, in a sentence — or null. */
export function awardIssue(a: { name: string; year: number; rules: AwardRules }): string | null {
  const name = a.name.trim()
  if (!name) return 'Name the award — Golfer of the Year, say.'
  if (name.length > AWARD_NAME_MAX) return `Keep the name under ${AWARD_NAME_MAX} characters.`
  if (!Number.isInteger(a.year) || a.year < 2000 || a.year > 2100) return 'Choose the year.'
  const r = a.rules
  if (r.points.length === 0 || r.points.length > MAX_PLACES) return `Give points for 1 to ${MAX_PLACES} places.`
  if (r.points.some(p => !Number.isInteger(p) || p < 0 || p > MAX_POINTS)) return 'Each place’s points are a whole number.'
  if (Object.values(r.stages).some(p => !Number.isInteger(p) || p < 0 || p > MAX_POINTS)) return 'Each stage’s points are a whole number.'
  if (!r.kinds.stroke && !r.kinds.matchPlay) return 'Choose what counts — stroke competitions, match play, or both.'
  if (r.bestOf !== null && (!Number.isInteger(r.bestOf) || r.bestOf < 1 || r.bestOf > 100)) return 'Best of is a whole number of results, or every one.'
  return null
}

// ─── Points ────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * A finish's points, shared on a tie: two level for 2nd share 2nd's and
 * 3rd's (20 and 16 make 18 each). A place past the table earns nothing.
 */
export function placePoints(table: readonly number[], place: number, tied = 1): number {
  if (place < 1 || tied < 1) return 0
  let sum = 0
  for (let p = place; p < place + tied; p++) sum += table[p - 1] ?? 0
  return round1(sum / tied)
}

/** A match play stage's points. */
export function stagePoints(rules: Pick<AwardRules, 'stages'>, stage: Stage | null): number {
  return stage ? rules.stages[stage] : 0
}

/**
 * Where each side got to in a draw (by side id): the Final's winner and
 * loser, then the losers of the semi-finals and quarter-finals. A side out
 * earlier, or a match still to be decided, earns nothing yet — so points
 * arrive as each round finishes.
 */
export function bracketStages(matches: readonly { roundNumber: number; sideA: string | null; sideB: string | null; winner: string | null }[]): Map<string, Stage> {
  const out = new Map<string, Stage>()
  if (matches.length === 0) return out
  const final = Math.max(...matches.map(m => m.roundNumber))
  for (const m of matches) {
    if (!m.winner || !m.sideA || !m.sideB) continue
    const loser = m.winner === m.sideA ? m.sideB : m.sideA
    const back = final - m.roundNumber
    if (back === 0) { out.set(m.winner, 'winner'); out.set(loser, 'runnerUp') }
    else if (back === 1) out.set(loser, 'semi')
    else if (back === 2) out.set(loser, 'quarter')
  }
  return out
}

/** "3rd", "T2" — a finish as the standing shows it. */
export function placeWords(place: number, tied: number): string {
  if (tied > 1) return `T${place}`
  const teen = place % 100 >= 11 && place % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th'
  return `${place}${suffix}`
}

// ─── The standing ──────────────────────────────────────────────

/** One competition's result as the award reads it — handed in by the server. */
export type AwardResult =
  | { code: string; name: string; date: string | null; kind: 'stroke'; finishers: { rowId: string; place: number; tied: number }[] }
  | { code: string; name: string; date: string | null; kind: 'matchplay'; stages: { rowId: string; stage: Stage }[] }

export interface AwardLine {
  code: string
  name: string
  date: string | null
  /** "3rd", "T2", "Winner". */
  detail: string
  /** Before the weight. */
  raw: number
  weight: number
  points: number
  /** Inside the player's best N. */
  counts: boolean
}

export interface StandingRow {
  rowId: string
  name: string
  total: number
  /** Golf's place: two level share one. */
  place: number
  lines: AwardLine[]
}

/** A competition's weight under these rules (absent, ×1). */
export function weightOf(rules: Pick<AwardRules, 'weights'>, code: string): Weight {
  return rules.weights[code] ?? 1
}

/** Whether this result counts for the award at all: its kind ticked, its weight above nought. */
export function resultCounts(rules: AwardRules, r: Pick<AwardResult, 'code' | 'kind'>): boolean {
  return (r.kind === 'stroke' ? rules.kinds.stroke : rules.kinds.matchPlay) && weightOf(rules, r.code) > 0
}

/**
 * The award's table: each person who may appear (`people`, already judged by
 * the award's entry rules) with every result that earned them points,
 * weighted, their best N counted, and golf's place on the total. Nobody with
 * nothing is listed.
 */
export function awardStanding(rules: AwardRules, results: readonly AwardResult[], people: readonly { rowId: string; name: string }[]): StandingRow[] {
  const nameOf = new Map(people.map(p => [p.rowId, p.name]))
  const linesOf = new Map<string, AwardLine[]>()
  const add = (rowId: string, line: Omit<AwardLine, 'counts'>) => {
    if (!nameOf.has(rowId) || line.points <= 0) return
    linesOf.set(rowId, [...(linesOf.get(rowId) ?? []), { ...line, counts: true }])
  }
  for (const r of results) {
    if (!resultCounts(rules, r)) continue
    const weight = weightOf(rules, r.code)
    if (r.kind === 'stroke') {
      for (const f of r.finishers) {
        const raw = placePoints(rules.points, f.place, f.tied)
        add(f.rowId, { code: r.code, name: r.name, date: r.date, detail: placeWords(f.place, f.tied), raw, weight, points: round1(raw * weight) })
      }
    } else {
      for (const s of r.stages) {
        const raw = stagePoints(rules, s.stage)
        add(s.rowId, { code: r.code, name: r.name, date: r.date, detail: STAGE_WORDS[s.stage], raw, weight, points: round1(raw * weight) })
      }
    }
  }
  const rows = [...linesOf].map(([rowId, lines]) => {
    const best = [...lines].sort((a, b) => b.points - a.points)
    const counted = new Set(rules.bestOf === null ? best : best.slice(0, rules.bestOf))
    const marked = lines
      .map(l => ({ ...l, counts: counted.has(l) }))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.name.localeCompare(b.name))
    return { rowId, name: nameOf.get(rowId)!, total: round1([...counted].reduce((s, l) => s + l.points, 0)), place: 0, lines: marked }
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  rows.forEach((r, i) => { r.place = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].place : i + 1 })
  return rows
}

/** "You’re 4th, 12 behind" / "You lead by 3" / "Level at the top" — or null for nobody on it yet. */
export function myStandingLine(rows: readonly StandingRow[], rowId: string): string | null {
  const me = rows.find(r => r.rowId === rowId)
  if (!me) return null
  const leader = rows[0]
  if (me.place === 1) {
    const next = rows.find(r => r.place > 1)
    if (rows.filter(r => r.place === 1).length > 1) return 'Level at the top'
    return next ? `You lead by ${round1(me.total - next.total)}` : 'You lead'
  }
  return `You’re ${placeWords(me.place, rows.filter(r => r.place === me.place).length)}, ${round1(leader.total - me.total)} behind`
}
