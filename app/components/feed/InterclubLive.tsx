'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askInterclub } from '@/lib/interclubClient'
import { MARGINS, type LiveMatch, type LiveTie } from '@/lib/interclubTie'
import { sideColours, sideTint, type SideColour } from '@/lib/matchSides'
import { tripBase } from '@/lib/tripPaths'
import { popClose, popOpen } from '../popOut'
import { IconChevronLeft, IconX } from '../icons'
import { FIELD, LiveDot, buttonClass, cardClass } from '../ui'

type Pick = { code: string; playoff: boolean; slot: number }

/**
 * interclub.stream's live matches (D363, Ross, 27 Nov 2026: "a live ticker
 * can be tapped and a pop up displays the live matches that that club is
 * involved in, these can then be tapped to access the specific matches.
 * Matches can be tapped to amend the score … allow for a w/l/halve rather
 * than score entry as it's not always clear"). The site's pop-out, out of
 * the ticker: the club's live ties, each with its matches and where they
 * stand; a match opens in the same card to mark who won each hole — or
 * halved — with no scores, to amend a hole already marked, or to give just
 * the result. The card itself, hole by hole with scores, is a link away.
 * Every write goes through /api/interclub, for anybody on either club's list.
 */
export default function InterclubLive({ ties, origin, focus = null, onClose, onChanged }: {
  ties: LiveTie[]
  origin: HTMLElement | null
  /** A tie to open on (its own stream's ticker), else the list. */
  focus?: string | null
  onClose: () => void
  /** A tie as it stands after a write — the ticker and the stream follow it. */
  onChanged: (tie: LiveTie) => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const [pick, setPick] = useState<Pick | null>(null)

  useLayoutEffect(() => {
    popOpen(panel.current, origin, backdrop.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    void popClose(panel.current, origin, backdrop.current).then(onClose)
  }, [onClose, origin])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (pick) setPick(null); else close() } }
    window.addEventListener('keydown', onKey)
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = was }
  }, [close, pick])

  const shown = focus ? ties.filter(t => t.code === focus) : ties
  const tie = pick ? ties.find(t => t.code === pick.code) ?? null : null
  const match = tie && pick ? tie.matches.find(m => m.playoff === pick.playoff && m.slot === pick.slot) ?? null : null

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={match ? `Match ${match.slot + 1}` : 'Live inter-club matches'}>
      <div ref={backdrop} className="absolute inset-0 bg-ink/50" onClick={close} />
      <div className="absolute inset-0 flex items-center justify-center p-3 pointer-events-none"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div ref={panel} className={`${cardClass('floating')} bg-surface pointer-events-auto relative w-full max-w-lg max-h-full flex flex-col overflow-hidden`}
          style={{ transformOrigin: 'top left' }}>
          <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-3 pb-2 border-b border-line">
            {match && (
              <button type="button" onClick={() => setPick(null)} aria-label="Back to the matches"
                className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-ink/80 press ch-focus flex-shrink-0">
                <IconChevronLeft size={22} />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <p className="t-h2 text-ink truncate">{match && tie ? (match.playoff ? 'The playoff' : `Match ${match.slot + 1}`) : 'Live now'}</p>
              <p className="t-cap text-ink/65 truncate">{match && tie ? `${tie.names.a} v ${tie.names.b}` : focus && shown[0] ? shown[0].competition : 'Your club’s inter-club matches'}</p>
            </div>
            <button type="button" onClick={close} aria-label="Close"
              className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink/65 press ch-focus flex-shrink-0">
              <IconX size={22} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
            {match && tie
              ? <MatchView tie={tie} match={match} onChanged={onChanged} />
              : shown.length === 0
                ? <p className="t-body text-ink/80 py-6 text-center">No inter-club matches live just now.</p>
                : shown.map(t => <TieBlock key={t.code} tie={t} onPick={m => setPick({ code: t.code, playoff: m.playoff, slot: m.slot })} />)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** A tie's two colours, as the match card draws its sides. */
function coloursOf(tie: LiveTie): { a: SideColour; b: SideColour } {
  const c = sideColours(tie.colours.a, tie.colours.b)
  return { a: c.A, b: c.B }
}

/** One live tie: its score, then its matches — each a row to open. */
function TieBlock({ tie, onPick }: { tie: LiveTie; onPick: (m: LiveMatch) => void }) {
  const c = coloursOf(tie)
  return (
    <section className="pt-4">
      <div className="flex items-center gap-2">
        {tie.live && <LiveDot />}
        <p className="t-label text-ink/80 truncate flex-1 min-w-0">{tie.competition}</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-2">
        <ClubScore name={tie.names.a} score={tie.score.a} colour={c.a} mine={tie.mine === 'a'} />
        <span className="t-cap text-ink/65">v</span>
        <ClubScore name={tie.names.b} score={tie.score.b} colour={c.b} mine={tie.mine === 'b'} right />
      </div>
      <p className="t-cap text-ink/65 mt-1.5">{tie.line}</p>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {tie.matches.map(m => {
          const lead = m.result === 'a' || m.result === 'b' ? m.result : m.leader
          const open = !!m.a && !!m.b
          return (
            <li key={`${m.playoff ? 'p' : 'm'}${m.slot}`}>
              <button type="button" disabled={!open} onClick={() => onPick(m)}
                className="w-full text-left py-2.5 flex items-center gap-3 press ch-focus disabled:opacity-100">
                <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: lead ? c[lead].fill : 'var(--color-line)' }} aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block t-cap text-ink/65">{m.playoff ? 'The playoff' : `Match ${m.slot + 1}`}</span>
                  <span className="block text-[15px] text-ink truncate">{m.a ?? 'To be set'}</span>
                  <span className="block text-[15px] text-ink truncate"><span className="text-ink/65">v</span> {m.b ?? 'To be set'}</span>
                  <span className="flex items-center gap-1.5 t-cap text-ink/80 mt-0.5">{m.live && !m.result && <LiveDot />}{m.line}</span>
                </span>
                {open && <span className="t-cap text-accent-deep flex-shrink-0">{m.result ? 'See' : 'Score'}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <Link href={`${tripBase(tie.code, 'tournament')}/leaderboard`} className={`${buttonClass('quiet', false, true)} mt-1`}>The whole match</Link>
    </section>
  )
}

function ClubScore({ name, score, colour, mine, right = false }: { name: string; score: string; colour: SideColour; mine: boolean; right?: boolean }) {
  return (
    <div className={`min-w-0 flex items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <span className="font-serif font-bold text-[26px] leading-none text-ink tabular-nums">{score}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 min-w-0" style={right ? { flexDirection: 'row-reverse' } : undefined}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-line-strong" style={{ backgroundColor: colour.fill }} aria-hidden="true" />
          <span className="t-label text-ink truncate">{name}</span>
        </span>
        {mine && <span className="block t-cap text-ink/65">Your club</span>}
      </span>
    </div>
  )
}

/**
 * One match, to score without scores (D363): every hole as a tile — the
 * winner's colour, the brown softened for a half — the next hole to mark
 * chosen, or any hole already marked tapped to amend; who won it in three
 * buttons; Finalise once the holes decide it; just the result when the holes
 * are not known; and the card itself for anybody who has the scores.
 */
function MatchView({ tie, match, onChanged }: { tie: LiveTie; match: LiveMatch; onChanged: (t: LiveTie) => void }) {
  const c = coloursOf(tie)
  const [hole, setHole] = useState<number | null>(match.next)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resultOnly, setResultOnly] = useState(false)
  const [winner, setWinner] = useState<'a' | 'b' | 'halved' | null>(null)
  const [margin, setMargin] = useState('')
  // The next hole follows the match as it is marked, unless one was picked to amend.
  const [amending, setAmending] = useState(false)
  useEffect(() => { if (!amending) setHole(match.next) }, [match.next, amending])

  const ask = async (body: Record<string, unknown>) => {
    setBusy(true); setError('')
    const r = await askInterclub({ ...body, code: tie.code, slot: match.slot, playoff: match.playoff })
    setBusy(false)
    if (!r.ok) { setError(r.error); return false }
    onChanged(r.tie as LiveTie)
    return true
  }
  const mark = async (w: 'a' | 'b' | 'halved' | null) => {
    if (hole === null) return
    if (await ask({ action: 'match.mark', hole, winner: w })) setAmending(false)
  }
  const done = !!match.result
  const marked = hole !== null ? match.holes.find(h => h.n === hole) : undefined
  const scoredHere = !!marked && marked.w !== null && !marked.marked
  const lead = match.result === 'a' || match.result === 'b' ? match.result : match.leader
  const holeFill = (w: 'a' | 'b' | 'h' | null) => (w === 'a' ? c.a.fill : w === 'b' ? c.b.fill : w === 'h' ? 'color-mix(in srgb, var(--color-bark) 45%, transparent)' : 'var(--color-tint)')
  const holeInk = (w: 'a' | 'b' | 'h' | null) => (w === 'a' ? c.a.on : w === 'b' ? c.b.on : 'var(--color-ink)')

  return (
    <div className="pt-3">
      <div className="space-y-1.5">
        {(['a', 'b'] as const).map(side => (
          <div key={side} className="flex items-center gap-2 rounded-tile px-3 py-2" style={lead === side ? { backgroundColor: sideTint(c[side]) } : undefined}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-line-strong" style={{ backgroundColor: c[side].fill }} aria-hidden="true" />
            <span className="t-label text-ink flex-shrink-0">{tie.names[side]}</span>
            <span className="t-cap text-ink/80 truncate min-w-0">{match[side]}</span>
          </div>
        ))}
      </div>
      <p className="t-card text-ink mt-3" aria-live="polite">{match.line}</p>

      {/* Every hole, its winner's colour — tap one already marked to amend it. */}
      <div className="grid grid-cols-9 gap-1 mt-3" role="group" aria-label="Holes">
        {match.holes.map(h => {
          const chosen = h.n === hole && !done
          const may = tie.may && !done && (h.marked || h.n === match.next)
          return (
            <button key={h.n} type="button" disabled={!may || busy}
              onClick={() => { setHole(h.n); setAmending(h.n !== match.next) }}
              aria-label={`Hole ${h.n}${h.w === 'a' ? `, ${tie.names.a}` : h.w === 'b' ? `, ${tie.names.b}` : h.w === 'h' ? ', halved' : ''}${h.marked ? ', marked' : ''}`}
              aria-pressed={chosen}
              className={`h-9 rounded-[8px] text-[13px] font-semibold tabular-nums disabled:opacity-100 ${chosen ? 'ring-2 ring-accent-deep ring-offset-1 ring-offset-surface' : ''}`}
              style={{ backgroundColor: holeFill(h.w), color: holeInk(h.w) }}>
              {h.n}
            </button>
          )
        })}
      </div>
      <p className="t-cap text-ink/65 mt-1.5">Marked holes count where nobody has put scores on the card.</p>

      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}

      {done && (
        <p className="t-cap text-ink/80 mt-4">This match has its result. A team captain changes a result from the match’s page.</p>
      )}

      {!done && tie.may && match.settled && (
        <button type="button" disabled={busy} onClick={() => void ask({ action: 'match.result', result: match.settled!.result, margin: match.settled!.result === 'halved' ? null : match.settled!.margin })}
          className={`${buttonClass('primary', true)} mt-4`}>
          Finalise: {match.settled.result === 'halved' ? 'halved' : `${tie.names[match.settled.result]} won ${match.settled.margin}`}
        </button>
      )}

      {!done && tie.may && hole !== null && !scoredHere && (
        <div className="mt-4">
          <p className="t-label text-ink">{amending ? `Change hole ${hole}` : `Hole ${hole}`} — who won it?</p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button type="button" disabled={busy} onClick={() => void mark('a')} className="min-h-12 rounded-button t-label press ch-focus px-2 truncate"
              style={{ backgroundColor: c.a.fill, color: c.a.on }}>{tie.names.a}</button>
            <button type="button" disabled={busy} onClick={() => void mark('halved')} className="min-h-12 rounded-button t-label press ch-focus bg-surface border border-line shadow-raised text-ink">Halved</button>
            <button type="button" disabled={busy} onClick={() => void mark('b')} className="min-h-12 rounded-button t-label press ch-focus px-2 truncate"
              style={{ backgroundColor: c.b.fill, color: c.b.on }}>{tie.names.b}</button>
          </div>
          {marked?.marked && hole === Math.max(...match.holes.filter(h => h.w !== null).map(h => h.n)) && (
            <button type="button" disabled={busy} onClick={() => void mark(null)} className={`${buttonClass('quiet', false, true)} mt-1`}>Take hole {hole} off</button>
          )}
          {amending && (
            <button type="button" onClick={() => { setAmending(false); setHole(match.next) }} className={`${buttonClass('quiet', false, true)} mt-1`}>Back to the next hole</button>
          )}
        </div>
      )}
      {!done && tie.may && scoredHere && (
        <p className="t-cap text-ink/80 mt-4">Hole {hole} has scores on the card — change them there.</p>
      )}

      {!done && tie.may && (
        <div className="mt-5 border-t border-line pt-3">
          {!resultOnly ? (
            <button type="button" onClick={() => setResultOnly(true)} className={buttonClass('quiet', false, true)}>Just the result</button>
          ) : (
            <div>
              <p className="t-label text-ink">Who won the match?</p>
              <div className="grid grid-cols-3 gap-2 mt-2" role="radiogroup" aria-label="Who won the match">
                {(['a', 'halved', 'b'] as const).filter(w => !(match.playoff && w === 'halved')).map(w => (
                  <button key={w} type="button" role="radio" aria-checked={winner === w} onClick={() => setWinner(w)}
                    className={`min-h-12 rounded-button t-label press ch-focus px-2 truncate ${winner === w ? 'ring-2 ring-accent-deep ring-offset-1 ring-offset-surface' : ''} ${w === 'halved' ? 'bg-surface border border-line shadow-raised text-ink' : ''}`}
                    style={w === 'halved' ? undefined : { backgroundColor: c[w].fill, color: c[w].on }}>
                    {w === 'halved' ? 'Halved' : tie.names[w]}
                  </button>
                ))}
              </div>
              {winner && winner !== 'halved' && (
                <label className="block mt-3">
                  <span className="t-cap text-ink/80">By how much — leave it if nobody knows</span>
                  <select value={margin} onChange={e => setMargin(e.target.value)} className={`${FIELD} mt-1`}>
                    <option value="">Not known</option>
                    {MARGINS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              )}
              <div className="flex gap-2 mt-3">
                <button type="button" disabled={busy || !winner} onClick={() => void ask({ action: 'match.result', result: winner, margin: margin || null })}
                  className={buttonClass('primary', false)}>Save the result</button>
                <button type="button" onClick={() => { setResultOnly(false); setWinner(null); setMargin('') }} className={buttonClass('quiet', false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <Link href={`${tripBase(tie.code, 'tournament')}/session/${match.roundId}/match/${match.slot}/card`}
        className={`${buttonClass('secondary', true)} mt-4`}>{done ? 'See the card' : 'Score it on the card'}</Link>
    </div>
  )
}
