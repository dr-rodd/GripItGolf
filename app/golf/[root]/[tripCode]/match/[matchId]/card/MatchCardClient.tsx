'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import {
  REGULATION_HOLES, extraCourseHole, openingHole, ordinal, parseExtraPlan, playCard, reopenBlocked, shotsOn, shouldWrite,
  withExtraHole, type CardHole, type CardSideKey, type CardSideView, type ExtraHolePlan,
} from '@/lib/matchCard'
import { DEFAULT_SIDE_COLOURS, type SideColour } from '@/lib/matchSides'
import { usePoll } from '@/app/scoring/usePoll'
import InlineUnlock from '@/app/components/InlineUnlock'
import MatchFinish from './MatchFinish'
import { MatchScoresTable } from './MatchScorecard'
import { IconChevronLeft } from '@/app/components/icons'
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
 * **Once the match is settled a sheet asks whether the last score is right**
 * (MatchFinish.tsx, Ross 26 Oct 2026), and its Finalise puts the result into
 * the bracket (`shouldWrite` → `persistWinner`, the bracket's own writer, so
 * later rounds follow), then shows the card hole by hole. From then on the
 * card is read-only, and changing it —
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
  stored: storedInitial, colours = DEFAULT_SIDE_COLOURS, anyoneScores = true, backHref, roundName, club = null,
}: {
  /** The header: the way back, and the round and club in the middle. */
  backHref: string
  roundName: string
  club?: string | null
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
  // The card and its scorecard side by side, slid between like trip
  // scoring's live board; both stay live. At rest, the one off screen
  // folds to no height so it adds no scroll to the one being read.
  const [panel, setPanel] = useState<'card' | 'scorecard'>('card')
  const [atRest, setAtRest] = useState(true)
  const showPanel = (next: 'card' | 'scorecard') => {
    if (next === panel) return
    setAtRest(false)
    setPanel(next)
  }
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  const organiser = unlocked || !isLocked(passcodeHash)

  const inMatch = mySide !== null
  const decided = stored.winner !== null
  const canEdit = !decided && (organiser || inMatch || anyoneScores)

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
  // Holes are scored in order: a hole takes a score only once every hole
  // before it has a result. Looking ahead — the index, the par — is free.
  const firstOpen = holes.find(x => !outcomes.find(o => o.holeNumber === x.holeNumber)?.winner)?.holeNumber
  const holeOpen = !loaded || firstOpen === undefined || current <= firstOpen
  const editHere = canEdit && holeOpen
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
  // In the browser yet? The pinned bar portals to <body>, which the server has not got.
  const inBrowser = useSyncExternalStore(() => () => {}, () => true, () => false)
  // Which way the hole just changed, so the new one slides in from that side.
  const [slide, setSlide] = useState<'slide-in-right' | 'slide-in-left' | ''>('')
  // Where a sideways swipe between holes began (onTouchStart below).
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const writeResult = useCallback(async (): Promise<boolean> => {
    if (writing.current) return false
    writing.current = true
    setSaving(true)
    setError(null)
    try {
      const { loadBracket, persistWinner } = await import('@/lib/matchplayStore')
      const all = await loadBracket(tripId)
      await persistWinner(all, matchId, winnerId as string, state.result)
      setStored({ winner: winnerId, result: state.result })
      router.refresh()
      return true
    } catch (e) {
      console.error('Match result write failed:', e)
      setError('The result could not reach the draw — check your connection and try again.')
      return false
    } finally {
      writing.current = false
      setSaving(false)
    }
  }, [state.result, winnerId, tripId, matchId, router])

  // ── The end of the match: confirm, finalise, then the card ──
  // Nothing interrupts while scores are going in (Ross, 26 Oct 2026: the
  // first tap of + can settle a match a second tap undoes). On the hole
  // that settles it — or the last hole, when the group played on — the
  // next button becomes "Finalise match", and only that tap opens the
  // sheet. Nothing goes into the bracket until the sheet's Finalise.
  const [finish, setFinish] = useState<{ phase: 'done'; bloom: boolean } | null>(null)
  const [asking, setAsking] = useState(false)
  const playedOut = outcomes.filter(o => o.holeNumber <= REGULATION_HOLES).every(o => o.winner !== null)
  const awaitingFinal = loaded && canEdit && shouldWrite(state, winnerId, stored, false)
  // The hole that settled it: holes are scored in order, so the
  // `played`-th finished hole.
  const settleHole = state.settled
    ? outcomes.filter(o => o.winner !== null).sort((x, y) => x.holeNumber - y.holeNumber)[state.played - 1]?.holeNumber ?? null
    : null
  const finaliseHere = awaitingFinal && settleHole !== null
    && (current === settleHole || (current > settleHole && (current === REGULATION_HOLES || current >= holes.length)))
  const sheetPhase: 'confirm' | 'done' | null = finish?.phase ?? (asking && awaitingFinal ? 'confirm' : null)
  const finalise = async () => {
    if (await writeResult()) setFinish({ phase: 'done', bloom: true })
  }

  // ── Reopening a finalised match (the organiser, with the PIN) ──
  // Takes the result out of the bracket, so the match reads as live again
  // and the card can be amended and finalised afresh. Refused once the
  // match it fed has a result or a score of its own: undoing this one
  // would undo theirs.
  const [reopening, setReopening] = useState(false)
  const reopen = async () => {
    if (reopening) return
    setReopening(true)
    setError(null)
    try {
      const { loadBracket, persistWinner } = await import('@/lib/matchplayStore')
      const all = await loadBracket(tripId)
      const me = all.find(m => m.id === matchId)
      const next = me?.next_match_id ? all.find(m => m.id === me.next_match_id) : undefined
      if (next) {
        const [s, c] = await Promise.all([
          supabase.from('match_scores').select('hole_number', { count: 'exact', head: true }).eq('trip_id', tripId).eq('match_id', next.id),
          supabase.from('match_concessions').select('hole_number', { count: 'exact', head: true }).eq('trip_id', tripId).eq('match_id', next.id),
        ])
        if (s.error || c.error) throw s.error ?? c.error
        const blocked = reopenBlocked(next.round_name, !!next.winner_player_id, (s.count ?? 0) + (c.count ?? 0) > 0)
        if (blocked) { setError(blocked); return }
      }
      await persistWinner(all, matchId, null, null)
      setStored({ winner: null, result: null })
      // Back to amending: the sheet waits until the card is finalised again.
      setAsking(false)
      router.refresh()
    } catch (e) {
      console.error('Reopening the match failed:', e)
      setError('Could not reopen the match — check your connection and try again.')
    } finally {
      setReopening(false)
    }
  }

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
   * A hole's mark on the strip: the winner's colour, the brown for a half,
   * faint for one still to play. The hole being played is the long mark,
   * in a lighter version of its own colour — light green while it has no
   * result yet. No black (Ross, 25 Oct 2026).
   */
  const lighter = (c: string) => `color-mix(in srgb, ${c} 45%, transparent)`
  const holeFill = (o: (typeof outcomes)[number] | undefined, isNow: boolean): string => {
    const base = o?.winner === 'A' ? colours.A.fill
      : o?.winner === 'B' ? colours.B.fill
        : o?.winner === 'halved' ? 'var(--color-bark)'
          : null
    if (isNow) return lighter(base ?? 'var(--color-accent)')
    if (!base) return 'var(--color-tint)'
    return o?.winner === 'halved' ? lighter(base) : base
  }

  // Swipe between holes: left for the next, right for the previous — a
  // sideways stroke only, so scrolling the page never moves the hole.
  const goTo = (n: number) => {
    const next = Math.max(1, Math.min(holes.length, n))
    if (next === current) return
    setSlide(next > current ? 'slide-in-right' : 'slide-in-left')
    setHole(next)
  }
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    swipe.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    goTo(current + (dx < 0 ? 1 : -1))
  }

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
    // Squares, as tall as they are wide — a thumb's target on the green.
    const stepClass = 'flex-1 aspect-square rounded-xl border border-line text-ink/80 text-4xl leading-none ' +
      'active:scale-95 transition-all flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed'
    return (
      <div key={p.id} className={`p-2.5 bg-surface border rounded-xl ${isNR ? 'border-rust/40' : 'border-line'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {showName && <p className="t-label font-semibold text-ink truncate">{p.name}</p>}
            <p className="t-cap text-ink/65" aria-label={`${shots} shots on this hole`}>
              {shots > 0 ? `${'•'.repeat(shots)} ${shots === 1 ? 'shot' : 'shots'}` : 'No shot'}
            </p>
          </div>
          {/* The button reaches past what it draws: the padding is a margin
              for a slightly missed tap, given back by the negative margin so
              the layout does not move. */}
          <button
            type="button"
            disabled={!editHere}
            onClick={() => setGross(p.id, current, isNR ? undefined : null)}
            aria-pressed={isNR}
            aria-label={`No return for ${p.name}`}
            className="-m-2.5 p-2.5 flex-shrink-0 disabled:opacity-40"
          >
            <span className={`flex items-center justify-center h-11 min-w-14 px-4 border rounded-xl t-label font-semibold transition-colors ${
              isNR ? 'border-rust/50 text-rust-deep bg-rust/10' : 'border-line-strong text-ink/65'
            }`}>
              NR
            </span>
          </button>
        </div>
        {isNR ? (
          <span className="mt-2 font-serif text-4xl flex items-center justify-center w-full h-20 text-rust-deep/80 border border-rust/30 rounded-xl">
            NR
          </span>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value === null ? '' : String(value)}
            onChange={e => typed(e.target.value)}
            disabled={!editHere}
            aria-label={`${p.name}'s score on this hole`}
            className={`mt-2 font-serif text-5xl text-center bg-transparent outline-none text-ink caret-accent border rounded-xl p-0 w-full h-20 disabled:opacity-60 ${
              value === null ? 'border-accent/50' : 'border-line-strong'
            }`}
            // Sized and set here, not by class: the site's unlayered input rule
            // sets every field's face and size and would win over a utility.
            // A line height of 1, lifted 9px by the padding: Bespoke Serif's
            // figures sit low in their line, so a box centring the line put
            // the number near the bottom edge on a phone. 80 = 2 + 6 + 48 + 24.
            style={{ fontFamily: 'var(--font-serif)', fontSize: 48, lineHeight: 1, paddingTop: 6, paddingBottom: 24, borderColor: value !== null ? colours[key].fill : undefined }}
          />
        )}
        <div className="flex gap-2 mt-2">
          <button type="button" disabled={!editHere || isNR} onClick={() => step(-1)} aria-label={`One fewer for ${p.name}`} className={stepClass}>−</button>
          <button type="button" disabled={!editHere || isNR} onClick={() => step(1)} aria-label={`One more for ${p.name}`} className={stepClass}>+</button>
        </div>
      </div>
    )
  }

  const sideColumn = (key: CardSideKey, side: CardSideView) => (
    <div className="min-w-0 flex flex-col gap-2">
      <div>
        <span className="block h-1 rounded-full mb-1.5" style={{ backgroundColor: colours[key].fill }} aria-hidden="true" />
        <p className="t-h2 text-ink truncate text-center">{side.name}</p>
      </div>
      {side.players.map(p => playerBox(key, p, side.players.length > 1))}
    </div>
  )

  const holeLabel = outcome?.winner === 'A' || outcome?.winner === 'B'
    ? `${nameOf(outcome.winner)} wins the hole` : outcome?.winner === 'halved' ? 'Hole halved' : ''

  return (
    <div className="flex flex-col gap-3">
      {/* One row: the way back on a card at the left, the round and club
          small and centred, the scorecard on a card at the right — no page
          title; the hole is the headline. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Link
          href={backHref}
          className={`justify-self-start h-10 pl-2 pr-3 inline-flex items-center gap-0.5 t-label text-ink/80 ${cardClass('raised', true)}`}
        >
          <IconChevronLeft size={18} /> Back
        </Link>
        <p className="t-cap text-ink/65 text-center leading-tight max-w-[40vw]">
          <span className="block truncate">{roundName}</span>
          {club && <span className="block truncate">{club}</span>}
        </p>
        <button
          type="button"
          onClick={() => showPanel(panel === 'card' ? 'scorecard' : 'card')}
          aria-pressed={panel === 'scorecard'}
          className={`justify-self-end h-10 px-3 inline-flex items-center t-label text-ink/80 ${cardClass('raised', true)}`}
        >
          {panel === 'card' ? 'Scorecard' : 'Score'}
        </button>
      </header>

      <div style={{ overflowX: 'clip' }}>
      <div
        className="flex items-start transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: '200%', transform: panel === 'scorecard' ? 'translateX(-50%)' : 'translateX(0)' }}
        onTransitionEnd={e => { if (e.target === e.currentTarget) setAtRest(true) }}
      >
      <div
        className={`w-1/2 min-w-0 flex flex-col gap-3 ${panel !== 'card' && atRest ? 'h-0 overflow-hidden' : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-hidden={panel !== 'card'}
      >
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

      {/* Everything about the hole being played slides in from the side it
          was swiped from; the strip above it stays put. */}
      <div key={current} className={`flex flex-col gap-3 ${slide}`}>
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
          {/* A hole behind the furthest one played with no result — the
              standing is "thru" the furthest, but this one still counts. */}
          {loaded && !state.settled && state.unfinished.length > 0 && (
            <button
              type="button"
              onClick={() => setHole(state.unfinished[0])}
              className="t-cap text-accent-deep text-left mt-0.5"
            >
              {state.unfinished.length === 1
                ? `Hole ${state.unfinished[0]} has no result yet →`
                : `Holes ${state.unfinished.join(', ')} have no result yet →`}
            </button>
          )}
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
        {canEdit && !holeOpen && firstOpen !== undefined ? (
          <button type="button" onClick={() => goTo(firstOpen)} className="t-cap text-accent-deep">
            Score hole {firstOpen} first →
          </button>
        ) : holeLabel}
      </p>
      </div>

      {/* Previous and next, pinned to the bottom of the screen above the
          tab bar — portalled to <body> so no ancestor's transform can pin
          it to the page instead. Fixed to the page's own bottom edge, a
          keyboard opening for the score box covers it rather than pushing
          it up over the boxes. */}
      {inBrowser && panel === 'card' && createPortal(
        <div className="hide-with-keyboard fixed inset-x-0 z-30 paper border-t border-line bottom-[calc(64px+env(safe-area-inset-bottom))] print:hidden">
          <div className="max-w-lg mx-auto px-4 py-2 flex gap-3">
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              disabled={current <= 1}
              aria-label="Previous hole"
              className="flex-1 py-3 border border-line bg-surface text-ink/65 text-2xl rounded-xl active:bg-tint transition-colors disabled:opacity-25"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => finaliseHere ? setAsking(true) : goTo(current + 1)}
              disabled={!finaliseHere && current >= holes.length}
              aria-label={finaliseHere ? 'Finalise match' : 'Next hole'}
              className={`flex-[2] py-3 bg-accent-deep text-white font-bold rounded-xl hover:bg-accent active:scale-[0.98] transition-all disabled:opacity-30 ${finaliseHere ? 'text-base' : 'text-2xl'}`}
            >
              {finaliseHere ? 'Finalise match' : '→'}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {error && <p className="text-rust-deep text-sm text-center leading-snug">{error}</p>}

      {awaitingFinal && !finaliseHere && sheetPhase === null && (
        <button type="button" onClick={() => setAsking(true)} className={buttonClass('primary')}>
          Finalise the match
        </button>
      )}

      {inBrowser && sheetPhase && (
        <MatchFinish
          phase={sheetPhase}
          bloom={finish?.bloom ?? false}
          a={a}
          b={b}
          colours={colours}
          holes={holes}
          outcomes={outcomes}
          scores={scores}
          headline={status}
          winner={state.leader}
          saving={saving}
          error={error}
          onFinalise={finalise}
          canContinue={settleHole !== null && settleHole < REGULATION_HOLES && !playedOut}
          onContinue={() => {
            setAsking(false)
            if (settleHole !== null && current <= settleHole) goTo(settleHole + 1)
          }}
          onFix={() => {
            setAsking(false)
            if (settleHole !== null) goTo(settleHole)
          }}
          onClose={() => setFinish(null)}
        />
      )}

      {decided && organiser && (
        <div className={`p-4 ${cardClass()}`}>
          <p className="text-ink text-sm font-medium">The result is in the draw</p>
          <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
            Reopen the match to amend the card. It goes back to live in the draw until it is finalised again.
          </p>
          <button type="button" onClick={() => { void reopen() }} disabled={reopening} className={buttonClass('secondary')}>
            {reopening ? 'Reopening…' : 'Reopen the match'}
          </button>
        </div>
      )}

      {!canEdit && !(decided && organiser) && passcodeHash && (
        <div className={`p-4 ${cardClass()}`}>
          <p className="text-ink text-sm font-medium">
            {decided ? 'The result is in the draw' : 'The players score this match'}
          </p>
          <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
            {decided
              ? 'Reopening it to amend the card needs the admin PIN.'
              : 'The organiser can score or finish it with the admin PIN.'}
          </p>
          <InlineUnlock tripCode={tripCode} passcodeHash={passcodeHash} onUnlocked={() => setUnlocked(true)} prompt="Enter the admin PIN" />
        </div>
      )}

      {/* Room for the pinned previous/next bar, so the last line is never under it. */}
      <div className="h-16" aria-hidden="true" />
      </div>

      {/* The scorecard: how everybody is playing and how the match has
          gone, hole by hole — anybody may look. Swipe right to go back. */}
      <div
        className={`w-1/2 min-w-0 flex flex-col gap-3 ${panel !== 'scorecard' && atRest ? 'h-0 overflow-hidden' : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={e => {
          const start = swipe.current
          swipe.current = null
          if (!start) return
          const t = e.changedTouches[0]
          const dx = t.clientX - start.x
          if (dx >= 60 && Math.abs(dx) >= Math.abs(t.clientY - start.y) * 1.5) showPanel('card')
        }}
        aria-hidden={panel !== 'scorecard'}
      >
        <p className="t-label text-ink flex items-center gap-2" aria-live="polite">
          {loaded && state.leader && (
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colours[state.leader].fill }} aria-hidden="true" />
          )}
          <span className="min-w-0">{loaded ? status : 'Loading the card…'}</span>
        </p>
        {loaded && (
          <MatchScoresTable a={a} b={b} colours={colours} holes={holes} outcomes={outcomes} scores={scores} />
        )}
        <div className="h-4" aria-hidden="true" />
      </div>
      </div>
      </div>
    </div>
  )
}
