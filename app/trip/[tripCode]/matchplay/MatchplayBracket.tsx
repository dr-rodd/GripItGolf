'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  tileTop, tileCenter, columnX, columnHeight,
  connectorPath, roundHeaderLabel, clampPosition, easeOut,
} from '@/lib/bracketLayout'

// ─── Types ─────────────────────────────────────────────────────

export type BracketMatchRow = {
  id: string
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
}

export type BracketPlayerRow = { id: string; name: string; handicap: number | null }

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
  matches, players,
}: {
  matches: BracketMatchRow[]
  players: BracketPlayerRow[]
}) {
  const playerById = useMemo(
    () => new Map(players.map(p => [p.id, p])),
    [players]
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

  // ── Connectors ──────────────────────────────────────────────
  // Recomputed from `position` every frame, exactly like the tiles.

  const connectors: { key: string; d: string; dim: boolean }[] = []
  for (const roundIndex of visible) {
    const nextRound = rounds[roundIndex + 1]
    if (!nextRound) continue
    const slot = roundIndex - position
    const feederX = columnX(slot, stride) + TILE_W
    const targetX = columnX(slot + 1, stride)
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
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-sm border border-[#1e3d28] text-white/50 disabled:opacity-25 enabled:hover:text-white enabled:hover:border-[#C9A84C]/40 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <p className="font-[family-name:var(--font-playfair)] text-white text-base sm:text-lg text-center leading-tight min-w-0 truncate">
          {header}
        </p>

        <button
          onClick={() => animateTo(leftIndex + 1)}
          disabled={atEnd}
          aria-label="Next round"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-sm border border-[#1e3d28] text-white/50 disabled:opacity-25 enabled:hover:text-white enabled:hover:border-[#C9A84C]/40 transition-colors"
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
              stroke="#1e3d28"
              strokeWidth={1.5}
              opacity={c.dim ? 0.3 : 1}
            />
          ))}
        </svg>

        {visible.map(roundIndex => {
          const slot = roundIndex - position
          const x = columnX(slot, stride)
          return rounds[roundIndex].map((match, j) => (
            <MatchTile
              key={match.id}
              match={match}
              playerById={playerById}
              x={x}
              y={tileTop(j, slot, PITCH)}
              faded={slot < -0.05 || slot > 1.05}
            />
          ))
        })}

        {/* Past the Final there is no next round. A plain gold box, level with
            the Final itself — it is a destination, not another match, so it
            does not take the half-pitch offset a real column would. */}
        {(() => {
          const slot = rounds.length - position
          if (slot > 2.2) return null
          const finalTop = tileTop(0, slot - 1, PITCH)
          return (
            <div
              className="absolute flex flex-col items-center justify-center rounded-sm border border-[#C9A84C] bg-[#C9A84C]/15"
              style={{
                left: columnX(slot, stride),
                top: finalTop,
                width: TILE_W,
                height: TILE_H,
                opacity: slot > 1.05 ? 0.25 : 1,
              }}
            >
              <span className="text-[#C9A84C] text-[10px] tracking-[0.25em] uppercase">Winner</span>
            </div>
          )
        })()}
      </div>

      {/* Round position */}
      <div className="flex items-center justify-center gap-1.5 mt-5">
        {rounds.map((_, i) => (
          <button
            key={i}
            onClick={() => animateTo(i)}
            aria-label={`Go to ${roundNames[i]}`}
            className={`h-1 rounded-full transition-all ${
              i === leftIndex ? 'w-6 bg-[#C9A84C]' : 'w-1.5 bg-white/15 hover:bg-white/30'
            }`}
          />
        ))}
      </div>

      <p className="text-white/20 text-xs text-center mt-4">
        Swipe to move between rounds
      </p>
    </div>
  )
}

// ─── Tile ──────────────────────────────────────────────────────

function MatchTile({
  match, playerById, x, y, faded,
}: {
  match: BracketMatchRow
  playerById: Map<string, BracketPlayerRow>
  x: number
  y: number
  faded: boolean
}) {
  // A bye has a winner but was never played, so it is not a "won" match
  const isBye   = match.player_a_is_bye || match.player_b_is_bye
  const decided = !!match.winner_player_id && !isBye

  return (
    <div
      // Positioned with left/top rather than a transform: a translated child
      // inside an overflow-hidden parent breaks tap hit-testing on iOS Safari
      // until the first scroll, and Phase 4 makes these tiles tappable.
      className={`absolute rounded-sm border overflow-hidden ${
        decided
          ? 'border-emerald-500/50 bg-[#0f2418]'
          : 'border-[#1e3d28] bg-[#0f2418]'
      }`}
      style={{
        left: x,
        top: y,
        width: TILE_W,
        height: TILE_H,
        opacity: faded ? 0.25 : 1,
      }}
    >
      <Side
        playerId={match.player_a_id}
        isBye={match.player_a_is_bye}
        seed={match.seed_a}
        isWinner={decided && match.winner_player_id === match.player_a_id}
        result={match.result}
        playerById={playerById}
      />
      <div className="h-px bg-[#1e3d28]" />
      <Side
        playerId={match.player_b_id}
        isBye={match.player_b_is_bye}
        seed={match.seed_b}
        isWinner={decided && match.winner_player_id === match.player_b_id}
        result={match.result}
        playerById={playerById}
      />
    </div>
  )
}

function Side({
  playerId, isBye, seed, isWinner, result, playerById,
}: {
  playerId: string | null
  isBye: boolean
  seed: number | null
  isWinner: boolean
  result: string | null
  playerById: Map<string, BracketPlayerRow>
}) {
  const player = playerId ? playerById.get(playerId) : null
  // Only a first name fits at this width, and it is what everyone calls
  // each other on a trip anyway
  const shortName = player ? player.name.split(' ')[0] : ''

  return (
    <div
      className={`h-[37px] flex items-center gap-1.5 pl-1.5 pr-2 ${
        isWinner ? 'bg-emerald-500/[0.12]' : ''
      }`}
    >
      {/* Green edge marks the winner at a glance, before you read anything */}
      <span
        className={`w-[3px] h-6 rounded-full flex-shrink-0 ${
          isWinner ? 'bg-emerald-400' : 'bg-transparent'
        }`}
      />

      <span className="w-3 flex-shrink-0 text-[10px] tabular-nums text-white/25 text-right">
        {isBye ? '' : seed ?? ''}
      </span>

      {isBye ? (
        <span className="flex-1 text-[11px] tracking-[0.15em] uppercase text-white/25">
          Bye
        </span>
      ) : player ? (
        <>
          <span
            className={`flex-1 min-w-0 truncate text-sm leading-none ${
              isWinner ? 'text-emerald-300 font-semibold' : 'text-white/80'
            }`}
          >
            {shortName}
          </span>

          {/* The margin replaces the handicap once a match is won — by then
              the score is the thing worth knowing */}
          {isWinner && result ? (
            <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-emerald-300">
              {result}
            </span>
          ) : (
            <span className="flex-shrink-0 text-[11px] tabular-nums text-white/35">
              {player.handicap ?? '—'}
            </span>
          )}
        </>
      ) : (
        <span className="flex-1 text-[11px] text-white/20 italic">To be decided</span>
      )}
    </div>
  )
}
