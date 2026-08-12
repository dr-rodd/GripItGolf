'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  tileTop, tileCenter, columnX, columnHeight,
  connectorPath, roundHeaderLabel, clampPosition, easeOut, centringShift,
} from '@/lib/bracketLayout'
import { isDecidable, pressOutcome } from '@/lib/matchplayProgress'
import { type MatchReading, pendingResults } from '@/lib/matchResults'
import { decisionLabel } from '@/lib/matchDecision'

// ─── Types ─────────────────────────────────────────────────────

export type BracketMatchRow = {
  id: string
  /** Carried so a recorded result can be written straight back. */
  trip_id: string
  round_number: number
  round_name: string
  slot: number
  player_a_id: string | null
  player_b_id: string | null
  player_a_is_bye: boolean
  player_b_is_bye: boolean
  seed_a: number | null
  seed_b: number | null
  winner_player_id: string | null
  /** Margin the match finished by, e.g. "3&2". Never set on a bye. */
  result: string | null
  next_match_id: string | null
  next_slot: 'A' | 'B' | null
}

/**
 * One side of a match: a player in a singles draw, a pairing in a pairs one.
 *
 * The names are worked out before they get here — see lib/matchplayEntrants.ts
 * — so this file draws whoever it is handed without caring which. A pairing
 * arrives already carrying its two players' names rather than a team name,
 * because a pairing IS its players and "Team B" tells nobody anything.
 */
export type BracketEntrantRow = {
  id: string
  name: string
  /** What fits on a tile. "Ross" for a player, "Ross & Dave" for a pairing. */
  shortName: string
  handicap: number | null
}

// ─── Fixed dimensions ──────────────────────────────────────────
// Tiles never resize. Only the gap between columns flexes, so the pair still
// fits a narrow phone without shrinking the text.

const TILE_W = 158
const TILE_H = 76          // two 38px rows — comfortably readable on the course
const PITCH  = 98          // standard vertical spacing, left column
const MIN_GAP = 30         // smallest gap between the two columns
const SWIPE_MS = 340

// ─── Component ─────────────────────────────────────────────────

