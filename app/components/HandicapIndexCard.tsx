'use client'

import { useEffect, useState } from 'react'
import HandicapField from './HandicapField'
import { FIELD, buttonClass, cardClass } from './ui'
import { accountIndex } from '@/lib/accountClient'
import { indexLabel } from '@/lib/handicapIndex'

/**
 * Your handicap index — one value, on your Green Dot account (D179). Shown
 * on Me and in the club area's Club tab; a club's list shows the same value.
 * Every change goes through the server's one writer, which logs it.
 *
 * `initial` when the page already has it (Me reads it with the rest of the
 * page); left out, the card asks for it after it paints.
 */
export default function HandicapIndexCard({ initial, className = '' }: { initial?: number | null; className?: string }) {
  const [index, setIndex] = useState<number | null | undefined>(initial)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initial !== undefined) return
    let live = true
    accountIndex().then(r => { if (live) setIndex(r.ok ? r.index : null) })
    return () => { live = false }
  }, [initial])

  async function save() {
    setBusy(true); setError('')
    const r = await accountIndex(text)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setIndex(r.index); setEditing(false)
  }

  return (
    <div className={`${cardClass()} px-4 py-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="t-label text-ink">Handicap index</p>
          <p className="t-cap text-ink/65">Yours on every club’s list, and on the cards you start.</p>
        </div>
        {!editing && (
          <span className="t-data text-[20px] text-ink" aria-live="polite">{index === undefined ? '…' : indexLabel(index)}</span>
        )}
      </div>
      {editing ? (
        <div className="mt-4 space-y-3">
          <HandicapField id="my-index" value={text} onChange={setText} placeholder="e.g. 14.2" className={FIELD} />
          {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}
          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={save} className={buttonClass('secondary', false)}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError('') }} className={buttonClass('quiet', false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={index === undefined}
          onClick={() => { setText(index === null || index === undefined ? '' : indexLabel(index)); setEditing(true) }}
          className={`${buttonClass('quiet', false)} mt-2`}>
          {index === null ? 'Add your index' : 'Change'}
        </button>
      )}
    </div>
  )
}
