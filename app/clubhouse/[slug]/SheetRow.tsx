import type { CSSProperties, ReactNode } from 'react'

/**
 * One tee time in the Clubhouse's sheets — the casual tee sheet and a
 * competition's (Ross, 20 Nov 2026: the Clubhouse as good as is reasonable
 * on a phone). A computer lays the time in a column and the places across
 * in a row, as a spreadsheet would; a phone keeps the time in a narrow
 * gutter and the places two across beside it, so a fourball is a two by
 * two block and every name stays readable. The places are handed in as
 * children, one each.
 */
export default function SheetRow({ time, places, dim = false, children }: {
  time: string; places: number; dim?: boolean; children: ReactNode
}) {
  const rows = Math.max(1, Math.ceil(places / 2))
  return (
    <div role="group" aria-label={time} style={{ '--places': places, '--rows': rows } as CSSProperties}
      className={`grid grid-cols-[3.75rem_repeat(2,minmax(0,1fr))] md:grid-cols-[7rem_repeat(var(--places),minmax(0,1fr))] gap-1.5 md:gap-2 pl-3 pr-2 md:pl-0 md:pr-1 py-2 md:py-1.5 border-b border-line last:border-b-0 ${dim ? 'opacity-60' : ''}`}>
      <p className="[grid-row:span_var(--rows)] md:[grid-row:auto] t-label tabular-nums text-ink py-2 md:px-4">{time}</p>
      {children}
    </div>
  )
}
