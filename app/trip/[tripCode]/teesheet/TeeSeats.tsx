'use client'

import type { CSSProperties, ReactNode } from 'react'
import { IconPlus, IconX } from '@/app/components/icons'
import { type SeatCell, type SeatJoins, type SeatTarget, seatCorners } from '@/lib/teeSheet'
import { formatHandicap, isHandicapPending, HANDICAP_PENDING_LABEL } from '@/lib/handicap'

/** The half-moon cut at each end of a seam — its radius (Ross, 1 Nov 2026: slightly smaller than the first 7). */
const BITE = 5.5
/** The rounding where the cut meets the ticket's edge, so it has no sharp corner. */
const FILLET = 2.5
/** Points along each curve of the cut. */
const STEPS = 6
/** The ticket's edge, which carries on round the cut. */
const EDGE = 1
/** Half the gap between seats — what a joined seat reaches across to meet its partner. */
const HALF_GAP = 3
/** How far along the ticket's edge the cut starts, from the corner. */
const REACH = Math.sqrt((BITE + FILLET) ** 2 - FILLET ** 2)

type Corner = 'tl' | 'tr' | 'br' | 'bl'

/** The side a corner's seat is joined on, left or right — else the seam there runs across, to the seat above or below. */
const sideJoined = (j: SeatJoins, c: Corner) => (c === 'tl' || c === 'bl' ? j.left : j.right)

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
  const d = REACH
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
  const points: string[] = []
  for (const c of ['tl', 'tr', 'br', 'bl'] as Corner[]) {
    if (!notched[c]) { points.push(at(c, 0, 0)); continue }
    // The seam runs down the ticket where this corner's side joins a
    // partner, and across it where the seat above or below does.
    const seamAcross = !sideJoined(j, c)
    let cut = cutPoints(seamAcross)
    // From the edge to the seam; reversed where the way round meets the seam first.
    const edgeFirst = arrivesAcross[c] !== seamAcross
    if (!edgeFirst) cut = cut.slice().reverse()
    for (const [u, v] of cut) points.push(at(c, u, v))
  }
  return `polygon(${points.join(', ')})`
}

/**
 * The ticket's edge carried on round one cut (Ross, 1 Nov 2026: a border
 * round the indent), as a band EDGE wide just inside the clip — measured
 * as `cutPoints` is, from the corner, with the edge along the top and the
 * seam down the left. The seat's own border already draws the first EDGE
 * of the ticket's edge, so the band starts below it rather than painting a
 * see-through colour twice: from there round the lip and the half-moon to
 * the seam. A filled band, not a stroke, so it can stop exactly there.
 */
function cutEdgePath(): string {
  const n = (x: number) => Math.round(x * 1000) / 1000
  // A point on the line from the corner to the lip's centre, r from the corner.
  const toward = (r: number) => `${n(REACH * r / (BITE + FILLET))} ${n(FILLET * r / (BITE + FILLET))}`
  const start = REACH - Math.sqrt(FILLET ** 2 - (FILLET - EDGE) ** 2)
  return [
    `M ${n(start)} ${EDGE}`,
    `A ${FILLET} ${FILLET} 0 0 0 ${toward(BITE)}`,
    `A ${BITE} ${BITE} 0 0 1 0 ${BITE}`,
    `L 0 ${BITE + EDGE}`,
    `A ${BITE + EDGE} ${BITE + EDGE} 0 0 0 ${toward(BITE + EDGE)}`,
    `A ${FILLET - EDGE} ${FILLET - EDGE} 0 0 1 ${n(REACH)} ${EDGE}`,
    'Z',
  ].join(' ')
}
const CUT_EDGE = cutEdgePath()
/** The square each cut's edge is drawn in. */
const CUT_BOX = Math.ceil(REACH + FILLET)

/**
 * One tee time's seats (Ross, 31 Oct 2026): two across, a 2×2 grid for a
 * fourball, every player in a place made for them — name and handicap — and
 * partners joined into one ticket. The layout is lib/teeSheet.ts
 * `seatGrid`; how each seat is cut is `seatCorners`. Here it is only drawn.
 *
 * A seat on its own is a ticket of its own. Partners' seats close the gap
 * between them, the seam is a faint line, and each end of it is cut into a
 * half-moon with a rounded lip — a clip path on each seat, a quarter in
 * each, so the cut shows whatever is behind, and the ticket's edge carries
 * on round it (Ross, 1 Nov 2026). No gradient and no mask, which the site
 * does not draw.
 *
 * On the sheet, open seats are dashed and the ones this phone may book
 * carry a + (`targets`, lib/teeSheet.ts `seatTargets`) that pushes down
 * under the thumb. While a time is being booked (`booking`) the seats are
 * the draft: this booking's picks wear the chosen look and come out with a
 * tap of their ✕, and the seat the next pick goes in is marked.
 */
