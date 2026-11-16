// A row of a club's list as stored, and its credentials read fail-soft
// (migration 092). Its own file, imported by every store that reads the
// list — the club's, the booking's, the card's, the entry's, the account's
// — so none of them imports another.

import type { ClubRole } from '@/lib/clubs'
import type { MemberRecord } from './club'

const BASE_ROW_COLS = 'id, club_id, name, member_number, gui_number, email, role, user_id, removed_at, on_boards'
const TICK_COLS = 'plays_here, officer, clubhouse'

export type RowRow = {
  id: string; club_id: string; name: string; member_number: string | null; gui_number: string | null
  email: string | null; role: ClubRole; user_id: string | null; removed_at: string | null; on_boards: boolean
  /** Migration 092's ticks — absent before it. */
  plays_here?: boolean; officer?: boolean; clubhouse?: boolean
}

/**
 * A row's credentials (092) are read fail-soft: a query names the tick
 * columns while they exist and, refused for a missing column, is asked
 * again without them — every row then reads its ticks off its role
 * (`credentialsOf` in lib/clubMay.ts). Tried again a minute later, so
 * pasting 092 takes effect without a deploy.
 */
let ticksMissingAt = 0
export function isMissingColumn(e: { code?: string } | null | undefined): boolean {
  return !!e && (e.code === '42703' || e.code === 'PGRST204')
}
export function rowCols(ticks: boolean): string {
  return ticks ? `${BASE_ROW_COLS}, ${TICK_COLS}` : BASE_ROW_COLS
}
/** Whether to name the tick columns now. */
export function ticksOn(): boolean {
  return Date.now() - ticksMissingAt > 60_000
}
/** The tick columns were found missing: read off the role for a minute. */
export function ticksMissing() {
  ticksMissingAt = Date.now()
}
export async function withTicks<R extends { error: { code?: string } | null }>(run: (ticks: boolean) => PromiseLike<R>): Promise<R> {
  const on = ticksOn()
  const r = await run(on)
  if (on && isMissingColumn(r.error)) {
    ticksMissing()
    return run(false)
  }
  return r
}

/** A change to the ticks before migration 092 is in. */
export class TicksNotReady extends Error {
  constructor() { super('club_members has no tick columns yet (migration 092)'); this.name = 'TicksNotReady' }
}

export const asRow = (r: RowRow): MemberRecord => ({
  id: r.id, clubId: r.club_id, name: r.name, memberNumber: r.member_number, guiNumber: r.gui_number,
  email: r.email, role: r.role, userId: r.user_id, removedAt: r.removed_at, onBoards: r.on_boards,
  ...(typeof r.plays_here === 'boolean' ? { playsHere: r.plays_here, officer: !!r.officer, clubhouse: !!r.clubhouse } : {}),
})

