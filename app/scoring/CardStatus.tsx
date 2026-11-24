'use client'

import { useEffect, useState } from 'react'
import { feedCardFor } from '@/lib/entryClient'
import { STATUS_MAX, audienceLabel, counter, type Audience } from '@/lib/feed'
import { FIELD, buttonClass } from '@/app/components/ui'

export type StatusDraft = { playerId: string; text: string; audience: Audience; chosen: boolean }

/**
 * The status on the sign step (D299, D306): optional, 140 characters, on
 * the step after the last score only — never in score entry, never in the
 * way of signing. Drawn only when this phone's Green Dot account is one of
 * the card's players (the server says which, D305); the audience line shows
 * who will see the card in the feed, with a change for this card alone.
 * The draft is the flow's; it is sent once the card is signed.
 */
export default function CardStatus({ tripCode, roundId, playerIds, value, onChange }: {
  tripCode: string
  roundId: string
  playerIds: string[]
  value: StatusDraft | null
  onChange: (next: StatusDraft | null) => void
}) {
  const [asked, setAsked] = useState(false)
  const key = playerIds.join(',')

  useEffect(() => {
    let live = true
    feedCardFor(tripCode, roundId, key.split(',')).then(r => {
      if (!live) return
      setAsked(true)
      onChange(r ? { playerId: r.playerId, text: '', audience: r.audience, chosen: false } : null)
    })
    return () => { live = false }
    // onChange is the flow's setter; asking again only when the card changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripCode, roundId, key])

  if (!asked || !value) return null
  const over = [...value.text].length > STATUS_MAX

  return (
    <div>
      <label htmlFor="card-status" className="block t-label text-ink/80 mb-2">Your status <span className="t-cap text-ink/65">· optional</span></label>
      <input id="card-status" type="text" value={value.text} maxLength={STATUS_MAX} autoComplete="off" enterKeyHint="done"
        placeholder="How did it go?" aria-invalid={over} aria-describedby="card-status-count"
        onChange={e => onChange({ ...value, text: e.target.value })} className={FIELD} />
      <div className="flex items-center justify-between gap-3 mt-1.5">
        <p className="t-cap text-ink/65 min-w-0">
          In the feed: {audienceLabel(value.audience)}
          <button type="button" onClick={() => onChange({ ...value, audience: value.audience === 'me' ? 'wide' : 'me', chosen: true })}
            className={`${buttonClass('quiet', false, true)} ml-1 align-baseline`}>Change</button>
        </p>
        <span id="card-status-count" className={`t-cap flex-shrink-0 ${over ? 'text-rust-deep' : 'text-ink/65'}`}>{counter(value.text)}</span>
      </div>
    </div>
  )
}
