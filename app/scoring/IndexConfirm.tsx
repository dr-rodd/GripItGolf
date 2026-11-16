'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import HandicapField from '@/app/components/HandicapField'
import { FIELD, buttonClass } from '@/app/components/ui'
import { confirmCompetitionIndex } from '@/lib/entryClient'
import { formatHandicap } from '@/lib/handicap'

/**
 * A club competition's card start sheet (D179): each player's handicap
 * index to confirm before the card starts. A change here is the one value,
 * changed everywhere and logged; the page reads the players again, so the
 * card's snapshot is taken off the confirmed index as it always is.
 */
export default function IndexConfirm({ tripCode, playerId, index }: { tripCode: string; playerId: string; index: number | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true); setError('')
    const r = await confirmCompetitionIndex(tripCode, playerId, text)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="t-cap text-ink/80">Index {index === null ? 'not set' : formatHandicap(index)} — is that right?</p>
        <button type="button" className="t-cap text-accent-deep press" onClick={() => { setText(index === null ? '' : formatHandicap(index)); setEditing(true) }}>
          Change
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <HandicapField value={text} onChange={setText} placeholder="e.g. 14.2" className={FIELD} />
      {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={() => void save()} className={buttonClass('secondary', false, true)}>{busy ? 'Saving…' : 'Save index'}</button>
        <button type="button" onClick={() => setEditing(false)} className={buttonClass('quiet', false, true)}>Cancel</button>
      </div>
    </div>
  )
}
