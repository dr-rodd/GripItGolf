'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import {
  cardState, holeOutcomes, openingHole, shotsOn, shouldWrite,
  type CardHole, type CardSideKey,
} from '@/lib/matchCard'
import { usePoll } from '@/app/scoring/usePoll'
import InlineUnlock from '@/app/components/InlineUnlock'
import { buttonClass, cardClass } from '@/app/components/ui'

/**
 * The match play card in the hand (docs/event-use-cases.md, story 2, stage
 * 4): one hole at a time, **the top of the draw on the left and the bottom
 * on the right**, each player's gross entered with − and +, the shots they
 * get on the hole shown as dots, and a **Concede hole** button under each
 * side. lib/matchCard.ts decides who won each hole and when it is over.
 *
 * Every tap is saved as it is made (`match_scores`, `match_concessions`,
 * migration 058), one write at a time per box so a fast + + + lands in
 * order. The card re-reads every fifteen seconds while it is on screen,
 * so the other side's phone shows up.
 *
 * **Once the match is settled the result goes into the bracket by itself**
 * (`shouldWrite` → `persistWinner`, the bracket's own writer, so later
 * rounds follow). From then on the card is read-only, and changing it —
 * like changing it on the bracket — needs the admin PIN. The admin PIN is
 * also how the organiser scores or finishes a match they are not in.
 */

export type CardSideView = {
  id: string
  name: string
  players: { id: string; name: string; gender: string; receives: number }[]
}

type Scores = Record<string, Record<number, number>>
type Conceded = Record<number, CardSideKey>

const MAX_GROSS = 20

