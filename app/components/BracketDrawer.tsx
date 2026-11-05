'use client'

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  AUTO_SEEDINGS, DRAW_METHODS, DRAW_TIMINGS, byHandicap, clearedDraft, drawnAtRandom, drawnBySeed,
  mayChangeRounds, moveToSeed, placedInDraft, seedOf, shuffled, withLock, withRounds,
  type AutoSeeding, type DrawDraft, type DrawEntrant, type DrawMethod, type DrawWhen,
} from '@/lib/bracketDraw'
import {
  entryNote, lastEntryRound, layoutPlaced, lockedMatchShown, lockedState, matchShown, optimalShape, placeState,
  type BracketLayout, type BracketShape,
} from '@/lib/bracketEditor'
import { roundName } from '@/lib/matchplay'
import { formatHandicap } from '@/lib/handicap'
import { putt, reducedMotion } from '@/lib/motion'
import { dropIndex, makeRoom, settleOffset, type RowBoxes } from '@/lib/dragReorder'
import DateField from './DateField'
import { FIELD, FIELD_LABEL, IconButton, ListGroup, ListRow, buttonClass, cardClass, chipClass, optionClass } from './ui'

/**
 * Making a knockout's draw (lib/bracketDraw.ts) — the same builder at
 * creation and in the organiser area, and **the bracket itself** (Ross, 5
 * Nov 2026: "ultimately I want an interactive bracket"):
 *
 * * the bracket the field needs, with a round more or fewer beside its count
 *   (the **−** and **+**);
 * * **Random** fills it from a hat, again as often as tapped; **Seeded**
 *   opens the numbered list and fills it by seed; **By hand** empties it;
 * * **any place can be tapped**, and swells into the names to choose from
 *   (a search box once there are more than 32). A player put in a later
 *   round has byes to it; a place the result of a match will fill takes
 *   nobody (lib/bracketEditor.ts, the rules).
 *
 * The builder only edits a draft; whoever holds it saves it.
 */
