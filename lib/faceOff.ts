/**
 * Two tags facing off — the Dynamic Overall Leaderboard drawn as a ticker
 * (Ross, 9 Nov 2026): every point up for grabs a mark across the top, the
 * left tag's points filling in from the left edge and the right tag's from
 * the right, a match in play counted in a softened version of the colour of
 * whoever is ahead in it. The only copy of the sums; the leaderboard only
 * draws. Pure.
 *
 * The points up for grabs are every session's: a Matches session's slots
 * (`matchSlotsFor` — the number set at creation or in the organiser area,
 * else the matches set so far) times what a match pays both sides, and a
 * stroke session's top two places. A TBC session, or one set not to count,
 * adds nothing until it is set.
 */

import {
  type OverallRules, type SessionFeed, type SessionMatchResult,
  feedFor, sessionSlotCount, matchPoints,
} from './sessions'
import type { Leaderboard } from './leaderboards'

export type FaceOffSide = {
  id: string
  name: string
  /** Points banked: finished matches and sessions. */
  points: number
  /** Banked plus the matches in play, as they stand. */
  projected: number
}

/** One mark on the ticker: how much of it each band covers, left to right. */
export type TickFill = {
  /** Left tag's banked, then projected, share — from the left edge. */
  leftWon: number
  leftLive: number
  /** Right tag's projected, then banked, share — reaching in from the right. */
  rightLive: number
  rightWon: number
}

export type FaceOff = {
  left: FaceOffSide
  right: FaceOffSide
  /** Every point up for grabs. */
  total: number
  /** What wins it outright: more than half. */
  toWin: number
  /** A tag that has reached `toWin`. */
  winner: 'left' | 'right' | null
  /** Matches in play. */
  live: number
  ticks: TickFill[]
}

/** A side's colour, softened — a match in play; the match card's lighter mark. */
export const softened = (c: string) => `color-mix(in srgb, ${c} 45%, transparent)`

/** More marks than this and each stands for more than one point. */
export const MAX_TICKS = 40

/** Both sides' share of one match — a win plus a loss, or two halves. */
export function matchPool(feed: SessionFeed): number {
  if (feed.kind !== 'match') return 0
  return Math.max(feed.win + feed.loss, 2 * feed.half)
}

/** A session's points up for grabs between two sides. */
export function sessionPool(feed: SessionFeed, slots: number): number {
  if (feed.kind === 'match') return slots * matchPool(feed)
  if (feed.kind === 'position') return (feed.points[0] ?? 0) + (feed.points[1] ?? 0)
  return 0
}

/** "Thru 11", "2 UP" — a match's standing for its pill. */
export type MatchStatus = {
  main: string
  sub: string | null
  /** Whose colour: a side's, the brown of a half, or none (not started). */
  tone: 'a' | 'b' | 'half' | 'none'
  /** Finished — solid; in play — softened. */
  final: boolean
}

export function matchStatus(m: SessionMatchResult): MatchStatus {
  if (m.result === 'halved') return { main: 'A/S', sub: 'Halved', tone: 'half', final: true }
  if (m.result === 'a' || m.result === 'b') {
    const margin = m.margin && m.margin !== 'Halved' ? m.margin.replace(/ up$/i, ' UP') : 'Won'
    return { main: margin, sub: 'Final', tone: m.result, final: true }
  }
  if (m.live) {
    const thru = m.thru ? `Thru ${m.thru}` : null
    if (m.leader && m.up) return { main: `${m.up} UP`, sub: thru, tone: m.leader, final: false }
    return { main: 'A/S', sub: thru, tone: 'half', final: false }
  }
  return { main: 'vs', sub: null, tone: 'none', final: false }
}

/**
 * The face-off, or null when the Overall is not two tags.
 *
 * `rows` are the Overall's own rows (lib/overallRows.ts) — the banked
 * points are theirs, never worked out twice. `tags` are the event's two, in
 * order: the first on the left. `tagOf` names the tag a match's side plays
 * for, null for a side that is not one tag.
 */
