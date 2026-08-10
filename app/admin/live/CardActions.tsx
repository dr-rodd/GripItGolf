'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass } from '@/app/components/ui'
import { closeCard, voidCard } from './actions'

/**
 * Close and Void, on one card.
 *
 * Close is one tap — it keeps every score and can be undone by hand if it
 * ever needs to be. Void is destructive and gets the two-step treatment: the
 * first tap turns the button into a confirmation that says exactly what will
 * be erased, the second does it. Tapping anywhere else (Keep it) backs out.
 */
export default function CardActions({
  liveRoundId, roundId, status, playerCount, holesEntered,
}: {
  liveRoundId: string
  roundId: string
  status: string
  playerCount: number
  holesEntered: number
}) {
  const router = useRouter()
  const [confirmingVoid, setConfirmingVoid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ error: string | null }>) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      setError(result.error)
      setConfirmingVoid(false)
      if (!result.error) router.refresh()
    })
  }

  const players = playerCount === 1 ? '1 player' : `${playerCount} players`
  const holes = holesEntered === 1 ? '1 hole' : `${holesEntered} holes`

  return (
    <div className="flex flex-col gap-2">
      {confirmingVoid ? (
        <>
          <p className="text-rust-deep text-[13px] leading-snug">
            Erase {holes} entered by {players} and close the card? This cannot
            be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => voidCard(liveRoundId, roundId))}
              className={buttonClass('danger', false)}
            >
              {pending ? 'Voiding…' : 'Void it'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmingVoid(false)}
              className={buttonClass('quiet', false)}
            >
              Keep it
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          {status === 'active' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => closeCard(liveRoundId))}
              className={buttonClass('secondary', false)}
            >
              {pending ? 'Closing…' : 'Close — keep scores'}
            </button>
          )}
          {status !== 'closed' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => { setError(null); setConfirmingVoid(true) }}
              className={buttonClass('danger', false)}
            >
              Void — erase scores
            </button>
          )}
        </div>
      )}

      {error && <p className="text-rust-deep text-[13px] leading-snug">{error}</p>}
    </div>
  )
}
