'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { scoreOutbox } from '@/app/scoring/outbox'
import { cardHasScores, voidMatchCard } from '@/lib/matchCardVoid'
import { useUnlocked } from '@/app/components/useUnlocked'
import { FIELD, buttonClass, cardClass } from '@/app/components/ui'

/**
 * Which tee each player in a session match plays off — the shots come off
 * it. Set on the match (`session_matches.tees`); untouched, each plays the
 * tee the round recorded, else the middle of their own (lib/sessions.ts
 * `defaultTeeIndex`). Folded away under one line.
 *
 * **Fixed once the card has a score** (Ross, 10 Nov 2026): changing a tee
 * under a card in play re-worked the shots on holes already played. The way
 * to change one is to void the card (lib/matchCardVoid.ts) — its players
 * or the organiser — then change the tee and start again. A finished match
 * is fixed for good here; the organiser reopens it on the card.
 */
export default function SessionTees({
  tripId, matchId, players, tees, choices, underWay = false, finished = false, tripCode, pinSet, inMatch = false,
}: {
  tripId: string
  matchId: string
  players: { id: string; name: string }[]
  tees: Record<string, string>
  choices: Record<string, { id: string; name: string }[]>
  /** The card has a score on it. */
  underWay?: boolean
  /** The match has a result. */
  finished?: boolean
  tripCode: string
  pinSet: boolean
  /** This phone is one of the match's players. */
  inMatch?: boolean
}) {
  const router = useRouter()
  const [unlocked] = useUnlocked(tripCode)
  const [open, setOpen] = useState(false)
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mayVoid = inMatch || unlocked || !pinSet
  const fixed = underWay || finished
  const nameOf = (pid: string) => choices[pid]?.find(t => t.id === tees[pid])?.name ?? '—'
  const set = async (pid: string, teeId: string) => {
    setError(null)
    // A card started meanwhile on another phone fixes the tees too.
    if (await cardHasScores(supabase, 'session', tripId, matchId)) {
      setError('Somebody has started scoring this match — void the card to change a tee.')
      router.refresh()
      return
    }
    const { error: err } = await supabase.from('session_matches')
      .update({ tees: { ...tees, [pid]: teeId }, updated_at: new Date().toISOString() })
      .eq('id', matchId).eq('trip_id', tripId)
    if (err) setError('Could not change the tee — try again')
    else router.refresh()
  }
  const voidCard = async () => {
    setVoiding(true)
    setError(null)
    const res = await voidMatchCard(supabase, 'session', tripId, matchId)
    setVoiding(false)
    setConfirmVoid(false)
    if (!res.ok) { setError(res.reason); return }
    // Anything this phone still held for the card goes with it, or a late send would put it back.
    scoreOutbox().discardMatch(matchId)
    router.refresh()
  }
  return (
    <div className={`mb-3 px-3 py-2 ${cardClass('flat')}`}>
      <button type="button" className="w-full text-left t-cap text-ink/65" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        Tees: {players.map(p => `${p.name.split(' ')[0]} ${nameOf(p.id)}`).join(' · ')} {open ? '▴' : '▾'}
      </button>
      {open && !fixed && (
        <div className="mt-2 space-y-2">
          {players.map(p => (
            <label key={p.id} className="flex items-center justify-between gap-3">
              <span className="t-label text-ink">{p.name}</span>
              <select className={`${FIELD} max-w-[55%]`} value={tees[p.id] ?? ''} onChange={e => set(p.id, e.target.value)}>
                {(choices[p.id] ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {open && finished && (
        <p className="t-cap text-ink/65 mt-2 leading-snug">The match is finished, so its tees are fixed.</p>
      )}
      {open && underWay && !finished && (
        <div className="mt-2">
          <p className="t-cap text-ink/65 leading-snug">
            The card has scores on it, so the tees are fixed. To change one, void the card: every score on it is
            deleted and the match starts again from the 1st.
          </p>
          {!mayVoid ? (
            <p className="t-cap text-ink/65 mt-2 leading-snug">The match’s players or the organiser can void it.</p>
          ) : confirmVoid ? (
            <div className="mt-2">
              <p className="t-label text-ink mb-2">Void the card? Every score on it is deleted.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void voidCard()} disabled={voiding} className={buttonClass('danger', false, true)}>
                  {voiding ? 'Voiding…' : 'Void it'}
                </button>
                <button type="button" onClick={() => setConfirmVoid(false)} disabled={voiding} className={buttonClass('secondary', false, true)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmVoid(true)} className={`${buttonClass('secondary', false, true)} mt-2`}>
              Void the card
            </button>
          )}
        </div>
      )}
      {error && <p className="t-cap text-rust-deep mt-2">{error}</p>}
    </div>
  )
}