export default function MatchCardClient({
  tripId, tripCode, matchId, a, b, holes, inMatch, passcodeHash, stored: storedInitial,
}: {
  tripId: string
  tripCode: string
  matchId: string
  a: CardSideView
  b: CardSideView
  holes: CardHole[]
  /** This phone's player is in the match. */
  inMatch: boolean
  passcodeHash: string | null
  stored: { winner: string | null; result: string | null }
}) {
  const router = useRouter()
  const [scores, setScores] = useState<Scores>({})
  const [conceded, setConceded] = useState<Conceded>({})
  const [loaded, setLoaded] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hole, setHole] = useState<number | null>(null)
  const [stored, setStored] = useState(storedInitial)
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  const organiser = unlocked || !isLocked(passcodeHash)

  const decided = stored.winner !== null
  const canEdit = organiser || (inMatch && !decided)

  // ── Reading the card ──
  const dirty = useRef(0)
  const load = useCallback(async () => {
    // A write in flight would be overwritten by an older read; skip a turn.
    if (dirty.current > 0) return
    const [s, c] = await Promise.all([
      supabase.from('match_scores').select('player_id, hole_number, gross').eq('trip_id', tripId).eq('match_id', matchId),
      supabase.from('match_concessions').select('hole_number, conceded_by').eq('trip_id', tripId).eq('match_id', matchId),
    ])
    if (s.error || c.error) {
      console.error('Match card read failed:', s.error ?? c.error)
      // Before migration 058 the tables are not there at all.
      if (!loaded) setUnavailable(true)
      return
    }
    const nextScores: Scores = {}
    for (const r of (s.data ?? []) as { player_id: string; hole_number: number; gross: number }[]) {
      (nextScores[r.player_id] ??= {})[r.hole_number] = r.gross
    }
    const nextConceded: Conceded = {}
    for (const r of (c.data ?? []) as { hole_number: number; conceded_by: string }[]) {
      nextConceded[r.hole_number] = r.conceded_by === 'B' ? 'B' : 'A'
    }
    setScores(nextScores)
    setConceded(nextConceded)
    setLoaded(true)
    setUnavailable(false)
  }, [tripId, matchId, loaded])
  usePoll(load, 15_000, true)

  // ── The card, worked out ──
  const sides = useMemo(() => ({
    A: { id: a.id, players: a.players.map(p => ({ id: p.id, gender: p.gender, receives: p.receives })) },
    B: { id: b.id, players: b.players.map(p => ({ id: p.id, gender: p.gender, receives: p.receives })) },
  }), [a, b])
  const outcomes = useMemo(() => holeOutcomes(
    holes, sides.A, sides.B,
    new Map(Object.entries(scores).map(([pid, hs]) => [pid, new Map(Object.entries(hs).map(([h, g]) => [Number(h), g]))])),
    new Map(Object.entries(conceded).map(([h, side]) => [Number(h), side])),
  ), [holes, sides, scores, conceded])
  const state = useMemo(() => cardState(outcomes), [outcomes])
  const current = hole ?? (loaded ? openingHole(outcomes) : 1)
  const h = holes.find(x => x.holeNumber === current) ?? holes[0]
  const outcome = outcomes.find(o => o.holeNumber === current)
  const winnerId = state.leader === 'A' ? a.id : state.leader === 'B' ? b.id : null

  // ── Writing ──
  // One write at a time per box, in the order tapped.
  const chains = useRef(new Map<string, Promise<void>>())
  function queue(key: string, write: () => PromiseLike<{ error: unknown }>) {
    dirty.current++
    const prev = chains.current.get(key) ?? Promise.resolve()
    const next = prev.then(async () => {
      const { error: err } = await write()
      if (err) {
        console.error('Match card write failed:', err)
        setError('Could not save that — check your connection and try again.')
      }
    }).finally(() => { dirty.current-- })
    chains.current.set(key, next)
  }

  function setGross(playerId: string, n: number, value: number | null) {
    if (!canEdit) return
    setError(null)
    setScores(prev => {
      const mine = { ...(prev[playerId] ?? {}) }
      if (value === null) delete mine[n]; else mine[n] = value
      return { ...prev, [playerId]: mine }
    })
    queue(`s:${playerId}:${n}`, () => value === null
      ? supabase.from('match_scores').delete().eq('trip_id', tripId).eq('match_id', matchId)
          .eq('player_id', playerId).eq('hole_number', n)
      : supabase.from('match_scores').upsert({
          match_id: matchId, trip_id: tripId, player_id: playerId, hole_number: n, gross: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'match_id,player_id,hole_number' }))
  }

  function concede(side: CardSideKey, n: number) {
    if (!canEdit) return
    setError(null)
    const undo = conceded[n] === side
    setConceded(prev => {
      const next = { ...prev }
      if (undo) delete next[n]; else next[n] = side
      return next
    })
    queue(`c:${n}`, () => undo
      ? supabase.from('match_concessions').delete().eq('trip_id', tripId).eq('match_id', matchId).eq('hole_number', n)
      : supabase.from('match_concessions').upsert({
          match_id: matchId, trip_id: tripId, hole_number: n, conceded_by: side,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'match_id,hole_number' }))
  }

  // ── The result into the bracket, once the card says it is over ──
  //
  // By itself only into an empty match. Over a result already in — one
  // entered by hand, a walkover — it is the organiser's deliberate tap, never
  // something that happens because they opened the card with the PIN in.
  const writing = useRef(false)
  const writeResult = useCallback(() => {
    if (writing.current) return
    writing.current = true
    ;(async () => {
      try {
        const { loadBracket, persistWinner } = await import('@/lib/matchplayStore')
        const all = await loadBracket(tripId)
        await persistWinner(all, matchId, winnerId as string, state.result)
        setStored({ winner: winnerId, result: state.result })
        router.refresh()
      } catch (e) {
        console.error('Match result write failed:', e)
        setError('The match is over, but the result could not reach the bracket — try again.')
      } finally {
        writing.current = false
      }
    })()
  }, [state.result, winnerId, tripId, matchId, router])
  useEffect(() => {
    if (loaded && shouldWrite(state, winnerId, stored, false)) writeResult()
  }, [loaded, state, winnerId, stored, writeResult])
  const offerOverwrite = loaded && organiser
    && shouldWrite(state, winnerId, stored, true) && !shouldWrite(state, winnerId, stored, false)

  if (unavailable) {
    return (
      <p className="text-ink/80 text-sm text-center leading-snug">
        The match card is not switched on yet — it needs a database update. The result can still be
        recorded on the bracket.
      </p>
    )
  }

  const leaderName = state.leader === 'A' ? a.name : state.leader === 'B' ? b.name : null
  const status = state.settled
    ? state.halved ? 'All square after 18' : `${leaderName} wins ${state.result}`
    : state.leader ? `${leaderName} ${state.progress}` : state.progress

  const sideColumn = (key: CardSideKey, side: CardSideView) => (
    <div className="min-w-0 flex flex-col gap-3">
      <p className="t-card text-ink truncate text-center">{side.name}</p>
      {side.players.map(p => {
        const value = scores[p.id]?.[current]
        const shots = shotsOn(h, { id: p.id, gender: p.gender, receives: p.receives })
        return (
          <div key={p.id} className={`p-3 ${cardClass()}`}>
            {side.players.length > 1 && <p className="t-cap text-ink/80 truncate text-center">{p.name}</p>}
            <p className="t-cap text-accent-deep text-center h-5" aria-label={`${shots} shots on this hole`}>
              {shots > 0 ? '•'.repeat(shots) : ''}
            </p>
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setGross(p.id, current, value === undefined ? h.par : Math.max(1, value - 1))}
                aria-label={`One fewer for ${p.name}`}
                className="w-11 h-11 rounded-full border border-line text-xl text-ink disabled:opacity-30"
              >
                −
              </button>
              <span className="font-serif text-[30px] font-bold text-ink tabular-nums w-10 text-center">
                {value ?? '–'}
              </span>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setGross(p.id, current, value === undefined ? h.par : Math.min(MAX_GROSS, value + 1))}
                aria-label={`One more for ${p.name}`}
                className="w-11 h-11 rounded-full border border-line text-xl text-ink disabled:opacity-30"
              >
                +
              </button>
            </div>
            {value !== undefined && canEdit && (
              <button type="button" onClick={() => setGross(p.id, current, null)} className="block mx-auto t-cap text-ink/65 mt-1">
                Clear
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => concede(key, current)}
        aria-pressed={conceded[current] === key}
        className={`${buttonClass(conceded[current] === key ? 'danger' : 'secondary', true, true)} disabled:opacity-40`}
      >
        {conceded[current] === key ? 'Conceded — undo' : 'Concede hole'}
      </button>
    </div>
  )

  const holeLabel = outcome?.winner === 'A' ? `${a.name} wins the hole`
    : outcome?.winner === 'B' ? `${b.name} wins the hole`
      : outcome?.winner === 'halved' ? 'Hole halved' : ''

  return (
    <div className="flex flex-col gap-4">
      {/* The match as it stands */}
      <div className={`px-4 py-3 text-center ${state.settled ? cardClass('chosen') : cardClass()}`} aria-live="polite">
        <p className="t-card text-ink">{loaded ? status : 'Loading the card…'}</p>
        {state.settled && state.halved && (
          <p className="t-cap text-ink/65 mt-1">A halved match is settled on the bracket — the organiser records who goes through.</p>
        )}
      </div>

      {/* Every hole, with who won it — tap to go to one */}
      <div className="grid grid-cols-9 gap-1" aria-label="Holes">
        {outcomes.map(o => (
          <button
            key={o.holeNumber}
            type="button"
            onClick={() => setHole(o.holeNumber)}
            aria-pressed={o.holeNumber === current}
            aria-label={`Hole ${o.holeNumber}`}
            className={`h-11 rounded-tile border text-[13px] tabular-nums flex flex-col items-center justify-center leading-none ${
              o.holeNumber === current ? 'border-accent-deep bg-accent-tint text-ink' : 'border-line text-ink/80'
            }`}
          >
            <span>{o.holeNumber}</span>
            <span className="text-[13px] text-ink/65 mt-0.5" aria-hidden="true">
              {o.winner === 'A' ? '◂' : o.winner === 'B' ? '▸' : o.winner === 'halved' ? '=' : ''}
            </span>
          </button>
        ))}
      </div>

      {/* This hole */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setHole(Math.max(1, current - 1))}
          disabled={current <= 1}
          aria-label="Previous hole"
          className={`w-11 h-11 flex items-center justify-center disabled:opacity-25 ${cardClass()}`}
        >
          ‹
        </button>
        <div className="text-center">
          <p className="t-card text-ink">Hole {current}</p>
          <p className="t-cap text-ink/65">Par {h.par} · Index {h.strokeIndex}</p>
        </div>
        <button
          type="button"
          onClick={() => setHole(Math.min(holes.length, current + 1))}
          disabled={current >= holes.length}
          aria-label="Next hole"
          className={`w-11 h-11 flex items-center justify-center disabled:opacity-25 ${cardClass()}`}
        >
          ›
        </button>
      </div>

      {/* Top of the draw on the left, bottom on the right */}
      <div className="grid grid-cols-2 gap-3">
        {sideColumn('A', a)}
        {sideColumn('B', b)}
      </div>

      <p className="t-cap text-ink/80 text-center h-5">{holeLabel}</p>

      {error && <p className="text-rust-deep text-sm text-center leading-snug">{error}</p>}

      {offerOverwrite && (
        <button type="button" onClick={writeResult} className={buttonClass('primary')}>
          Put {status} in the bracket
        </button>
      )}

      {!canEdit && passcodeHash && (
        <div className={`p-4 ${cardClass()}`}>
          <p className="text-ink text-sm font-medium">
            {decided ? 'The result is in the bracket' : 'The players score this match'}
          </p>
          <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
            {decided
              ? 'Changing it needs the admin PIN.'
              : 'The organiser can score or finish it with the admin PIN.'}
          </p>
          <InlineUnlock tripCode={tripCode} passcodeHash={passcodeHash} onUnlocked={() => setUnlocked(true)} prompt="Enter the admin PIN" />
        </div>
      )}
    </div>
  )
}