export default function BracketDrawer({ entrants, value, onChange }: {
  entrants: readonly DrawEntrant[]
  /** The draft lined up with the field (`syncDraft`). */
  value: DrawDraft
  onChange: (next: DrawDraft) => void
}) {
  const byId = new Map(entrants.map(e => [e.id, e]))
  const nameOf = (id: string) => byId.get(id)?.name ?? 'A player'
  const field = entrants.map(e => e.id)
  // What a swell has open, and whether it is on its way back in.
  const [picking, setPicking] = useState<{ r: number; c: number; from: DOMRect; closing?: boolean } | null>(null)
  const [seeding, setSeeding] = useState<{ order: string[]; from: DOMRect; closing?: boolean } | null>(null)
  const closePicker = () => setPicking(p => (p ? { ...p, closing: true } : p))
  const closeSeeds = () => setSeeding(s => (s ? { ...s, closing: true } : s))
  const R = value.layout.rounds
  const hint = DRAW_METHODS.find(m => m.key === value.method)?.hint
  // Locked to the best spread (Ross, 5 Nov 2026) — the places it offers.
  const shape = value.locked ? optimalShape(field.length) : null

  function choose(method: DrawMethod, from: DOMRect) {
    if (method === 'random') onChange(drawnAtRandom(value, field))
    else if (method === 'seeded') setSeeding({ order: value.order, from })
    else if (layoutPlaced(value.layout).length === 0 || !value.edited || window.confirm('Empty the bracket? The places you set are cleared.')) {
      onChange(clearedDraft(value))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fill the bracket">
          {DRAW_METHODS.map(m => (
            <button
              key={m.key}
              type="button"
              aria-pressed={value.method === m.key}
              onClick={e => choose(m.key, e.currentTarget.getBoundingClientRect())}
              className={chipClass(value.method === m.key)}
            >
              {m.key === 'random' && value.method === 'random' ? 'Draw again' : m.key === 'seeded' && value.method === 'seeded' ? 'Change the seeds' : m.label}
            </button>
          ))}
        </div>
        {hint && <p className="t-cap text-ink/65 mt-1.5">{hint}</p>}
      </div>

      {/* The lock and what the field's best spread is (Ross, 5 Nov 2026):
          locked, only the rounds it needs and the places a seeded draw's
          byes leave; unlocked, any place in any round, and the rounds
          changed by − and +. */}
      <div className={`p-3 ${cardClass('flat')} flex items-start gap-3`}>
        <button
          type="button"
          aria-pressed={!!value.locked}
          onClick={() => onChange(withLock(value, !value.locked, field))}
          className={`${chipClass(!!value.locked)} gap-1.5 flex-shrink-0`}
        >
          <PadlockIcon open={!value.locked} />
          {value.locked ? 'Locked' : 'Unlocked'}
        </button>
        <p className="t-cap text-ink/80 leading-snug self-center">
          {entryNote(field.length)}{' '}
          <span className="text-ink/65">
            {value.locked ? 'Unlock to put players anywhere, in any round.' : 'Lock to keep to that spread.'}
          </span>
        </p>
      </div>

      {!value.locked && (
        <div className="flex items-center justify-center gap-4">
          <RoundButton label="One round fewer" caption="Fewer" disabled={!mayChangeRounds(value, -1, field.length)}
            onClick={() => onChange(withRounds(value, -1, field.length))} plus={false} />
          <div className="text-center min-w-0" style={{ width: '9.5rem' }} aria-live="polite">
            <p className="text-ink text-[17px] font-semibold">{R} {R === 1 ? 'round' : 'rounds'}</p>
            <p className="t-cap text-ink/65">{2 ** R} places for {field.length} {field.length === 1 ? 'player' : 'players'}</p>
          </div>
          <RoundButton label="One round more" caption="More" disabled={!mayChangeRounds(value, 1, field.length)}
            onClick={() => onChange(withRounds(value, 1, field.length))} plus />
        </div>
      )}

      <BracketBoard
        draft={value}
        shape={shape}
        nameOf={nameOf}
        onPick={(r, c, from) => setPicking({ r, c, from })}
      />
      <p className="t-cap text-ink/65">
        {value.locked ? 'Tap a place to fill it.' : 'Tap a place to fill it. A player in a later round has byes to it.'}
      </p>

      {picking && (
        <Swell from={picking.from} label="Choose a player" closing={!!picking.closing} onClose={closePicker} onClosed={() => setPicking(null)}>
          <PlacePicker
            layout={value.layout}
            at={picking}
            entrants={entrants}
            nameOf={nameOf}
            seedOf={id => seedOf(value, id)}
            onPick={id => { onChange(placedInDraft(value, picking.r, picking.c, id, field.length)); closePicker() }}
            onCancel={closePicker}
          />
        </Swell>
      )}

      {seeding && (
        <Swell from={seeding.from} label="Seed the field" closing={!!seeding.closing} onClose={closeSeeds} onClosed={() => setSeeding(null)}>
          <SwellFrame
            title="Seed the field"
            onCancel={closeSeeds}
            footer={(
              <button type="button" onClick={() => { onChange(drawnBySeed(value, seeding.order)); closeSeeds() }} className={buttonClass('primary')}>
                Fill the bracket
              </button>
            )}
          >
            <p className="t-cap text-ink/65 mb-3">1 and 2 can only meet in the Final. The top seeds get any byes.</p>
            <SeedList entrants={entrants} order={seeding.order} onChange={order => setSeeding(s => (s ? { ...s, order } : s))} />
          </SwellFrame>
        </Swell>
      )}
    </div>
  )
}

// ─── The bracket ───────────────────────────────────────────────

const PLACE_W = 132
const PLACE_H = 38
const MATCH_GAP = 12
const COLUMN_GAP = 22
const HEAD_H = 26

/**
 * The bracket drawn whole, round by round left to right, scrolled sideways
 * inside its own box. Each match is a tile of two places; the lines join it
 * to the place its winner goes. A match under a player put in a later round
 * is not drawn — the space is the byes.
 */
function BracketBoard({ draft, shape, nameOf, onPick }: {
  draft: DrawDraft
  /** Locked to this spread, or null for the free bracket. */
  shape: BracketShape | null
  nameOf: (id: string) => string
  onPick: (r: number, c: number, from: DOMRect) => void
}) {
  const { layout } = draft
  const stateOf = (r: number, c: number) => (shape ? lockedState(layout, shape, r, c) : placeState(layout, r, c))
  const shown = (r: number, m: number) => (shape ? lockedMatchShown(layout, shape, r, m) : matchShown(layout, r, m))
  // Locked, the rounds after the ones with places in are only results — set
  // back, out of focus, the scroller's edge shaded (Ross: "a blur on the edges").
  const later = (r: number) => !!shape && r > lastEntryRound(shape)
  const faded = 'opacity-40 blur-[1px]'
  const R = layout.rounds
  const pitch = 2 * PLACE_H + MATCH_GAP
  const height = 2 ** (R - 1) * pitch
  const width = R * PLACE_W + (R - 1) * COLUMN_GAP
  const x = (r: number) => r * (PLACE_W + COLUMN_GAP)
  const row = (r: number) => height / 2 ** (R - 1 - r)
  const top = (r: number, m: number) => (m + 0.5) * row(r) - PLACE_H

  const lines: { d: string; later: boolean }[] = []
  for (let r = 0; r < R - 1; r++) {
    for (let m = 0; m < 2 ** (R - 1 - r); m++) {
      if (!shown(r, m)) continue
      const fromY = (m + 0.5) * row(r)
      const toY = top(r + 1, m >> 1) + (m % 2) * PLACE_H + PLACE_H / 2
      const mid = x(r) + PLACE_W + COLUMN_GAP / 2
      lines.push({ d: `M ${x(r) + PLACE_W} ${fromY} H ${mid} V ${toY} H ${x(r + 1)}`, later: later(r) })
    }
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto overscroll-x-contain pb-1" role="group" aria-label="The bracket">
        <div className="relative" style={{ width, height: height + HEAD_H }}>
          {Array.from({ length: R }, (_, r) => (
            <p key={r} className={`absolute top-0 t-cap text-ink/65 truncate ${later(r) ? faded : ''}`} style={{ left: x(r), width: PLACE_W }}>
              {roundName(2 ** (R - r))}
            </p>
          ))}
          <svg className="absolute left-0 text-line-strong pointer-events-none" style={{ top: HEAD_H }} width={width} height={height} aria-hidden="true">
            {lines.map((l, i) => <path key={i} d={l.d} fill="none" stroke="currentColor" strokeWidth={1.5} opacity={l.later ? 0.4 : 1} />)}
          </svg>
          {Array.from({ length: R }, (_, r) => Array.from({ length: 2 ** (R - 1 - r) }, (_, m) => shown(r, m) && (
            <div
              key={`${r}-${m}`}
              className={`absolute bg-surface border border-line rounded-tile overflow-hidden divide-y divide-line ${later(r) ? `${faded} pointer-events-none` : ''}`}
              style={{ left: x(r), top: HEAD_H + top(r, m), width: PLACE_W, height: 2 * PLACE_H }}
              aria-hidden={later(r) || undefined}
            >
              {[2 * m, 2 * m + 1].map(c => (
                <Place key={c} state={stateOf(r, c)} rounds={layout.rounds} r={r} c={c} nameOf={nameOf} seed={id => seedOf(draft, id)} onPick={onPick} />
              ))}
            </div>
          )))}
        </div>
      </div>
      {shape && R - 1 > lastEntryRound(shape) && (
        <div className="scroll-shade-r absolute top-0 right-0 bottom-0 w-10 pointer-events-none" aria-hidden="true" />
      )}
    </div>
  )
}

function Place({ state, rounds, r, c, nameOf, seed, onPick }: {
  state: ReturnType<typeof placeState>
  rounds: number
  r: number
  c: number
  nameOf: (id: string) => string
  seed: (id: string) => number | null
  onPick: (r: number, c: number, from: DOMRect) => void
}) {
  const round = roundName(2 ** (rounds - r))
  const cls = 'flex items-center gap-1.5 w-full px-2.5 text-left text-sm'
  const style = { height: PLACE_H - (c % 2 === 0 ? 1 : 0) }
  const tap = (e: React.MouseEvent<HTMLButtonElement>) => onPick(r, c, e.currentTarget.getBoundingClientRect())

  if (state.kind === 'player') {
    const n = seed(state.id)
    return (
      <button type="button" onClick={tap} style={style} className={`${cls} press hover:bg-tint`} aria-label={`${nameOf(state.id)}, ${round}. Change`}>
        {n !== null && <span className="t-cap text-ink/50 tabular-nums">{n}</span>}
        <span className="font-serif text-ink truncate">{nameOf(state.id)}</span>
      </button>
    )
  }
  if (state.kind === 'open') {
    return (
      <button type="button" onClick={tap} style={style} className={`${cls} press hover:bg-tint`}
        aria-label={`${state.bye ? 'A bye' : 'Empty'}, ${round}. Put a player in`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-accent-deep flex-shrink-0" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className={state.bye ? 'text-ink/50' : 'text-accent-deep font-medium'}>{state.bye ? 'Bye' : 'Add'}</span>
      </button>
    )
  }
  if (state.kind === 'through') {
    return (
      <div style={style} className={`${cls} bg-tint`} aria-label={`${nameOf(state.id)} reaches the ${round} on byes`}>
        <span className="font-serif text-ink/50 truncate">{nameOf(state.id)}</span>
      </div>
    )
  }
  return <div style={style} className={`${cls} bg-tint`} aria-label={`The winner of the match before, ${round}`} />
}

/** A padlock, shut or open. */
function PadlockIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
    </svg>
  )
}

