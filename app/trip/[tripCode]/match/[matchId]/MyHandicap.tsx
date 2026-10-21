'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatHandicap, readHandicapField, isPlusHandicap, PLUS_HANDICAP_WARNING } from '@/lib/handicap'
import { syncRoundHandicaps } from '@/lib/roundHandicaps'
import HandicapField from '@/app/components/HandicapField'
import { FIELD, FIELD_LABEL, buttonClass, cardClass } from '@/app/components/ui'

/**
 * Your own handicap, amended before a match — Ross's story: tapping into
 * the next match, a player can amend their handicap. Written where Trip
 * Setup writes it (`players.handicap`, then the round snapshots through
 * `syncRoundHandicaps`), so every screen reads the same figure. A cleared
 * box is left as it was rather than saved as pending: a match needs one.
 */
export default function MyHandicap({ tripId, playerId, handicap, roundIds }: {
  tripId: string
  playerId: string
  handicap: number | null
  roundIds: string[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(handicap == null ? '' : formatHandicap(handicap))
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    const next = readHandicapField(value)
    if (next === undefined || next === null) {
      setNote({ ok: false, text: 'Enter your handicap index as a number.' })
      return
    }
    if (next === handicap) { setNote({ ok: true, text: 'That is your handicap already.' }); return }
    if (isPlusHandicap(next) && !window.confirm(PLUS_HANDICAP_WARNING)) return
    setSaving(true)
    setNote(null)
    const { error } = await supabase.from('players').update({ handicap: next })
      .eq('id', playerId).eq('trip_id', tripId)
    if (error) {
      setSaving(false)
      setNote({ ok: false, text: 'Could not save your handicap — try again.' })
      return
    }
    const hcpErr = await syncRoundHandicaps(roundIds, playerId, next)
    setSaving(false)
    setNote(hcpErr
      ? { ok: false, text: 'Saved, but the rounds could not be updated — try again.' }
      : { ok: true, text: 'Handicap saved.' })
    router.refresh()
  }

  return (
    <div className={`p-4 ${cardClass()}`}>
      <label className={FIELD_LABEL}>Your handicap index</label>
      <HandicapField value={value} onChange={setValue} className={FIELD} />
      <div className="mt-3">
        <button type="button" onClick={save} disabled={saving} className={buttonClass('secondary', true, true)}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {note && (
        <p className={`t-cap mt-2 ${note.ok ? 'text-accent-deep' : 'text-rust-deep'}`}>{note.text}</p>
      )}
    </div>
  )
}