export default function TeeSeats({
  rows, handicapOf, meId, targets, onTarget, removeFor, booking,
}: {
  rows: SeatCell[][]
  handicapOf: (playerId: string) => number | null | undefined
  meId: string | null
  /** The + signs, by seat (reading order), and what tapping one does. */
  targets?: (SeatTarget | null)[]
  onTarget?: (seat: number, target: SeatTarget) => void
  /**
   * The ✕ on a seat, if this phone may take the player off: what it reads
   * as, and what it does (a stuck-together team's whole ticket, on its top
   * right seat only). Null for no ✕.
   */
  removeFor?: (cell: Extract<SeatCell, { kind: 'player' }>) => { label: string; onRemove: () => void } | null
  /** The draft being booked, when it is. */
  booking?: {
    /** The seat the next pick goes in. */
    next: number | null
    /** What the next seat is called — "Partner", "Next". */
    nextLabel: string
    /** This booking's own picks, worn in the chosen look. */
    isNew: (seat: number) => boolean
    /** Who can come off the time here: this booking's picks, and those this phone may remove. */
    mayTakeOut: (seat: number) => boolean
    onTakeOut: (seat: number) => void
    /** Tapping another open seat moves where the next pick goes. */
    onChoose: (seat: number) => void
  }
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 auto-rows-[56px]">
      {rows.flat().map((cell, i) => {
        if (cell.kind === 'none') return <div key={i} aria-hidden="true" />
        if (cell.kind === 'open') {
          if (booking) {
            const next = booking.next === i
            return (
              <button
                key={i}
                type="button"
                onClick={() => booking.onChoose(i)}
                aria-pressed={next}
                className={`press rounded-tile border border-dashed px-2.5 flex items-center t-label transition-colors ${
                  next ? 'border-accent-deep bg-accent-tint text-accent-deep' : 'border-line text-ink/50'
                }`}
              >
                {next ? booking.nextLabel : ''}
              </button>
            )
          }
          const target = targets?.[i]
          return target && onTarget ? (
            <button
              key={i}
              type="button"
              onClick={() => onTarget(i, target)}
              aria-label={target.kind === 'join' ? 'Join this pairing' : target.kind === 'start' ? 'Start a pairing' : 'Book this time'}
              className="press rounded-tile border border-dashed border-line-strong flex items-center justify-center text-accent-deep hover:border-accent hover:text-accent"
            >
              <IconPlus size={20} />
            </button>
          ) : (
            <div key={i} aria-hidden="true" className="rounded-tile border border-dashed border-line" />
          )
        }
        const fresh = !!booking?.isNew(i)
        const remove = booking
          ? (booking.mayTakeOut(i) ? { label: `Take ${cell.player.name} off this time`, onRemove: () => booking.onTakeOut(i) } : null)
          : removeFor?.(cell) ?? null
        const h = handicapOf(cell.player.id)
        return (
          <Seat key={cell.player.id} joins={cell.joins} tone={fresh ? 'chosen' : cell.player.id === meId ? 'mine' : 'plain'}>
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
function Seat({ joins, tone, children }: { joins: SeatJoins; tone: 'plain' | 'mine' | 'chosen'; children: ReactNode }) {
  const { rounded, notched } = seatCorners(joins)
  const r = 'var(--radius-tile)'
  // Partners' seats reach across the gap to meet. The left and upper seat
  // of each seam carry it as a faint line; the other has no edge there.
  const seam = 'var(--color-line)'
  const edge = tone === 'chosen' ? 'var(--color-accent-deep)' : 'var(--color-line-strong)'
  const width = { top: joins.up ? 0 : EDGE, right: EDGE, bottom: EDGE, left: joins.left ? 0 : EDGE }
  const style: CSSProperties = {
    marginTop: joins.up ? -HALF_GAP : 0,
    marginRight: joins.right ? -HALF_GAP : 0,
    marginBottom: joins.down ? -HALF_GAP : 0,
    marginLeft: joins.left ? -HALF_GAP : 0,
    borderTopWidth: width.top,
    borderRightWidth: width.right,
    borderBottomWidth: width.bottom,
    borderLeftWidth: width.left,
    ...(joins.right ? { borderRightColor: seam } : {}),
    ...(joins.down ? { borderBottomColor: seam } : {}),
    borderTopLeftRadius: rounded.tl ? r : 0,
    borderTopRightRadius: rounded.tr ? r : 0,
    borderBottomLeftRadius: rounded.bl ? r : 0,
    borderBottomRightRadius: rounded.br ? r : 0,
    clipPath: seatClip(joins, notched),
  }
  // Not overflow-hidden: that clips to inside the border, and the edge
  // round each cut is drawn over the border's own ground. The clip path
  // and the name's truncate already keep everything in.
  return (
    <div
      className={`relative px-2.5 py-2 border-solid ${
        tone === 'chosen' ? 'bg-accent-tint border-accent-deep' : tone === 'mine' ? 'bg-accent-tint border-line-strong' : 'bg-tint border-line-strong'
      }`}
      style={style}
    >
      {(['tl', 'tr', 'br', 'bl'] as Corner[]).filter(c => notched[c]).map(c => {
        const [v, h] = [c[0] === 't' ? 'top' : 'bottom', c[1] === 'l' ? 'left' : 'right'] as const
        return (
          <svg
            key={c}
            aria-hidden="true"
            width={CUT_BOX}
            height={CUT_BOX}
            viewBox={`0 0 ${CUT_BOX} ${CUT_BOX}`}
            className="absolute pointer-events-none"
            style={{ [v]: -width[v], [h]: -width[h], transform: `scale(${h === 'right' ? -1 : 1}, ${v === 'bottom' ? -1 : 1})` }}
          >
            <path d={CUT_EDGE} transform={sideJoined(joins, c) ? undefined : 'matrix(0 1 1 0 0 0)'} style={{ fill: edge }} />
          </svg>
        )
      })}
      {children}
    </div>
  )
}
