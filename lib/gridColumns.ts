// The Members grid's column widths — the only copy of their rules (S2, D273).
// A width is dragged from a header's edge, remembered per browser, and a
// double-click fits it to the widest cell. Pure: the grid does the drawing
// and the measuring, localStorage is read and written there in try/catch.

export type GridColumn =
  | 'name' | 'email' | 'memberNumber' | 'guiNumber' | 'handicapIndex'
  | 'gender' | 'birthDate' | 'categoryId' | 'standing'

export const GRID_COLUMNS: GridColumn[] = [
  'name', 'email', 'memberNumber', 'guiNumber', 'handicapIndex', 'gender', 'birthDate', 'categoryId', 'standing',
]

/** Where each column starts, in pixels. */
export const COLUMN_DEFAULTS: Record<GridColumn, number> = {
  name: 200, email: 240, memberNumber: 112, guiNumber: 112, handicapIndex: 96,
  gender: 128, birthDate: 128, categoryId: 160, standing: 136,
}

export const COLUMN_MIN = 72
export const COLUMN_MAX = 480
/** One key, versioned: a change to the columns starts a fresh memory rather than reading an old one wrongly. */
export const COLUMN_STORAGE_KEY = 'gd.clubhouse.members.cols.v1'
/** What an arrow key moves a handle by. */
export const COLUMN_STEP = 16

export function clampWidth(n: number): number {
  if (!Number.isFinite(n)) return COLUMN_MIN
  return Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, Math.round(n)))
}

/** The remembered widths over the defaults; anything that does not read is dropped, never refused. */
export function readWidths(raw: string | null): Record<GridColumn, number> {
  const out = { ...COLUMN_DEFAULTS }
  if (!raw) return out
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return out }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out
  for (const c of GRID_COLUMNS) {
    const v = (parsed as Record<string, unknown>)[c]
    if (typeof v === 'number' && Number.isFinite(v)) out[c] = clampWidth(v)
  }
  return out
}

/** Only the columns that differ from the defaults are kept. */
export function writeWidths(w: Record<GridColumn, number>): string {
  const diff: Partial<Record<GridColumn, number>> = {}
  for (const c of GRID_COLUMNS) if (w[c] !== COLUMN_DEFAULTS[c]) diff[c] = clampWidth(w[c])
  return JSON.stringify(diff)
}

/** The width that shows a text whole: its measured length, the cell's padding and any extra (a dropdown's arrow). */
export function fitWidth(textWidths: number[], extra = 0): number {
  return clampWidth(Math.max(0, ...textWidths) + 24 + extra)
}
