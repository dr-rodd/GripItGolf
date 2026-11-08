'use client'

import { createPortal } from 'react-dom'
import DotBloom from '@/app/components/DotBloom'
import { buttonClass } from '@/app/components/ui'
import { type CardHole, type CardSideKey, type CardSideView, type HoleOutcome } from '@/lib/matchCard'
import { MatchScoresTable } from './MatchScorecard'
import type { SideColour } from '@/lib/matchSides'

/**
 * The end of a match (Ross, 26 Oct 2026): once the card is settled, a sheet
 * says how it finished and offers the choices — just those (Ross, 26 Oct). **Finalise**
 * is what puts the result into the bracket — the card no longer does that by
 * itself — and the sheet then turns into the match card: every hole played,
 * each player's score, the hole marked in the colour of whoever won it and
 * the brown for a half. "Go back and fix it" closes the sheet on the last
 * hole; a Finalise button stays on the card until somebody does.
 *
 * `confirm` asks; `done` shows the card — straight after finalising, with
 * the dot's bloom, or later from the card's Match card button, without.
 */
export default function MatchFinish({
  phase, bloom, a, b, colours, holes, outcomes, scores, headline, winner, saving, error,
  onFinalise, onFix, onClose, canContinue, onContinue,
}: {
  phase: 'confirm' | 'done'
  /** Straight after finalising: the one celebration. */
  bloom: boolean
  a: CardSideView
  b: CardSideView
  colours: Record<CardSideKey, SideColour>
  holes: CardHole[]
  outcomes: HoleOutcome[]
  scores: Record<string, Record<number, number | null>>
  /** "Xavier wins 3&2" */
  headline: string
  winner: CardSideKey | null
  saving: boolean
  error: string | null
  onFinalise: () => void
  onFix: () => void
  /** Holes still to play after it was settled: the group may play them out. */
  canContinue: boolean
  onContinue: () => void
  onClose: () => void
}) {
  const sheet = (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={phase === 'done' ? onClose : undefined}>
      <div className="absolute inset-0 bg-ink/50 page-enter" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={phase === 'confirm' ? 'The match is over' : 'Match card'}
        className="relative paper border-t border-line rounded-t-sheet shadow-floating-up px-5 pt-5 sheet-up max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="max-w-lg mx-auto">
          {/* The mark: the green dot, blooming once when the result goes in. */}
          <div className="flex flex-col items-center text-center">
            {phase === 'done' && bloom
              ? <DotBloom size={56} />
              : <span className="w-3.5 h-3.5 rounded-full bg-accent" aria-hidden="true" />}
            <p className="t-cap text-ink/65 mt-3">{phase === 'confirm' ? 'Match over' : 'Final result'}</p>
            <p className="t-h1 text-ink mt-1 flex items-center gap-2.5">
              {winner && <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: colours[winner].fill }} aria-hidden="true" />}
              {headline}
            </p>
          </div>

          {phase === 'confirm' ? (
            <>
              {error && <p className="text-rust-deep text-sm text-center leading-snug mt-3">{error}</p>}
              <button type="button" onClick={onFinalise} disabled={saving} className={`${buttonClass('primary')} mt-5`}>
                {saving ? 'Finalising…' : 'Yes — finalise the match'}
              </button>
              <button type="button" onClick={onFix} disabled={saving} className={`${buttonClass('secondary')} mt-2`}>
                No — go back and amend the scores
              </button>
              {canContinue && (
                <button type="button" onClick={onContinue} disabled={saving} className={`${buttonClass('secondary')} mt-2`}>
                  Keep scoring — play out the 18
                </button>
              )}
            </>
          ) : (
            <>
              <div className="mt-5">
                <MatchScoresTable a={a} b={b} colours={colours} holes={holes} outcomes={outcomes} scores={scores} finishedOnly />
              </div>
              <button type="button" onClick={onClose} className={`${buttonClass('secondary')} mt-4`}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
  return createPortal(sheet, document.body)
}
