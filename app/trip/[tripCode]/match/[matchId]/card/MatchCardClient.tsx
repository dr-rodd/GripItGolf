'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import {
  REGULATION_HOLES, extraCourseHole, openingHole, ordinal, parseExtraPlan, playCard, shotsOn, shouldWrite,
  withExtraHole, type CardHole, type CardSideKey, type CardSideView, type ExtraHolePlan,
} from '@/lib/matchCard'
import { DEFAULT_SIDE_COLOURS, type SideColour } from '@/lib/matchSides'
import { usePoll } from '@/app/scoring/usePoll'
import InlineUnlock from '@/app/components/InlineUnlock'
import { FIELD, buttonClass, cardClass } from '@/app/components/ui'

/**
 * The match play card in the hand (docs/event-use-cases.md, story 2, stage
 * 4; remodelled on trip scoring, Ross 25 Oct 2026): one hole at a time, its
 * number large, a strip of every hole across the top, **the top of the draw
 * on the left (red) and the bottom on the right (blue)** — or the sides'
 * team colours (lib/matchSides.ts) — the same on every phone. Each player
 * has a big number box with − and + under it; the first tap lands on the
 * score worth two points, nett par. **NR** is a player picking up: it loses
 * to any number, and two halve the hole. Previous and next move between
 * holes. lib/matchCard.ts decides who won each hole and when it is over.
 *
 * Every tap is saved as it is made (`match_scores`, `match_concessions`,
 * migration 058), one write at a time per box so a fast + + + lands in
 * order. The card re-reads every fifteen seconds while it is on screen,
 * so the other side's phone shows up.
 *
 * **Once the match is settled the result goes into the bracket by itself**
 * (`shouldWrite` → `persistWinner`, the bracket's own writer, so later
 * rounds follow). From then on the card is read-only, and changing it —
 * like changing it on the bracket — needs the admin PIN. **Anybody with
 * the code may score an open match** unless the organiser has kept it to
 * the players (`score_matches`, lib/eventPermissions.ts); the admin PIN
 * scores anything.
 *
 * **All square after 18, the card goes on** — the 19th off the 1st, the
 * 20th off the 2nd — until a hole is won (`playCard`). A dropdown on each
 * extra hole changes which course hole it is played off (`extra_holes`,
 * migration 061); the ones after follow on from it.
 */

/** Player → hole → gross; null is an NR. */
type Scores = Record<string, Record<number, number | null>>
type Conceded = Record<number, CardSideKey>

const MAX_GROSS = 20