/** The − and + beside the rounds, big enough to find (Ross, 5 Nov 2026), each named under it. */
function RoundButton({ label, caption, disabled, onClick, plus }: {
  label: string
  caption: string
  disabled: boolean
  onClick: () => void
  plus: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className="w-14 h-14 inline-flex items-center justify-center rounded-button press bg-surface border border-line-strong shadow-raised text-accent-deep disabled:bg-disabled-bg disabled:text-disabled-fg disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d={plus ? 'M12 5v14M5 12h14' : 'M5 12h14'} />
        </svg>
      </button>
      <span className={`t-cap ${disabled ? 'text-ink/50' : 'text-ink/80'}`} aria-hidden="true">{caption}</span>
    </div>
  )
}

// ─── Choosing who goes in a place ──────────────────────────────

/** A search box once the names outgrow a scroll (Ross, 5 Nov 2026). */
const SEARCH_FROM = 32

function PlacePicker({ layout, at, entrants, nameOf, seedOf: seedFor, onPick, onCancel }: {
  layout: BracketLayout
  at: { r: number; c: number }
  entrants: readonly DrawEntrant[]
  nameOf: (id: string) => string
  seedOf: (id: string) => number | null
  onPick: (id: string | null) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const here = layout.cells[at.r][at.c]
  const where = new Map<string, number>()
  layout.cells.forEach((row, r) => row.forEach(id => { if (id) where.set(id, r) }))
  const q = query.trim().toLowerCase()
  const shown = entrants.filter(e => e.id !== here && (!q || e.name.toLowerCase().includes(q)))
  const free = shown.filter(e => !where.has(e.id))
  const placed = shown.filter(e => where.has(e.id))
  const round = roundName(2 ** (layout.rounds - at.r))
  const describe = (e: DrawEntrant) => [
    seedFor(e.id) !== null ? `Seed ${seedFor(e.id)}` : null,
    e.handicap === null ? 'Handicap to come' : `Handicap ${formatHandicap(e.handicap)}`,
  ].filter(Boolean).join(' · ')

  return (
    <SwellFrame title={here ? `${nameOf(here)}'s place` : 'Who goes here?'} sub={round} onCancel={onCancel}>
      {entrants.length > SEARCH_FROM && (
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search the field"
          aria-label="Search the field"
          className={`${FIELD} mb-4`}
        />
      )}
      {here && (
        <button type="button" onClick={() => onPick(null)} className={`${buttonClass('secondary')} mb-5`}>
          Leave this place empty
        </button>
      )}
      {free.length > 0 && (
        <>
          <p className={FIELD_LABEL}>Not in the draw yet</p>
          <ListGroup className="mb-5">
            {free.map(e => <ListRow key={e.id} label={<span className="font-serif">{e.name}</span>} hint={describe(e)} onClick={() => onPick(e.id)} chevron={false} />)}
          </ListGroup>
        </>
      )}
      {placed.length > 0 && (
        <>
          <p className={FIELD_LABEL}>In the draw</p>
          <ListGroup>
            {placed.map(e => (
              <ListRow
                key={e.id}
                label={<span className="font-serif">{e.name}</span>}
                hint={`${roundName(2 ** (layout.rounds - (where.get(e.id) ?? 0)))} · ${here ? `swaps with ${nameOf(here)}` : 'moves here'}`}
                onClick={() => onPick(e.id)}
                chevron={false}
              />
            ))}
          </ListGroup>
        </>
      )}
      {free.length === 0 && placed.length === 0 && (
        <p className="text-ink/65 text-sm">{q ? 'Nobody in the field by that name.' : 'Everybody else is in the draw.'}</p>
      )}
    </SwellFrame>
  )
}

// ─── The swell ─────────────────────────────────────────────────

const SWELL_MS = 340

/**
 * A tapped place growing into the screen of names it opens (Ross, 5 Nov
 * 2026: "the cell swells into a background where the names are there to
 * scroll through") — the screen clipped to the place and opened out to the
 * whole of it on the putt curve, and back into it on the way out.
 * Under Reduce Motion it is simply there, and simply gone
 * (docs/style-guide.md §6, "Place swell").
 */
function Swell({ from, label, closing, onClose, onClosed, children }: {
  from: DOMRect
  label: string
  /** Set to go back into the place; `onClosed` once it has. */
  closing: boolean
  /** Asked for by Escape. */
  onClose: () => void
  onClosed: () => void
  children: React.ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  // Only ever opened by a tap, so always in a browser — said, for the portal.
  const inBrowser = useSyncExternalStore(() => () => {}, () => true, () => false)

  const clip = (t: number) => {
    const w = window.innerWidth
    const h = window.innerHeight
    const lerp = (a: number, b: number) => a + (b - a) * t
    return `inset(${lerp(from.top, 0)}px ${lerp(w - from.right, 0)}px ${lerp(h - from.bottom, 0)}px ${lerp(from.left, 0)}px round ${lerp(12, 0)}px)`
  }

  function run(forward: boolean, done?: () => void) {
    const el = panel.current
    cancelAnimationFrame(frame.current)
    if (!el || reducedMotion()) { if (el) el.style.clipPath = ''; done?.(); return }
    const start = performance.now()
    const step = (now: number) => {
      const x = Math.min(1, (now - start) / SWELL_MS)
      const t = forward ? putt(x) : 1 - putt(x)
      el.style.clipPath = clip(t)
      if (x < 1) frame.current = requestAnimationFrame(step)
      else { if (forward) el.style.clipPath = ''; done?.() }
    }
    el.style.clipPath = clip(forward ? 0 : 1)
    frame.current = requestAnimationFrame(step)
  }

  // Opened from the place it was tapped in, before the first paint (so it
  // never flashes whole); the page under it held still. Set here rather than
  // as a style, which a re-render with the window resized would re-apply.
  useLayoutEffect(() => {
    run(true)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; cancelAnimationFrame(frame.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (closing) run(false, onClosed) }, [closing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!inBrowser) return null
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 paper flex flex-col"
    >
      {children}
    </div>,
    document.body,
  )
}

/** The screen a swell opens: a close button and a title, what scrolls, a footer. */
function SwellFrame({ title, sub, onCancel, footer, children }: {
  title: string
  sub?: string
  onCancel: () => void
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-2 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
        <IconButton label="Close" onClick={onCancel}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        <div className="max-w-lg mx-auto">
          <p className="t-h1 text-ink">{title}</p>
          {sub && <p className="t-cap text-ink/65 mt-1 mb-4">{sub}</p>}
          {!sub && <div className="mb-4" />}
          {children}
        </div>
      </div>
      {footer && (
        <div className="px-4 pt-3 border-t border-line" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          <div className="max-w-lg mx-auto">{footer}</div>
        </div>
      )}
    </>
  )
}

// ─── Seeded ────────────────────────────────────────────────────

/** How long a dropped seed takes to settle into its gap — Tailwind's `duration-200` on the rows. */
const DRAG_SETTLE_MS = 200

function SeedList({ entrants, order, onChange }: {
  entrants: readonly DrawEntrant[]
  order: string[]
  onChange: (order: string[]) => void
}) {
  const byId = new Map(entrants.map(e => [e.id, e]))
  const rows = useRef<(HTMLLIElement | null)[]>([])
  // A row being dragged by its handle (lib/dragReorder.ts): it floats under
  // the finger, the rows between slide aside, and on letting go it settles
  // into the gap before the numbers change.
  const [drag, setDrag] = useState<(RowBoxes & { from: number; startY: number; dy: number; over: number; settling: boolean }) | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  function startDrag(i: number, ev: React.PointerEvent<HTMLButtonElement>) {
    if (drag) return
    ev.currentTarget.setPointerCapture(ev.pointerId)
    const boxes = order.map((_, k) => rows.current[k]?.getBoundingClientRect())
    setDrag({
      from: i, startY: ev.clientY, dy: 0, over: i, settling: false,
      tops: boxes.map(b => b?.top ?? 0), heights: boxes.map(b => b?.height ?? 0),
    })
  }
  function moveDrag(ev: React.PointerEvent<HTMLButtonElement>) {
    setDrag(d => {
      if (!d || d.settling) return d
      const dy = ev.clientY - d.startY
      return { ...d, dy, over: dropIndex(d, d.from, dy) }
    })
  }
  function endDrag() {
    if (!drag || drag.settling) return
    const { from, over } = drag
    const finish = () => {
      if (over !== from) onChange(moveToSeed(order, order[from], over + 1))
      setDrag(null)
    }
    if (reducedMotion()) { finish(); return }
    setDrag({ ...drag, settling: true, dy: settleOffset(drag, from, over) })
    settleTimer.current = setTimeout(finish, DRAG_SETTLE_MS)
  }

  // What is being typed into a number box, until it is left.
  const [typing, setTyping] = useState<{ id: string; text: string } | null>(null)

  function commitTyped() {
    if (!typing) return
    const n = Number(typing.text)
    if (typing.text && Number.isFinite(n) && n >= 1) onChange(moveToSeed(order, typing.id, n))
    setTyping(null)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button type="button" onClick={() => onChange(byHandicap(order.flatMap(id => byId.get(id) ?? [])).map(e => e.id))} className={chipClass(false)}>
          By handicap
        </button>
        <button type="button" onClick={() => onChange(shuffled(order))} className={chipClass(false)}>
          Shuffle
        </button>
        <button type="button" onClick={() => onChange(entrants.map(e => e.id))} className={chipClass(false)}>
          Order entered
        </button>
      </div>
      <p className="t-cap text-ink/65 mb-2">Type a number to move a player there, or drag the handle.</p>
      <ol className={`${cardClass()} divide-y divide-line`} aria-label="Seeds">
        {order.map((id, i) => {
          const e = byId.get(id)
          const lifted = drag?.from === i
          // The dragged row follows the finger with no lag, and eases only
          // as it settles; the others ease aside. No transition at all at
          // rest, so the reorder itself lands without a jump.
          const offset = !drag ? 0 : lifted ? drag.dy : makeRoom(drag, drag.from, drag.over, i)
          const eased = !!drag && (!lifted || drag.settling)
          return (
            <li
              key={id}
              ref={el => { rows.current[i] = el }}
              className={`flex items-center gap-3 px-3 py-2 ${eased ? 'transition-transform duration-200 ease-putt motion-reduce:transition-none' : ''} ${
                lifted ? 'relative z-10 bg-surface rounded-tile shadow-floating' : ''}`}
              style={offset || lifted ? { transform: `translateY(${offset}px)${lifted ? ' scale(1.02)' : ''}` } : undefined}
            >
              <input
                type="text"
                inputMode="numeric"
                aria-label={`Seed for ${e?.name ?? 'player'}`}
                value={typing?.id === id ? typing.text : String(i + 1)}
                onFocus={ev => { setTyping({ id, text: '' }); ev.currentTarget.select() }}
                onChange={ev => setTyping({ id, text: ev.target.value.replace(/\D/g, '').slice(0, 2) })}
                onBlur={commitTyped}
                onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur() }}
                className={`${FIELD} field-dense text-center tabular-nums`}
                style={{ width: '3.5rem' }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink truncate">{e?.name ?? 'A player'}</span>
                <span className="block t-cap text-ink/65">{e?.handicap == null ? 'Handicap to come' : `Handicap ${formatHandicap(e.handicap)}`}</span>
              </span>
              <button
                type="button"
                aria-label={`Drag ${e?.name ?? 'player'} to a new seed`}
                className="w-11 h-11 flex items-center justify-center text-ink/50 cursor-grab"
                style={{ touchAction: 'none' }}
                onPointerDown={ev => startDrag(i, ev)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => { if (!drag?.settling) setDrag(null) }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 8h16M4 16h16" />
                </svg>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── When ──────────────────────────────────────────────────────

export type DrawTimingValue = { when: DrawWhen; on: string; at: string; seeding: AutoSeeding }

/** A draw that is built on screen now: drawn now, or pre-made for its date. */
export const buildsNow = (t: Pick<DrawTimingValue, 'when' | 'seeding'>) =>
  t.when === 'now' || (t.when === 'date' && t.seeding === 'premade')

/**
 * When the draw is made (Ross, 5 Nov 2026) — **Draw now**, from the current
 * field; **Draw later**, leaving time for more players to enter; or **Set
 * date**, a day and the time it goes live, pre-made now or allocated then
 * from whoever has joined. `now` is offered only where there is a field to
 * draw from; `later` and a date only where nothing is drawn yet.
 */
export function DrawTiming({ value, onChange, allowNow = true, allowLater = true, allowOrder = false, min }: {
  value: DrawTimingValue
  onChange: (next: DrawTimingValue) => void
  allowNow?: boolean
  allowLater?: boolean
  /** "My order" is offered when a seeded order has been set. */
  allowOrder?: boolean
  min?: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="When the draw is made">
        {DRAW_TIMINGS.filter(t => (allowNow || t.key !== 'now') && (allowLater || t.key === 'now')).map(t => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={value.when === t.key}
            onClick={() => onChange({ ...value, when: t.key })}
            className={optionClass(value.when === t.key)}
          >
            <span className="block text-sm font-medium text-ink">{t.label}</span>
            <span className="block t-cap text-ink/65">{t.hint}</span>
          </button>
        ))}
      </div>
      {value.when === 'date' && (
        <div className="space-y-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <DateField label="The day of the draw" value={value.on} onChange={on => onChange({ ...value, on })} min={min} />
            <div className="min-w-0">
              <label className={FIELD_LABEL} htmlFor="draw-live-at">Goes live at</label>
              <input
                id="draw-live-at"
                type="time"
                value={value.at}
                onChange={e => onChange({ ...value, at: e.target.value })}
                className={`${FIELD} min-w-0 max-w-full`}
              />
            </div>
          </div>
          <p className="t-cap text-ink/65 -mt-1">Irish time. The event&apos;s home screen counts down to it.</p>
          <div>
            <p className={FIELD_LABEL}>How it is drawn</p>
            <div className="flex flex-wrap gap-1.5">
              {AUTO_SEEDINGS.filter(s => allowOrder || s.key !== 'order').map(s => (
                <button key={s.key} type="button" onClick={() => onChange({ ...value, seeding: s.key })}
                  aria-pressed={value.seeding === s.key} className={chipClass(value.seeding === s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="t-cap text-ink/65 mt-1.5">{AUTO_SEEDINGS.find(s => s.key === value.seeding)?.hint}</p>
          </div>
        </div>
      )}
    </div>
  )
}
