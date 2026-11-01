'use client'

import type { CSSProperties, ReactNode } from 'react'
import { IconPlus, IconX } from '@/app/components/icons'
import { type SeatCell, type SeatJoins, seatCorners } from '@/lib/teeSheet'
import { formatHandicap, isHandicapPending, HANDICAP_PENDING_LABEL } from '@/lib/handicap'

/** An open seat that does something when tapped — Join, Add player. */
export type SeatAction = { label: string; sub?: string; onClick: () => void }

/** The half-moon cut at each end of a seam — its radius. */
const BITE = 7
/** The rounding where the cut meets the ticket's edge, so it has no sharp corner. */
const FILLET = 3
/** Points along each curve of the cut. */
const STEPS = 6
/** Half the gap between seats — what a joined seat reaches across to meet its partner. */
const HALF_GAP = 3

type Corner = 'tl' | 'tr' | 'br' | 'bl'

/**
 * The cut at one corner of a seat, as points measured in from that corner —
 * `u` across, `v` down or up — from the ticket's edge round to the seam.
 *
 * A quarter circle centred on the corner, so this seat's quarter and its
 * partner's make one half-moon across the seam, and a small round where it
 * leaves the edge (Ross, 1 Nov 2026: no hard corner, the house's rounding).
 * `seamAcross` is true where the seam runs across the ticket (seats above
 * and below) rather than down it.
 */
function cutPoints(seamAcross: boolean): [number, number][] {
  const d = Math.sqrt((BITE + FILLET) ** 2 - FILLET ** 2)
  const out: [number, number][] = []
  // The fillet: centred (d, FILLET), from the edge round to where it meets the bite.
  const end = Math.atan2(-FILLET, -d)
  for (let i = 0; i <= STEPS; i++) {
    const a = -Math.PI / 2 + (end + Math.PI / 2) * (i / STEPS)
    out.push([d + FILLET * Math.cos(a), FILLET + FILLET * Math.sin(a)])
  }
  // The bite: centred on the corner, from there round to the seam.
  const start = Math.atan2(FILLET, d)
  for (let i = 1; i <= STEPS; i++) {
    const b = start + (Math.PI / 2 - start) * (i / STEPS)
    out.push([BITE * Math.cos(b), BITE * Math.sin(b)])
  }
  return seamAcross ? out.map(([u, v]) => [v, u]) : out
}

/**
 * A seat's outline as a clip path: its four corners clockwise, each either
 * the plain corner (its rounding is the border radius's) or a cut. The cut
 * takes the edge's line with it — no outline round the half-moon.
 */
function seatClip(j: SeatJoins, notched: Record<Corner, boolean>): string | undefined {
  if (!notched.tl && !notched.tr && !notched.br && !notched.bl) return undefined
  const px = (n: number) => `${Math.round(n * 100) / 100}px`
  const at = (c: Corner, u: number, v: number) => {
    const x = c === 'tr' || c === 'br' ? `calc(100% - ${px(u)})` : px(u)
    const y = c === 'bl' || c === 'br' ? `calc(100% - ${px(v)})` : px(v)
    return `${x} ${y}`
  }
  // The edge each corner is reached along, going round clockwise.
  const arrivesAcross: Record<Corner, boolean> = { tl: false, tr: true, br: false, bl: true }
  const sideJoined: Record<Corner, boolean> = { tl: j.left, tr: j.right, br: j.right, bl: j.left }
  const points: string[] = []
  for (const c of ['tl', 'tr', 'br', 'bl'] as Corner[]) {
    if (!notched[c]) { points.push(at(c, 0, 0)); continue }
    // The seam runs down the ticket where this corner's side joins a
    // partner, and across it where the seat above or below does.
    const seamAcross = !sideJoined[c]
    let cut = cutPoints(seamAcross)
    // From the edge to the seam; reversed where the way round meets the seam first.
    const edgeFirst = arrivesAcross[c] !== seamAcross
    if (!edgeFirst) cut = cut.slice().reverse()
    for (const [u, v] of cut) points.push(at(c, u, v))
  }
  return `polygon(${points.join(', ')})`
}

/**
 * One tee time's seats (Ross, 31 Oct 2026): two across, a 2×2 grid for a
 * fourball, every player in a place made for them — name and handicap — and
 * partners joined into one ticket. The layout is lib/teeSheet.ts
 * `seatGrid`; how each seat is cut is `seatCorners`. Here it is only drawn.
 *
 * A seat on its own is a ticket of its own. Partners' seats close the gap
 * between them, the seam is a faint line, and each end of it is cut into a
 * half-moon with a rounded lip — a clip path on each seat, a quarter in
 * each, so the cut shows whatever is behind and carries no outline (Ross,
 * 1 Nov 2026). No gradient and no mask, which the site does not draw.
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
  // Partners' seats reach across the gap to meet. The left and upper seat
  // of each seam carry it as a faint line; the other has no edge there.
  const seam = 'var(--color-line)'
  const style: CSSProperties = {
    marginTop: joins.up ? -HALF_GAP : 0,
    marginRight: joins.right ? -HALF_GAP : 0,
    marginBottom: joins.down ? -HALF_GAP : 0,
    marginLeft: joins.left ? -HALF_GAP : 0,
    borderTopWidth: joins.up ? 0 : 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: joins.left ? 0 : 1,
    ...(joins.right ? { borderRightColor: seam } : {}),
    ...(joins.down ? { borderBottomColor: seam } : {}),
    borderTopLeftRadius: rounded.tl ? r : 0,
    borderTopRightRadius: rounded.tr ? r : 0,
    borderBottomLeftRadius: rounded.bl ? r : 0,
    borderBottomRightRadius: rounded.br ? r : 0,
    clipPath: seatClip(joins, notched),
  }
  return (
    <div
      className={`relative overflow-hidden px-2.5 py-2 border-solid border-line-strong ${mine ? 'bg-accent-tint' : 'bg-tint'}`}
      style={style}
    >
      {children}
    </div>
  )
}
