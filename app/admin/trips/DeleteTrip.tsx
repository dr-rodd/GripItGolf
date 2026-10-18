'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FIELD, buttonClass } from '@/app/components/ui'
import { deleteTripAction, type DeleteTripResult } from './actions'

const IDLE: DeleteTripResult = { error: null, deleted: false }

/**
 * The delete control on one trip row.
 *
 * Quiet until asked: a small Delete that opens into a retype-the-code
 * confirmation. Everything the trip owns goes with it — players, rounds,
 * scores, scorecards — and the confirmation says so before the button that
 * does it.
 */
export default function DeleteTrip({
  tripId, tripCode, tripName,
}: {
  tripId: string
  tripCode: string | null
  tripName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: DeleteTripResult, formData: FormData) => {
      const result = await deleteTripAction(tripId, prev, formData)
      if (result.deleted) router.refresh()
      return result
    },
    IDLE,
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-rust-deep/80 text-[13px] tracking-[0.12em] uppercase hover:text-rust-deep transition-colors"
      >
        Delete
      </button>
    )
  }

  const token = tripCode ?? tripName

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-xs">
      <p className="text-rust-deep text-[13px] leading-snug text-left">
        This deletes {tripName} whole — players, rounds, scores, scorecards.
        It cannot be undone. Type <span className="font-bold tabular-nums">{token}</span> to
        confirm.
      </p>
      <input
        name="confirm"
        autoComplete="off"
        placeholder={token}
        className={`${FIELD} field-dense`}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass('danger', false)}>
          {pending ? 'Deleting…' : 'Delete trip'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className={buttonClass('quiet', false)}
        >
          Keep it
        </button>
      </div>
      {state.error && (
        <p className="text-rust-deep text-[13px] leading-snug text-left">{state.error}</p>
      )}
    </form>
  )
}
