'use client'

import { useEffect, useState } from 'react'
import { FIELD, FIELD_LABEL, buttonClass } from '@/app/components/ui'
import { askInterclub } from '@/lib/interclubClient'

/**
 * How the inter-club draws spell the club (D358, docs/interclub.md) — set
 * where they spell it differently, so its matches are found ("Co. Sligo"
 * for County Sligo Golf Club). Blank is the club's own name. In Club
 * settings for its Clubhouse, and on a draw page for its team captains.
 */
export default function DrawNameField({ clubId, onSaved, compact = false }: {
  clubId: string
  onSaved?: (drawName: string) => void
  compact?: boolean
}) {
  const [clubName, setClubName] = useState('')
  const [value, setValue] = useState('')
  const [ready, setReady] = useState(true)
  const [busy, setBusy] = useState(false)
  const [say, setSay] = useState<{ text: string; bad?: boolean } | null>(null)

  useEffect(() => {
    let live = true
    void askInterclub({ action: 'name.get', clubId }).then(r => {
      if (!live || !r.ok) return
      setClubName(String(r.clubName ?? ''))
      setValue(typeof r.name === 'string' ? r.name : '')
      setReady(r.ready !== false)
    })
    return () => { live = false }
  }, [clubId])

  async function save() {
    setBusy(true); setSay(null)
    const r = await askInterclub({ action: 'name.set', clubId, name: value })
    setBusy(false)
    if (!r.ok) { setSay({ text: r.error, bad: true }); return }
    const saved = typeof r.name === 'string' ? r.name : ''
    setValue(saved)
    setSay({ text: 'Saved.' })
    onSaved?.(saved || clubName)
  }

  return (
    <div>
      {!compact && <h2 className="t-h2 text-ink">Name in the inter-club draws</h2>}
      {!compact && (
        <p className="text-ink/65 text-sm mt-1">
          Only where Golf Ireland’s draws spell the club differently — so your team captains find its matches.
        </p>
      )}
      <label className={`${FIELD_LABEL} ${compact ? '' : 'mt-4'}`} htmlFor={`draw-name-${clubId}`}>As the draws spell it</label>
      <div className="flex gap-2">
        <input
          id={`draw-name-${clubId}`}
          className={FIELD}
          value={value}
          maxLength={80}
          placeholder={clubName || 'The club’s own name'}
          onChange={e => setValue(e.target.value)}
          disabled={!ready || busy}
        />
        <button type="button" onClick={() => void save()} disabled={!ready || busy} className={buttonClass('secondary', false)}>
          Save
        </button>
      </div>
      {!ready && <p className="t-cap text-ink/65 mt-2">Not set up yet — try again later.</p>}
      {say && <p className={`t-cap mt-2 ${say.bad ? 'text-rust-deep' : 'text-ink/65'}`} role={say.bad ? 'alert' : undefined}>{say.text}</p>}
    </div>
  )
}