export default function MatchplayBracket({
  matches: initialMatches, entrants, readings = [],
}: {
  matches: BracketMatchRow[]
  entrants: BracketEntrantRow[]
  /**
   * What the cards say, for every match whose bracket round is linked to a
   * round of golf. Empty for a draw decided by hand — which is every draw
   * that has not been linked, and every draw made before linking existed.
   */
  readings?: MatchReading[]
}) {
  // Held locally so a recorded result shows immediately, then reverted if the
  // write fails — the bracket must never show something the database rejected.
  const [matches, setMatches] = useState(initialMatches)
  useEffect(() => { setMatches(initialMatches) }, [initialMatches])

  const [sheet, setSheet] = useState<{ match: BracketMatchRow; correcting: boolean } | null>(null)

  const readingFor = useMemo(
    () => new Map(readings.map(r => [r.matchId, r])),
    [readings]
  )

  /**
   * Results the cards have settled, written the first time anyone opens the
   * bracket after the cards were signed.
   *
   * **Here rather than in the page's own render.** Looking at a draw must not
   * change it — a server component that wrote on every view would rewrite the
   * bracket for anybody who merely glanced at it, including a search engine.
   * So the write is a deliberate act by the browser, once, on arrival.
   *
   * Only ever fills an empty match: `pendingResults` drops anything already
   * carrying a winner, so a correction typed in by hand is never overwritten
   * by the cards, and reopening the page is a no-op rather than a second
   * write. That is also why this can run without asking — there is nothing it
   * can undo.
   *
   * A failure is deliberately silent. The bracket is still perfectly usable
   * by hand, and an error banner over a draw nobody asked to have decided for
   * them would be worse than the next visit quietly trying again.
   */
  const applied = useRef(false)
  useEffect(() => {
    if (applied.current || readings.length === 0) return
    const pending = pendingResults(matches as never, readingFor)
    if (pending.length === 0) return
    applied.current = true
    let live = true
    void (async () => {
      try {
        const { persistSettled } = await import('@/lib/matchplayStore')
        const saved = await persistSettled(matches as never, pending)
        if (live) setMatches(saved as never)
      } catch {
        // Left to the next visit — see above
        applied.current = false
      }
    })()
    return () => { live = false }
  }, [matches, readingFor, readings.length])

  const playerById = useMemo(
    () => new Map(entrants.map(e => [e.id, e])),
    [entrants]
  )

  /** Matches grouped by round, in playing order. */
  const rounds = useMemo(() => {
    const numbers = [...new Set(matches.map(m => m.round_number))].sort((a, b) => a - b)
    return numbers.map(n =>
      matches.filter(m => m.round_number === n).sort((a, b) => a.slot - b.slot)
    )
  }, [matches])

  const roundNames = useMemo(
    () => rounds.map(r => r[0]?.round_name ?? ''),
    [rounds]
  )

  // `position` is continuous: 2.0 means round 3 is the left column, 2.5 is
  // halfway through a swipe. Every coordinate on screen derives from it, which
  // is what keeps the connectors welded to the tiles while it moves.
  const [position, setPosition] = useState(0)
  const [width, setWidth] = useState(360)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number | null>(null)
  const dragRef = useRef<{ x: number; from: number; active: boolean } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current) }, [])

  const stride = Math.max(TILE_W + MIN_GAP, width - TILE_W)

  const animateTo = useCallback((target: number) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const from = position
    const to = clampPosition(target, rounds.length)
    if (Math.abs(to - from) < 0.001) { setPosition(to); return }
    const started = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / SWIPE_MS)
      setPosition(from + (to - from) * easeOut(t))
      if (t < 1) animRef.current = requestAnimationFrame(step)
      else animRef.current = null
    }
    animRef.current = requestAnimationFrame(step)
  }, [position, rounds.length])

  // ── Dragging ────────────────────────────────────────────────

  const onDragStart = (x: number) => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
    dragRef.current = { x, from: position, active: true }
  }
  const onDragMove = (x: number) => {
    const d = dragRef.current
    if (!d?.active) return
    // Dragging left (negative delta) advances to later rounds
    setPosition(clampPosition(d.from - (x - d.x) / stride, rounds.length))
  }
  const onDragEnd = (x: number) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d?.active) return
    const moved = (d.x - x) / stride
    // A decisive flick counts even if it did not travel far
    const target = Math.abs(moved) > 0.22
      ? d.from + Math.sign(moved)
      : Math.round(position)
    animateTo(target)
  }

  if (rounds.length === 0) return null

  const leftIndex = Math.round(position)
  const header = roundHeaderLabel(roundNames, leftIndex)
  // Every match in a bracket round shares one link, so the first that has a
  // reading names the method for the whole column.
  const leftMethod = rounds[leftIndex]
    ?.map(m => readingFor.get(m.id)?.link.decidedBy)
    .find(Boolean)
  const methodLabel = leftMethod ? decisionLabel(leftMethod) : null

  // Columns worth rendering: the visible pair plus one either side, so a
  // swipe has something to bring in. Anything further out is clipped away.
  const first = Math.max(0, Math.floor(position) - 1)
  const last  = Math.min(rounds.length - 1, Math.ceil(position) + 2)
  const visible: number[] = []
  for (let i = first; i <= last; i++) visible.push(i)

  // Height follows the tallest thing on screen so the page does not jump
  const viewHeight = Math.max(
    ...visible.map(i => columnHeight(rounds[i].length, i - position, PITCH, TILE_H)),
    TILE_H
  )

  const atStart = position <= 0.001
  const atEnd   = position >= rounds.length - 1.001

  // The Final has nothing to its right, so the view slides across to sit it in
  // the middle rather than leaving it against the left edge. Added to every x
  // on screen — tiles and connectors alike — so they cannot drift apart.
  const shift = centringShift({
    position, roundCount: rounds.length, width, tileWidth: TILE_W,
  })

  // ── Connectors ──────────────────────────────────────────────
  // Recomputed from `position` every frame, exactly like the tiles.

  const connectors: { key: string; d: string; dim: boolean }[] = []
  for (const roundIndex of visible) {
    const nextRound = rounds[roundIndex + 1]
    if (!nextRound) continue
    const slot = roundIndex - position
    const feederX = columnX(slot, stride) + shift + TILE_W
    const targetX = columnX(slot + 1, stride) + shift
    // Only draw for the pair on screen; further out it is clipped anyway
    if (slot < -1.2 || slot > 1.2) continue

    nextRound.forEach((target, j) => {
      const a = rounds[roundIndex][2 * j]
      const b = rounds[roundIndex][2 * j + 1]
      if (!a || !b) return
      connectors.push({
        key: `${target.id}-conn`,
        d: connectorPath({
          feederRightX: feederX,
          feederTopY:    tileCenter(2 * j,     slot, PITCH, TILE_H),
          feederBottomY: tileCenter(2 * j + 1, slot, PITCH, TILE_H),
          targetLeftX: targetX,
          targetY: tileCenter(j, slot + 1, PITCH, TILE_H),
        }),
        dim: slot < -0.05,
      })
    })
  }

  return (
    <div className="select-none">

      {/* Round header — updates as you swipe */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <button
          onClick={() => animateTo(leftIndex - 1)}
          disabled={atStart}
          aria-label="Previous round"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl border border-bark/12 bg-surface text-ink/80 disabled:opacity-25 enabled:hover:text-ink enabled:hover:border-bark/25 enabled:hover:bg-surface transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="min-w-0 text-center">
          <p className="font-[family-name:var(--font-display)] text-ink text-base sm:text-lg leading-tight truncate">
            {header}
          </p>
          {/* Says the link is doing something, on the one screen where it is
              not otherwise visible that the winners are coming off cards. */}
          {leftMethod && (
            <p className="text-ink/65 text-[13px] leading-tight truncate mt-0.5">
              {methodLabel}
            </p>
          )}
        </div>

        <button
          onClick={() => animateTo(leftIndex + 1)}
          disabled={atEnd}
          aria-label="Next round"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl border border-bark/12 bg-surface text-ink/80 disabled:opacity-25 enabled:hover:text-ink enabled:hover:border-bark/25 enabled:hover:bg-surface transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* The bracket itself */}
      <div
        ref={containerRef}
        className="relative overflow-hidden touch-pan-y"
        style={{ height: viewHeight }}
        onTouchStart={e => onDragStart(e.touches[0].clientX)}
        onTouchMove={e => onDragMove(e.touches[0].clientX)}
        onTouchEnd={e => onDragEnd(e.changedTouches[0].clientX)}
        onMouseDown={e => onDragStart(e.clientX)}
        onMouseMove={e => dragRef.current?.active && onDragMove(e.clientX)}
        onMouseUp={e => onDragEnd(e.clientX)}
        onMouseLeave={e => dragRef.current?.active && onDragEnd(e.clientX)}
      >
        {/* Connectors sit behind the tiles, drawn from the same numbers */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height={viewHeight}
          aria-hidden="true"
        >
          {connectors.map(c => (
            <path
              key={c.key}
              d={c.d}
              fill="none"
              stroke="rgba(74,55,40,0.18)"
              strokeWidth={1.5}
              opacity={c.dim ? 0.3 : 1}
            />
          ))}
        </svg>

        {visible.map(roundIndex => {
          const slot = roundIndex - position
          const x = columnX(slot, stride) + shift
          return rounds[roundIndex].map((match, j) => (
            <MatchTile
              key={match.id}
              match={match}
              reading={readingFor.get(match.id) ?? null}
              playerById={playerById}
              x={x}
              y={tileTop(j, slot, PITCH)}
              faded={slot < -0.05 || slot > 1.05}
              onOpen={correcting => setSheet({ match, correcting })}
            />
          ))
        })}

      </div>

      {/* Round position */}
      <div className="flex items-center justify-center gap-1.5 mt-5">
        {rounds.map((_, i) => (
          <button
            key={i}
            onClick={() => animateTo(i)}
            aria-label={`Go to ${roundNames[i]}`}
            className={`h-1 rounded-full transition-all ${
              i === leftIndex ? 'w-6 bg-accent' : 'w-1.5 bg-bark/[0.08] hover:bg-bark/25'
            }`}
          />
        ))}
      </div>

      <p className="text-ink/50 text-[13px] text-center mt-4">
        Swipe to move between rounds · hold a finished match to change it
      </p>

      {sheet && (
        <DecideSheet
          match={sheet.match}
          correcting={sheet.correcting}
          playerById={playerById}
          onClose={() => setSheet(null)}
          onApply={async (winnerId: string | null, margin) => {
            const before = matches
            // Imported here rather than at the top so the Supabase client is
            // only constructed when someone actually records a result — it
            // keeps this module renderable without an environment, which is
            // what lets the bracket be tested headlessly.
            const { persistWinner } = await import('@/lib/matchplayStore')
            try {
              // Show it straight away, undo it if the write is refused
              const saved = await persistWinner(
                matches as never, sheet.match.id, winnerId, margin
              )
              setMatches(saved as never)
              setSheet(null)
            } catch (err) {
              setMatches(before)
              throw err
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Tile ──────────────────────────────────────────────────────

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 10   // px of travel before a press counts as a swipe

/**
 * The line under a tile, where the cards have something to say.
 *
 * It lives in the gap between the tile and the one below it — PITCH is 98 and
 * a tile is 76, so there are 22 pixels there that were doing nothing. Which
 * is the whole reason it is a caption rather than a third row inside the
 * tile: the tile is two 37px rows and a rule, and it is that size because two
 * names and two figures is what fits on a phone.
 *
 * Says one thing at a time, in this order of importance:
 *
 *   · the cards and the bracket disagree — somebody edited a card after the
 *     match was recorded, and nothing here will resolve that quietly
 *   · all square with the round over — the cards did not produce a winner and
 *     a knockout needs one, so it is waiting on a person
 *   · a match in play — how it stands right now
 *
 * A finished match says nothing: the margin is already on the winner's row
 * inside the tile, and repeating it under would be the same fact twice.
 */
function TileNote({ reading, decided }: { reading: MatchReading | null; decided: boolean }) {
  if (!reading) return null
  const { state } = reading

  const note = reading.disagrees ? { text: 'Cards disagree', tone: 'text-rust-deep' }
    : state.settled && state.halved && !decided ? { text: 'All square', tone: 'text-ink/80' }
    : !decided && !state.settled && state.holesPlayed > 0
      ? { text: state.progress, tone: 'text-accent-deep' }
      : null
  if (!note) return null

  return (
    <p className={`text-[13px] leading-none truncate text-center mt-1 ${note.tone}`}>
      {note.text}
    </p>
  )
}

function MatchTile({
  match, reading, playerById, x, y, faded, onOpen,
}: {
  match: BracketMatchRow
  /** What the cards say, where this bracket round is linked to a round. */
  reading: MatchReading | null
  playerById: Map<string, BracketEntrantRow>
  x: number
  y: number
  faded: boolean
  onOpen: (correcting: boolean) => void
}) {
  // A bye has a winner but was never played, so it is not a "won" match
  const isBye   = match.player_a_is_bye || match.player_b_is_bye
  const decided = !!match.winner_player_id && !isBye
  // Winning the Final is winning the whole thing — gold rather than the green
  // an ordinary win gets, and a glow so it reads as the end of the bracket.
  const isChampion = decided && !match.next_match_id
  // Byes are genuinely inert: there is no decision to make, so no handler is
  // attached at all rather than a handler that declines to act.
  const interactive = isDecidable(match)

  const press = useRef<{ x: number; y: number; at: number; moved: boolean; fired: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 'holding' shrinks the tile so a press is visibly registering; 'popped'
  // springs it back out when the hold completes, so the gesture confirms itself
  // without needing a message.
  const [feedback, setFeedback] = useState<'idle' | 'holding' | 'popped'>('idle')

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  const pop = () => {
    setFeedback('popped')
    if (popTimer.current) clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setFeedback('idle'), 220)
  }
  useEffect(() => () => {
    clearTimer()
    if (popTimer.current) clearTimeout(popTimer.current)
  }, [])

  const handlers = interactive ? {
    onPointerDown: (e: React.PointerEvent) => {
      press.current = { x: e.clientX, y: e.clientY, at: Date.now(), moved: false, fired: false }
      clearTimer()
      setFeedback('holding')
      // Holding reopens a finished match. Only a decided one can be corrected.
      if (decided) {
        timer.current = setTimeout(() => {
          if (press.current && !press.current.moved) {
            press.current.fired = true
            pop()
            onOpen(true)
          }
        }, LONG_PRESS_MS)
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current
      if (!p) return
      if (Math.abs(e.clientX - p.x) > MOVE_TOLERANCE ||
          Math.abs(e.clientY - p.y) > MOVE_TOLERANCE) {
        p.moved = true          // this is a swipe or a scroll, not a tap
        clearTimer()
        setFeedback('idle')
      }
    },
    onPointerUp: () => {
      const p = press.current
      press.current = null
      clearTimer()
      if (!p || p.fired) return          // the hold already opened it
      if (p.moved) { setFeedback('idle'); return }
      pop()
      const outcome = pressOutcome({
        decidable: interactive,
        decided,
        moved: p.moved,
        heldMs: Date.now() - p.at,
        longPressMs: LONG_PRESS_MS,
      })
      if (outcome === 'decide') onOpen(false)
      else if (outcome === 'correct') onOpen(true)
    },
    onPointerCancel: () => { press.current = null; clearTimer(); setFeedback('idle') },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  } : {}

  const scale = feedback === 'holding' ? 0.94 : feedback === 'popped' ? 1.06 : 1

  return (
    <div
      {...handlers}
      // The outer element is positioned with left/top and never transformed:
      // a transformed child inside an overflow-hidden parent breaks tap
      // hit-testing on iOS Safari until the first scroll. The scale lives on
      // the inner wrapper, so the hit area stays exactly where it is.
      className={interactive ? 'absolute cursor-pointer' : 'absolute'}
      style={{
        left: x,
        top: y,
        width: TILE_W,
        // Not `height: TILE_H` — the note below the tile lives inside this
        // wrapper and a fixed height would put it outside the tap target it
        // belongs to. The box below still holds the tile's own height.
        opacity: faded ? 0.25 : 1,
        touchAction: 'none',
      }}
    >
      <div
        className={`relative w-full rounded-lg border overflow-hidden ${
          isChampion
            ? 'border-accent bg-accent'
            : decided
              ? 'border-accent/50 bg-accent/[0.07]'
              : 'border-bark/12 bg-surface'
        }`}
        style={{
          height: TILE_H,
          transform: `scale(${scale})`,
          transition: feedback === 'holding'
            ? 'transform 160ms ease-out'
            : 'transform 180ms ease-out',
          // The champion is marked by the solid fill above, not by a glow:
          // the guide has none, and on cream a glow reads as a smudge.
        }}
      >
        <Side
          playerId={match.player_a_id}
          isBye={match.player_a_is_bye}
          seed={match.seed_a}
          isWinner={decided && match.winner_player_id === match.player_a_id}
          isChampion={isChampion && match.winner_player_id === match.player_a_id}
          result={match.result}
          playerById={playerById}
        />
        <div className={`h-px ${isChampion ? 'bg-accent/30' : 'bg-bark/12'}`} />
        <Side
          playerId={match.player_b_id}
          isBye={match.player_b_is_bye}
          seed={match.seed_b}
          isWinner={decided && match.winner_player_id === match.player_b_id}
          isChampion={isChampion && match.winner_player_id === match.player_b_id}
          result={match.result}
          playerById={playerById}
        />

        {/* Fills over the hold so it is clear the press is doing something
            and roughly how much longer to keep holding. Only on a decided
            tile, since that is the only place holding does anything. */}
        {decided && feedback === 'holding' && (
          <span
            data-hold-progress
            className="absolute left-0 bottom-0 h-[2px] bg-accent"
            style={{
              width: '100%',
              transformOrigin: 'left',
              animation: `holdFill ${LONG_PRESS_MS}ms linear forwards`,
            }}
          />
        )}
      </div>

      <TileNote reading={reading} decided={decided} />

      <style>{`
        @keyframes holdFill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>
    </div>
  )
}

function Side({
  playerId, isBye, seed, isWinner, isChampion, result, playerById,
}: {
  playerId: string | null
  isBye: boolean
  seed: number | null
  isWinner: boolean
  isChampion: boolean
  result: string | null
  playerById: Map<string, BracketEntrantRow>
}) {
  const player = playerId ? playerById.get(playerId) : null
  // Worked out upstream: a first name for a player, both first names for a
  // pairing. Splitting it here would turn "Ross & Dave" back into "Ross".
  const shortName = player ? player.shortName : ''

  return (
    <div
      className={`h-[37px] flex items-center gap-1.5 pl-1.5 pr-2 ${
        isChampion ? '' : isWinner ? 'bg-accent/[0.07]' : ''
      }`}
    >
      {/* Green edge marks the winner at a glance, before you read anything */}
      <span
        className={`w-[3px] h-6 rounded-full flex-shrink-0 ${
          isChampion ? 'bg-white' : isWinner ? 'bg-accent' : 'bg-transparent'
        }`}
      />

      <span className="w-3 flex-shrink-0 text-[12px] tabular-nums text-ink/50 text-right">
        {isBye ? '' : seed ?? ''}
      </span>

      {isBye ? (
        <span className="flex-1 text-[12px] tracking-[0.15em] uppercase text-ink/50">
          Bye
        </span>
      ) : player ? (
        <>
          <span
            className={`flex-1 min-w-0 truncate text-sm leading-none ${
              isChampion ? 'text-white font-semibold'
                : isWinner ? 'text-accent-deep font-semibold'
                : 'text-ink/80'
            }`}
          >
            {shortName}
          </span>

          {/* The margin replaces the handicap once a match is won — by then
              the score is the thing worth knowing */}
          {isWinner && result ? (
            <span className={`flex-shrink-0 text-[12px] font-semibold tabular-nums ${
              isChampion ? 'text-white' : 'text-accent-deep'
            }`}>
              {result}
            </span>
          ) : (
            <span className="flex-shrink-0 text-[12px] tabular-nums text-ink/65">
              {player.handicap ?? '—'}
            </span>
          )}
        </>
      ) : (
        <span className="flex-1 text-[12px] text-ink/50 italic">To be decided</span>
      )}
    </div>
  )
}

// ─── Decide / correct sheet ────────────────────────────────────

function DecideSheet({
  match, correcting, playerById, onClose, onApply,
}: {
  match: BracketMatchRow
  correcting: boolean
  playerById: Map<string, BracketEntrantRow>
  onClose: () => void
  onApply: (winnerId: string | null, margin: string | null) => Promise<void>
}) {
  const [margin, setMargin]   = useState(match.result ?? '')
  // Starts on whoever currently holds it, so opening the sheet and changing
  // only the margin works. Tapping that player again clears the selection,
  // which is how a match goes back to unplayed.
  const [picked, setPicked]   = useState<string | null>(match.winner_player_id)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const sides = [
    { id: match.player_a_id, seed: match.seed_a },
    { id: match.player_b_id, seed: match.seed_b },
  ].filter(s => !!s.id) as { id: string; seed: number | null }[]

  async function apply(winnerId: string | null) {
    setSaving(true)
    setError('')
    try {
      // A voided match keeps no margin — it describes a result that no
      // longer exists.
      await onApply(winnerId, winnerId ? margin.trim() || null : null)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const voiding = correcting && picked === null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/50 page-enter" />
      <div
        className="relative bg-cream border-t border-bark/12 rounded-t-2xl px-5 pt-5 sheet-up"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <p className="text-ink/65 text-[12px] tracking-[0.25em] uppercase">
              {match.round_name}
            </p>
            <p className="font-[family-name:var(--font-display)] text-ink text-xl leading-tight mt-0.5">
              {correcting ? 'Change the winner' : 'Who won?'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center text-ink/65 hover:text-ink transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        {/* Deliberately blunt. No count and no list of which matches — the
            point is to make someone stop, not to invite them to weigh it up. */}
        {correcting && (
          <div className="mt-3 mb-4 px-4 py-4 bg-rust/15 border-2 border-rust/60 rounded-xl">
            <div className="flex items-start gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round"
                   className="text-rust-deep flex-shrink-0 mt-0.5" aria-hidden="true">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              <div className="min-w-0">
                <p className="text-rust-deep text-base font-bold leading-snug">
                  This will void all subsequent results.
                </p>
                <p className="text-rust/70 text-[13px] leading-snug mt-1.5">
                  All subsequent results will need to be entered again.
                </p>
              </div>
            </div>
          </div>
        )}

        {!voiding && (
          <>
            <label className="block text-ink/65 text-[12px] tracking-[0.2em] uppercase mt-4 mb-2">
              Margin — optional
            </label>
            <input
              value={margin}
              onChange={e => setMargin(e.target.value)}
              placeholder="e.g. 3&2"
              maxLength={12}
              className="w-full bg-surface border border-bark/12 rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/50 focus:outline-none focus:border-accent/50 transition-colors mb-4"
            />
          </>
        )}

        <div className="flex flex-col gap-2.5">
          {sides.map(side => {
            const player = playerById.get(side.id)
            const isCurrent = match.winner_player_id === side.id
            const isPicked  = picked === side.id
            return (
              <button
                key={side.id}
                disabled={saving}
                onClick={() => correcting
                  // Tapping the selected player again lets go of them, which
                  // is how you say "this match was not played after all"
                  ? setPicked(prev => prev === side.id ? null : side.id)
                  : apply(side.id)}
                className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl border transition-colors disabled:opacity-40 ${
                  isPicked
                    ? 'border-accent bg-accent/15'
                    : 'border-bark/12 bg-surface hover:border-bark/25'
                }`}
              >
                <span className="w-5 text-ink/50 text-[13px] tabular-nums text-right flex-shrink-0">
                  {side.seed ?? ''}
                </span>
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-ink text-base truncate">
                    {player?.name ?? 'Unknown player'}
                  </span>
                  {isCurrent && (
                    <span className="block text-ink/65 text-[12px] tracking-wider uppercase mt-0.5">
                      {isPicked ? 'Winner — tap to unplay' : 'Was the winner'}
                    </span>
                  )}
                </span>
                <span className="text-ink/65 text-sm tabular-nums flex-shrink-0">
                  {player?.handicap ?? '—'}
                </span>
              </button>
            )
          })}
        </div>

        {/* A correction is applied only after an explicit confirmation */}
        {correcting && (
          <>
            {voiding && (
              <p className="text-ink/65 text-[13px] leading-snug mt-4 text-center">
                Nobody selected — this match goes back to unplayed.
              </p>
            )}
            <button
              onClick={() => apply(picked)}
              disabled={saving}
              className="w-full mt-4 py-4 bg-rust-deep text-[#1a0f0a] rounded-xl text-sm font-bold tracking-[0.15em] uppercase hover:bg-rust-deep transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </>
        )}

        {error && <p className="text-rust-deep text-sm mt-3 leading-snug">{error}</p>}
      </div>
    </div>
  )
}
