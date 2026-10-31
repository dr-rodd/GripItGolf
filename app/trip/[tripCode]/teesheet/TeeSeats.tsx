'use client'

import type { CSSProperties, ReactNode } from 'react'
import { IconPlus, IconX } from '@/app/components/icons'
import { type SeatCell, type SeatJoins, seatCorners } from '@/lib/teeSheet'
import { formatHandicap, isHandicapPending, HANDICAP_PENDING_LABEL } from '@/lib/handicap'

/** An open seat that does something when tapped — Join, Add player. */
export type SeatAction = { label: string; sub?: string; onClick: () => void }

/** The half-moon at each end of a perforation. */
const NOTCH = 16
/** The perforation's dots. */
const SEAM = 2
/** Half the gap between seats — what a joined seat reaches across to meet its partner. */
const HALF_GAP = 3

/**
 * One tee time's seats (Ross, 31 Oct 2026): two across, a 2×2 grid for a
 * fourball, every player in a place made for them — name and handicap — and
 * partners joined into one ticket. The layout is lib/teeSheet.ts
 * `seatGrid`; how each seat is cut is `seatCorners`. Here it is only drawn.
 *
 * A seat on its own is a ticket of its own. Partners' seats close the gap
 * between them, the seam is a dotted perforation, and each end of it is cut
 * into a half-moon — drawn as two quarter circles in the colour of the card
 * behind, one in each seat, because the site draws no gradients and a mask
 * would need one. So the tee sheet must sit on a `surface` card.
 *
 * Open seats are dashed. The first ones carry what this phone may do there
 * (`actions`, in order); the rest just say Open.
 */
export default function TeeSeats({
  rows, handicapOf, meId, actions, removeFor,
}: {
  rows: SeatCell[][]
  handicapOf: (playerId: string) => number | null | undefined
  meId: string | null
  /** What the first open seats do, in order. */
  actions: SeatAction[]
  /**
   * The ✕ on a seat, if this phone may take the player off: the ids it
   * removes (a stuck-together team's whole block, on the ticket's top right
   * seat only) and the label it reads as. Null for no ✕.
   */
  removeFor: (cell: Extract<SeatCell, { kind: 'player' }>) => { ids: string[]; label: string; onRemove: () => void } | null
}) {
  let nextAction = 0
  return (
    <div className="grid grid-cols-2 gap-1.5 auto-rows-[56px]">
      {rows.flat().map((cell, i) => {
        if (cell.kind === 'none') return <div key={i} aria-hidden="true" />
        if (cell.kind === 'open') {
          const action = actions[nextAction++]
          return action ? (
            <button
              key={i}
              type="button"
              onClick={action.onClick}
              className="rounded-tile border border-dashed border-line-strong px-2.5 flex flex-col items-start justify-center text-left text-accent-deep hover:border-accent hover:text-accent transition-colors"
            >
              <span className="flex items-center gap-1 t-label"><IconPlus size={13} />{action.label}</span>
              {action.sub && <span className="text-[13px] leading-tight text-ink/65 mt-0.5">{action.sub}</span>}
            </button>
          ) : (
            <div key={i} className="rounded-tile border border-dashed border-line px-2.5 flex items-center t-cap text-ink/50">
              Open
            </div>
          )
        }
        const remove = removeFor(cell)
        const h = handicapOf(cell.player.id)
        return (
          <Seat key={cell.player.id} joins={cell.joins} mine={cell.player.id === meId}>
            <span className={`block t-label text-ink truncate ${remove ? 'pr-5' : ''}`}>
              {cell.player.name}
            </span>
            <span className="block text-[13px] leading-tight text-ink/65 tabular-nums mt-0.5">
              {isHandicapPending(h) ? HANDICAP_PENDING_LABEL : `HCP ${formatHandicap(h!)}`}
            </span>
            {remove && (
              <button
                type="button"
                onClick={remove.onRemove}
                aria-label={remove.label}
                className="absolute top-1 right-1 p-1 text-ink/50 hover:text-rust transition-colors"
              >
                <IconX size={12} />
              </button>
            )}
          </Seat>
        )
      })}
    </div>
  )
}

/** A filled seat — a ticket, or one part of one. */
function Seat({ joins, mine, children }: { joins: SeatJoins; mine: boolean; children: ReactNode }) {
  const { rounded, notched } = seatCorners(joins)
  const r = 'var(--radius-tile)'
  // Partners' seats reach across the gap to meet; the left and upper seat
  // of each seam carry its dots, the other has no edge there.
  const width = {
    top: joins.up ? 0 : 1,
    right: joins.right ? SEAM : 1,
    bottom: joins.down ? SEAM : 1,
    left: joins.left ? 0 : 1,
  }
  const style: CSSProperties = {
    marginTop: joins.up ? -HALF_GAP : 0,
    marginRight: joins.right ? -HALF_GAP : 0,
    marginBottom: joins.down ? -HALF_GAP : 0,
    marginLeft: joins.left ? -HALF_GAP : 0,
    borderTopWidth: width.top,
    borderRightWidth: width.right,
    borderBottomWidth: width.bottom,
    borderLeftWidth: width.left,
    borderRightStyle: joins.right ? 'dotted' : 'solid',
    borderBottomStyle: joins.down ? 'dotted' : 'solid',
    borderTopLeftRadius: rounded.tl ? r : 0,
    borderTopRightRadius: rounded.tr ? r : 0,
    borderBottomLeftRadius: rounded.bl ? r : 0,
    borderBottomRightRadius: rounded.br ? r : 0,
  }
  // Each notch is centred where the seam meets the ticket's edge, so the
  // quarter inside this seat meets the partner's quarter across it — on
  // the middle of the dots, which the left or upper seat carries.
  const half = NOTCH / 2
  const joined = { top: joins.up, bottom: joins.down, left: joins.left, right: joins.right }
  const onSeam = (side: 'top' | 'bottom' | 'left' | 'right') => {
    const at = -(half + width[side])
    if (!joined[side]) return at
    return side === 'right' || side === 'bottom' ? at + SEAM / 2 : at - SEAM / 2
  }
  const notch = (v: 'top' | 'bottom', h: 'left' | 'right') => (
    <span
      key={`${v}-${h}`}
      aria-hidden="true"
      className="absolute rounded-full bg-surface border border-line-strong"
      style={{ width: NOTCH, height: NOTCH, [v]: onSeam(v), [h]: onSeam(h) }}
    />
  )
  return (
    <div
      className={`relative overflow-hidden px-2.5 py-2 border-solid ${mine ? 'bg-accent-tint border-line-strong' : 'bg-tint border-line-strong'}`}
      style={style}
    >
      {children}
      {notched.tl && notch('top', 'left')}
      {notched.tr && notch('top', 'right')}
      {notched.bl && notch('bottom', 'left')}
      {notched.br && notch('bottom', 'right')}
    </div>
  )
}