export default function MatchCardClient({
  tripId, tripCode, matchId, a, b, holes: baseHoles, extraPlan: planInitial = {}, mySide, passcodeHash,
  stored: storedInitial, colours = DEFAULT_SIDE_COLOURS, anyoneScores = true,
}: {
  tripId: string
  tripCode: string
  matchId: string
  a: CardSideView
  b: CardSideView
  /** The course's eighteen; extra holes are added from them. */
  holes: CardHole[]
  /** Which course hole each extra hole is played off, where chosen. */
  extraPlan?: ExtraHolePlan
  /** This phone's side of the match, or null when they are not in it. */
  mySide: CardSideKey | null
  passcodeHash: string | null
  stored: { winner: string | null; result: string | null }
  /** Top red, bottom blue — or the sides' team colours. */
  colours?: Record<CardSideKey, SideColour>
  /** Whether anybody with the code may score it, or only its players. */
  anyoneScores?: boolean
}) {
  const router = useRouter()
  const [scores, setScores] = useState<Scores>({})
  const [conceded, setConceded] = useState<Conceded>({})
  const [plan, setPlan] = useState<ExtraHolePlan>(planInitial)
  const [loaded, setLoaded] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hole, setHole] = useState<number | null>(null)
  const [stored, setStored] = useState(storedInitial)
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  const organiser = unlocked || !isLocked(passcodeHash)

  const inMatch = mySide !== null
  const decided = stored.winner !== null
  const canEdit = organiser || (!decided && (inMatch || anyoneScores))

  // ── Reading the card ──
  const dirty = useRef(0)
  const load = useCallback(async () => {
    // A write in flight would be overwritten by an older read; skip a turn.
    if (dirty.current > 0) return
    const [s, c, x] = await Promise.all([
      supabase.from('match_scores').select('player_id, hole_number, gross').eq('trip_id', tripId).eq('match_id', matchId),
      supabase.from('match_concessions').select('hole_number, conceded_by').eq('trip_id', tripId).eq('match_id', matchId),
      // Its own read, fail-soft: before migration 061 there is no column,
      // and the extra holes simply run on from the 1st.
      supabase.from('matchplay_matches').select('extra_holes').eq('trip_id', tripId).eq('id', matchId).maybeSingle(),
    ])
    if (s.error || c.error) {
      console.error('Match card read failed:', s.error ?? c.error)
      // Before migration 058 the tables are not there at all.
      if (!loaded) setUnavailable(true)
      return
    }
    const nextScores: Scores = {}
    for (const r of (s.data ?? []) as { player_id: string; hole_number: number; gross: number | null }[]) {
      (nextScores[r.player_id] ??= {})[r.hole_number] = r.gross
    }
    const nextConceded: Conceded = {}
    for (const r of (c.data ?? []) as { hole_number: number; conceded_by: string }[]) {
      nextConceded[r.hole_number] = r.conceded_by === 'B' ? 'B' : 'A'
    }
    setScores(nextScores)
    setConceded(nextConceded)
    if (!x.error && x.data) setPlan(parseExtraPlan((x.data as { extra_holes?: unknown }).extra_holes))
    setLoaded(true)
    setUnavailable(false)
  }, [tripId, matchId, loaded])
  usePoll(load, 15_000, true)

  // ── The card, worked out ──
  const sides = useMemo(() => ({
    A: { id: a.id, players: a.players.map(p => ({ id: p.id, gender: p.gender, receives: p.receives })) },
    B: { id: b.id, players: b.players.map(p => ({ id: p.id, gender: p.gender, receives: p.receives })) },
  }), [a, b])
  const { holes, outcomes, state } = useMemo(() => playCard(
    baseHoles, sides.A, sides.B,
    new Map(Object.entries(scores).map(([pid, hs]) => [pid, new Map(Object.entries(hs).map(([h, g]) => [Number(h), g]))])),
    new Map(Object.entries(conceded).map(([h, side]) => [Number(h), side])),
    plan,
  ), [baseHoles, sides, scores, conceded, plan])
  const current = hole ?? (loaded ? openingHole(outcomes) : 1)
  const h = holes.find(x => x.holeNumber === current) ?? holes[0]
  const outcome = outcomes.find(o => o.holeNumber === current)
  const winnerId = state.leader === 'A' ? a.id : state.leader === 'B' ? b.id : null

  // ── Writing ──
  // One write at a time per box, in the order tapped.
  const chains = useRef(new Map<string, Promise<void>>())
  function queue(key: string, hole: number, write: () => PromiseLike<{ error: unknown }>) {
    dirty.current++
    const prev = chains.current.get(key) ?? Promise.resolve()
    const next = prev.then(async () => {
      const { error: err } = await write()
      if (err) {
        console.error('Match card write failed:', err)
        // Before migration 059 the card's tables stop at the 18th; before
        // 061 there is nowhere to keep which hole an extra hole is played off.
        const { code, message } = err as { code?: string; message?: string }
        const refused = (code === '23514' && hole > REGULATION_HOLES) || /extra_holes/.test(message ?? '')
        // Before migration 062 a score row must carry a number.
        const noNR = code === '23502'
        setError(noNR
          ? 'Saving an NR needs a database update — enter a score for now.'
          : refused
            ? 'Extra holes need a database update — the organiser can record the result on the bracket for now.'
            : 'Could not save that — check your connection and try again.')
      }
    }).finally(() => { dirty.current-- })
    chains.current.set(key, next)
  }

  /** A gross, an NR (null), or cleared (undefined). */
  function setGross(playerId: string, n: number, value: number | null | undefined) {
    if (!canEdit) return
    setError(null)
    // The card opens on the first hole not finished; once somebody is
    // scoring it stays where they are, rather than jumping on the moment
    // both sides are in and hiding who won the hole.
    if (hole === null) setHole(n)
    setScores(prev => {
      const mine = { ...(prev[playerId] ?? {}) }
      if (value === undefined) delete mine[n]; else mine[n] = value
      return { ...prev, [playerId]: mine }
    })
    queue(`s:${playerId}:${n}`, n, () => value === undefined
      ? supabase.from('match_scores').delete().eq('trip_id', tripId).eq('match_id', matchId)
          .eq('player_id', playerId).eq('hole_number', n)
      : supabase.from('match_scores').upsert({
          match_id: matchId, trip_id: tripId, player_id: playerId, hole_number: n, gross: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'match_id,player_id,hole_number' }))
  }

  /** Which course hole this extra hole is played off — everybody's card follows. */
  function playExtraOff(n: number, courseHole: number) {
    if (!canEdit || n <= REGULATION_HOLES) return
    setError(null)
    const next = withExtraHole(plan, n, courseHole)
    setPlan(next)
    queue('x', n, () => supabase.from('matchplay_matches')
      .update({ extra_holes: next }).eq('id', matchId).eq('trip_id', tripId))
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

  const nameOf = (key: CardSideKey) => (key === 'A' ? a.name : b.name)
  const status = state.settled && state.leader
    ? `${nameOf(state.leader)} wins ${state.result}`
    : state.extra ? `${state.progress} — down the ${ordinal(state.played + 1)}`
      : state.leader ? `${nameOf(state.leader)} ${state.progress}` : state.progress

  /**
   * A hole's mark on the strip: green for the hole being played, the
   * winner's colour, dark ink for a half, faint for one still to play.
   */
  const holeFill = (o: (typeof outcomes)[number] | undefined, isNow: boolean): string =>
    isNow ? 'var(--color-accent)'
      : o?.winner === 'A' ? colours.A.fill
        : o?.winner === 'B' ? colours.B.fill
          : o?.winner === 'halved' ? 'var(--color-ink)'
            : 'var(--color-tint)'

  const playerBox = (key: CardSideKey, p: CardSideView['players'][number], showName: boolean) => {
    const entered = scores[p.id]?.[current]
    const isNR = entered === null
    const value = typeof entered === 'number' ? entered : null
    const shots = shotsOn(h, { id: p.id, gender: p.gender, receives: p.receives })
    // Two points: nett par. The first tap of − or + lands here, as on a trip.
    const nettPar = h.par + shots
    const step = (delta: number) => {
      if (isNR) return
      setGross(p.id, current, value === null ? nettPar : Math.max(1, Math.min(MAX_GROSS, value + delta)))
    }
    const typed = (raw: string) => {
      if (raw === '') { setGross(p.id, current, undefined); return }
      const n = parseInt(raw, 10)
      if (!isNaN(n) && n >= 1 && n <= MAX_GROSS) setGross(p.id, current, n)
    }
    const stepClass = 'flex-1 h-12 rounded-xl border border-line text-ink/80 text-3xl leading-none ' +
      'active:scale-95 transition-all flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed'
    return (
      <div key={p.id} className={`p-2.5 bg-surface border rounded-xl ${isNR ? 'border-rust/40' : 'border-line'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {showName && <p className="t-cap text-ink/80 truncate">{p.name}</p>}
            <p className="t-cap text-ink/65" aria-label={`${shots} shots on this hole`}>
              {shots > 0 ? `${'•'.repeat(shots)} ${shots === 1 ? 'shot' : 'shots'}` : 'No shot'}
            </p>
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setGross(p.id, current, isNR ? undefined : null)}
            aria-pressed={isNR}
            aria-label={`No return for ${p.name}`}
            className={`text-sm border rounded-xl px-3 py-1 transition-colors flex-shrink-0 disabled:opacity-40 ${
              isNR ? 'border-rust/50 text-rust-deep bg-rust/10' : 'border-line text-ink/50'
            }`}
          >
            NR
          </button>
        </div>
        {isNR ? (
          <span className="mt-2 font-serif text-4xl flex items-center justify-center w-full h-16 text-rust-deep/80 border border-rust/30 rounded-xl">
            NR
          </span>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value === null ? '' : String(value)}
            onChange={e => typed(e.target.value)}
            disabled={!canEdit}
            aria-label={`${p.name}'s score on this hole`}
            className={`mt-2 font-serif text-5xl text-center bg-transparent outline-none text-ink caret-accent border rounded-xl p-0 w-full h-16 ${
              value === null ? 'border-accent/50' : 'border-line-strong'
            }`}
            // Sized and set here, not by class: the site's unlayered input rule
            // sets every field's face and size and would win over a utility.
            style={{ fontFamily: 'var(--font-serif)', fontSize: 44, lineHeight: '4rem', borderColor: value !== null ? colours[key].fill : undefined }}
          />
        )}
        <div className="flex gap-2 mt-2">
          <button type="button" disabled={!canEdit || isNR} onClick={() => step(-1)} aria-label={`One fewer for ${p.name}`} className={stepClass}>−</button>
          <button type="button" disabled={!canEdit || isNR} onClick={() => step(1)} aria-label={`One more for ${p.name}`} className={stepClass}>+</button>
        </div>
      </div>
    )
  }

  const sideColumn = (key: CardSideKey, side: CardSideView) => (
    <div className="min-w-0 flex flex-col gap-2">
      <div>
        <span className="block h-1 rounded-full mb-1.5" style={{ backgroundColor: colours[key].fill }} aria-hidden="true" />
        <p className="t-label font-semibold text-ink truncate text-center">{side.name}</p>
      </div>
      {side.players.map(p => playerBox(key, p, side.players.length > 1))}
    </div>
  )

  const holeLabel = outcome?.winner === 'A' || outcome?.winner === 'B'
    ? `${nameOf(outcome.winner)} wins the hole` : outcome?.winner === 'halved' ? 'Hole halved' : ''

  return (
    <div className="flex flex-col gap-3">
      {/* Every hole: a mark each, filled in the colour of whoever won it,
          the hole being played the long one — trip scoring's strip. */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="flex-1 flex gap-[3px] items-center">
          {holes.map(x => {
            const isNow = x.holeNumber === current
            const o = outcomes.find(y => y.holeNumber === x.holeNumber)
            return (
              <div
                key={x.holeNumber}
                className="h-1.5 rounded-full transition-all duration-300 ease-out"
                style={{
                  flexGrow: isNow ? 1.6 : 1, flexBasis: 0, minWidth: isNow ? 18 : 0,
                  backgroundColor: holeFill(o, isNow),
                }}
              />
            )
          })}
        </div>
      </div>

      {/* The match as it stands on the left; the hole being played,
          large, on the right */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 pb-1" aria-live="polite">
          <p className="t-label text-ink flex items-center gap-2">
            {loaded && state.leader && (
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colours[state.leader].fill }} aria-hidden="true" />
            )}
            <span className="min-w-0">{loaded ? status : 'Loading the card…'}</span>
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="t-h1 text-ink leading-none">
            {current > REGULATION_HOLES ? `The ${ordinal(current)}` : `Hole ${current}`}
          </p>
          <p className="t-cap text-ink/65 mt-1">Par {h.par} · Index {h.strokeIndex}</p>
        </div>
      </div>

      {/* An extra hole: which course hole it is played off — the 1st and
          on unless the players pick another. Same shots, until one is won. */}
      {current > REGULATION_HOLES && (
        <label className="flex items-center justify-end gap-2 t-cap text-ink/80 -mt-1">
          Played off the
          <select
            value={extraCourseHole(current, plan)}
            onChange={e => playExtraOff(current, Number(e.target.value))}
            disabled={!canEdit}
            aria-label={`The course hole the ${ordinal(current)} is played off`}
            // .field is a full-width box, unlayered; this one sits in a line.
            style={{ width: 'auto' }}
            className={`${FIELD} field-dense`}
          >
            {Array.from({ length: REGULATION_HOLES }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{ordinal(n)}</option>
            ))}
          </select>
        </label>
      )}

      {/* Top of the draw on the left, bottom on the right */}
      <div className="grid grid-cols-2 gap-3">
        {sideColumn('A', a)}
        {sideColumn('B', b)}
      </div>

      <p className="t-cap text-ink text-center h-5 flex items-center justify-center gap-2">
        {(outcome?.winner === 'A' || outcome?.winner === 'B') && (
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colours[outcome.winner].fill }} aria-hidden="true" />
        )}
        {holeLabel}
      </p>

      {/* Previous and next — trip scoring's pair */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setHole(Math.max(1, current - 1))}
          disabled={current <= 1}
          aria-label="Previous hole"
          className="flex-1 py-3 border border-line text-ink/65 text-2xl rounded-xl active:bg-tint transition-colors disabled:opacity-25"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => setHole(Math.min(holes.length, current + 1))}
          disabled={current >= holes.length}
          aria-label="Next hole"
          className="flex-[2] py-3 bg-accent-deep text-white text-2xl font-bold rounded-xl hover:bg-accent active:scale-[0.98] transition-all disabled:opacity-30"
        >
          →
        </button>
      </div>

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

      <p className="t-cap text-center">
        <Link href={`/trip/${tripCode}/scoring`} className="text-accent-deep hover:text-accent">Every live match →</Link>
      </p>
    </div>
  )
}
