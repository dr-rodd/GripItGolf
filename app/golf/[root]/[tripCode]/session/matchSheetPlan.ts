import type { ComponentProps } from 'react'
import type { Leaderboard } from '@/lib/leaderboards'
import {
  type SessionMatchResult, overallOf, sessionBoardFor, sessionName, sessionSlotCount,
} from '@/lib/sessions'
import { describeTime } from '@/lib/itinerary'
import { type RoundSheet, sheetClock, teeClocks } from '@/lib/teeSheet'
import type MatchesSheet from './MatchesSheet'

/**
 * Every Matches session's sheet, the one copy the Order of play and the Tee
 * times tab both draw (Ross, 10 Nov 2026: "tee times should just add times
 * to what we already had"). A session's matches are its matches whether or
 * not it has tee times: a session whose round starts from a tee sheet gets
 * a time on each row once its sheet is open, every other one stays
 * "Match 1, Match 2…", and nothing set before is hidden by either.
 *
 * Pure — `matchSheets.ts` holds the Order of play's read of the times.
 */

export type MatchSheetProps = Omit<ComponentProps<typeof MatchesSheet>, 'open' | 'onToggle'>

/** A Matches session's tee times, where its round starts from a tee sheet. */
export type SessionTimes = {
  /** The sheet's times — absent while the sheet is not open yet. */
  clocks?: string[]
  /** A sheet not open to the field yet: when it opens. */
  opensLabel?: string | null
  /** Tee times are on for the round and its sheet is not open: the wizard. */
  setupHref?: string
}

/** A sheet's times as the rows read them — its batches, or a legacy sheet's run. */
export function clocksOf(sheet: RoundSheet, rows: number): string[] | undefined {
  if (sheet.state === 'vacant') return undefined
  if (sheet.state === 'active') return teeClocks(sheet.rules).map(t => describeTime(t))
  return Array.from({ length: Math.max(1, rows) }, (_, i) => sheetClock(sheet, i) ?? `Match ${i + 1}`)
}

/** What each tee-sheet round's sheet says, for the Matches sessions among them. */
export function sessionTimes(
  rounds: readonly { id: string; sheet: RoundSheet; opensLabel: string | null }[],
  setupHref: (roundId: string) => string,
  rowsOf: (roundId: string) => number,
): Map<string, SessionTimes> {
  return new Map(rounds.map(r => [r.id, r.sheet.state === 'vacant'
    ? { setupHref: setupHref(r.id) }
    : { clocks: clocksOf(r.sheet, rowsOf(r.id)), opensLabel: r.opensLabel }]))
}

/**
 * Every Matches session's sheet in running order, and the one to open on:
 * the round asked for, else the session in play, else the next to finish.
 */
export function buildMatchSheets(input: {
  boards: readonly Leaderboard[]
  rounds: readonly { id: string; round_number: number }[]
  results: readonly SessionMatchResult[]
  times: Map<string, SessionTimes>
  common: Omit<MatchSheetProps, 'roundId' | 'title' | 'format' | 'matches' | 'slots' | 'clocks' | 'opensLabel' | 'setupHref'>
  onlyRound?: string | null
  /** The field's size — a session never given a count holds its usual number. */
  fieldSize?: number
}): { sheets: MatchSheetProps[]; initialOpen: string | null } {
  const overall = overallOf(input.boards)
  if (!overall) return { sheets: [], initialOpen: null }
  const sessions = [...input.rounds]
    .sort((a, b) => a.round_number - b.round_number)
    .map(r => ({ round: r, board: sessionBoardFor(input.boards, r.id) }))
    .filter(s => s.board?.competition === 'matches' && s.board.matchFormat)
  const slotsOf = (roundId: string) =>
    sessionSlotCount(overall.overall, sessionBoardFor(input.boards, roundId), roundId, input.results, input.fieldSize ?? 0)
  const sheets = sessions.map(({ round, board }) => {
    const t = input.times.get(round.id)
    return {
      ...input.common,
      roundId: round.id,
      title: sessionName(overall.overall, round.id, round.round_number),
      format: board!.matchFormat!,
      matches: input.results.filter(m => m.roundId === round.id),
      slots: slotsOf(round.id),
      ...(t?.clocks ? { clocks: t.clocks } : {}),
      ...(t?.opensLabel ? { opensLabel: t.opensLabel } : {}),
      ...(t?.setupHref ? { setupHref: t.setupHref } : {}),
    }
  })
  const done = (roundId: string) =>
    input.results.filter(m => m.roundId === roundId && m.result).length >= Math.max(1, slotsOf(roundId))
  const open = sessions.find(s => s.round.id === input.onlyRound)
    ?? sessions.find(s => input.results.some(m => m.roundId === s.round.id && m.live && !m.result))
    ?? sessions.find(s => !done(s.round.id))
    ?? sessions[0]
  return { sheets, initialOpen: open?.round.id ?? null }
}
