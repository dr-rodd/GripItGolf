// A golfer's handicap index, one value (D179; Ross, 16 Nov 2026).
//
// It lives on the Green Dot account (`account_handicaps`, migration 089),
// shown and changed on Me. A club's list shows the account's value for a
// linked row; a row no account is linked to holds its own
// (`club_members.handicap_index`) until it is linked. Every change is
// logged — old, new, when, by whom, from where (`handicap_changes`) — and
// the day's changes are shown to the admin at Certify (stage (d4)).
//
// Pure: the limits, reading what was typed, and what linking a row with an
// index of its own does. `app/api/handicaps/` is the one writer.
//
// Stored as the app stores every handicap: a plus handicap is negative
// (lib/handicap.ts), one decimal.

import { formatHandicap, readHandicapField } from './handicap'

/** The WHS index runs to 54; a plus handicap past +10 is no real golfer. */
export const INDEX_MIN = -10
export const INDEX_MAX = 54

/** Where a change came from, as the log keeps it. */
export type IndexSource = 'me' | 'list' | 'start_sheet' | 'link' | 'unlink'

/** Whose value it is: an account's, or a list row's own while no account is linked. */
export type IndexOwner = { userId: string } | { memberId: string }

/** To one decimal, as the column holds it. */
export function roundIndex(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * What was typed, as an index to store: a number in range, null for an
 * empty box (no index), or the reason it cannot be stored.
 */
export function readIndex(raw: unknown): { ok: true; value: number | null } | { ok: false; why: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw === 'number') return inRange(raw)
  if (typeof raw !== 'string') return { ok: false, why: 'Type a handicap index, like 14.2.' }
  const v = readHandicapField(raw)
  if (v === null) return { ok: true, value: null }
  if (v === undefined) return { ok: false, why: 'Type a handicap index, like 14.2, or +1.5 for a plus handicap.' }
  return inRange(v)
}

function inRange(v: number): { ok: true; value: number } | { ok: false; why: string } {
  if (!Number.isFinite(v)) return { ok: false, why: 'Type a handicap index, like 14.2.' }
  const r = roundIndex(v)
  if (r < INDEX_MIN || r > INDEX_MAX) return { ok: false, why: `A handicap index runs from +${-INDEX_MIN} to ${INDEX_MAX}.` }
  return { ok: true, value: r }
}

/** Two indexes the same, to the decimal the column holds — null equal only to null. */
export function sameIndex(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return roundIndex(a) === roundIndex(b)
}

/** An index as people write it: "14.2", "+1.5", or "Not set". */
export function indexLabel(v: number | null): string {
  return v === null ? 'Not set' : formatHandicap(v)
}

/**
 * What linking a list row to an account does with the row's own index
 * (D179):
 *  - the account has none → it takes the row's;
 *  - both the same → nothing but the row's copy cleared;
 *  - they differ → **the account's stands**, the row's is cleared, and the
 *    person is told once.
 * The row's copy is always cleared, so there is one value.
 */
export function linkPlan(accountIndex: number | null, rowIndex: number | null, clubName: string): {
  /** The account's value after linking, when it changes. */
  setAccount: number | null | undefined
  /** The row's own copy goes. */
  clearRow: boolean
  /** Said to the person on linking, once — or nothing. */
  note: string | null
} {
  if (rowIndex === null) return { setAccount: undefined, clearRow: false, note: null }
  if (accountIndex === null) return { setAccount: rowIndex, clearRow: true, note: null }
  if (sameIndex(accountIndex, rowIndex)) return { setAccount: undefined, clearRow: true, note: null }
  return {
    setAccount: undefined,
    clearRow: true,
    note: `${clubName} had ${formatHandicap(rowIndex)} for you; your Green Dot index ${formatHandicap(accountIndex)} stands. Change it on Me.`,
  }
}