export function faceOff(input: {
  rules: OverallRules
  tags: readonly { id: string; name: string }[]
  rows: readonly { id: string; total: number }[]
  rounds: readonly { id: string; casual?: boolean | null }[]
  boards: readonly Leaderboard[]
  sessionBoardFor: (boards: readonly Leaderboard[], roundId: string) => Leaderboard | null
  matches: readonly SessionMatchResult[]
  tagOf: (ids: readonly string[]) => string | null
  /** The field's size — a session never given a count holds its usual number. */
  fieldSize?: number
}): FaceOff | null {
  const { rules, tags, rows, rounds, boards, matches, tagOf } = input
  if (rules.ranks !== 'tags' || tags.length !== 2) return null
  const [l, r] = tags
  const banked = (id: string) => rows.find(x => x.id === id)?.total ?? 0

  let total = 0
  let liveLeft = 0, liveRight = 0, live = 0
  for (const round of rounds) {
    if (round.casual === true) continue
    const board = input.sessionBoardFor(boards, round.id)
    const feed = feedFor(rules, round.id, board, 2)
    if (!board || feed.kind === 'none') continue
    const slots = sessionSlotCount(rules, board, round.id, matches, input.fieldSize ?? 0)
    total += sessionPool(feed, slots)
    if (feed.kind !== 'match') continue
    for (const m of matches) {
      if (m.roundId !== round.id || m.result || !m.live) continue
      live++
      const tagA = tagOf(m.sideA), tagB = tagOf(m.sideB)
      const leftSide: 'a' | 'b' | null = tagA === l.id ? 'a' : tagB === l.id ? 'b' : null
      if (!leftSide) continue
      const leftOut = !m.leader ? 'half' : m.leader === leftSide ? 'win' : 'loss'
      const rightOut = leftOut === 'half' ? 'half' : leftOut === 'win' ? 'loss' : 'win'
      liveLeft += matchPoints(feed, leftOut)
      liveRight += matchPoints(feed, rightOut)
    }
  }

  const left: FaceOffSide = { id: l.id, name: l.name, points: banked(l.id), projected: banked(l.id) + liveLeft }
  const right: FaceOffSide = { id: r.id, name: r.name, points: banked(r.id), projected: banked(r.id) + liveRight }
  // Never fewer points up for grabs than have been handed out.
  total = Math.max(total, left.projected + right.projected)
  const toWin = total / 2 + 0.5
  const winner = total > 0 && left.points >= toWin ? 'left' : total > 0 && right.points >= toWin ? 'right' : null
  return { left, right, total, toWin, winner, live, ticks: tickFills(total, left, right) }
}

/** Each mark's share of the four bands — banked first, from each edge. */
export function tickFills(
  total: number,
  left: Pick<FaceOffSide, 'points' | 'projected'>,
  right: Pick<FaceOffSide, 'points' | 'projected'>,
): TickFill[] {
  if (total <= 0) return []
  const unit = Math.max(1, Math.ceil(total / MAX_TICKS))
  const count = Math.ceil(total / unit - 1e-9)
  const lw = Math.min(total, left.points)
  const lp = Math.min(total, Math.max(lw, left.projected))
  const rw = Math.max(lp, total - right.points)
  const rp = Math.max(lp, Math.min(rw, total - right.projected))
  const overlap = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from))
  const out: TickFill[] = []
  for (let i = 0; i < count; i++) {
    const from = i * unit, to = Math.min(total, (i + 1) * unit)
    const w = to - from
    out.push({
      leftWon: overlap(0, lw, from, to) / w,
      leftLive: overlap(lw, lp, from, to) / w,
      rightLive: overlap(rp, rw, from, to) / w,
      rightWon: overlap(rw, total, from, to) / w,
    })
  }
  return out
}
