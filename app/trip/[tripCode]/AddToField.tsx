'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { readHandicapField, isPlusHandicap, PLUS_HANDICAP_WARNING } from '@/lib/handicap'
import { duplicateName, duplicateNameError, isDuplicateNameError } from '@/lib/roster'
import { syncRoundHandicaps } from '@/lib/roundHandicaps'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import { Sheet } from '@/app/components/ItineraryForms'
import HandicapField from '@/app/components/HandicapField'
import InlineUnlock from '@/app/components/InlineUnlock'
import { FIELD, FIELD_LABEL, cardClass, chipClass } from '@/app/components/ui'
import { IconPlus } from '@/app/components/icons'

/**
 * Adding a player to an event's field, from the hub where the field is
 * read (docs/event-use-cases.md, Ross's answer 7).
 *
 * Somebody else's name, not your own — the join screen is where a player
 * adds themselves and claims the slot. This puts an unclaimed name on the
 * field for its owner to claim, the way the organiser's own list in Trip
 * Setup always has. Anyone may when the organiser has switched on
 * `add_players`; otherwise the organiser, with the PIN asked in place.
 *
 * A handicap left blank is pending, never scratch (lib/handicap.ts): the
 * name goes on and its round snapshots wait for the figure. A given one is
 * snapshotted onto every round that already exists, as a late join is.
 */
export default function AddToField({
  tripId, tripCode, roundIds, players, fieldMayAdd, passcodeHash,
}: {
  tripId: string
  tripCode: string
  /** Every round the event has, for the newcomer's handicap snapshots. */
  roundIds: string[]
  /** The field as it stands — two people cannot share a name. */
  players: { id: string; name: string }[]
  /** `add_players` is on: anyone adds to the field without the PIN. */
  fieldMayAdd: boolean
  passcodeHash: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [name, setName] = useState('')
  const [handicap, setHandicap] = useState('')
  const [gender, setGender] = useState<'M' | 'F'>('M')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const mayAdd = fieldMayAdd || unlocked || !isLocked(passcodeHash)

  function openSheet() {
    // The unlock lives in sessionStorage — read on tap, never in render.
    setUnlocked(hasUnlocked(tripCode))
    setName('')
    setHandicap('')
    setGender('M')
    setError(null)
    setOpen(true)
  }

  async function add() {
    if (!mayAdd) { setError('Adding to the field needs the organiser PIN.'); return }
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a name first.'); return }
    const hcp = readHandicapField(handicap)
    if (hcp === undefined) {
      setError('That handicap does not read as a number — clear it to leave it pending.')
      return
    }
    if (duplicateName(trimmed, players)) { setError(duplicateNameError(trimmed)); return }
    if (isPlusHandicap(hcp) && !window.confirm(PLUS_HANDICAP_WARNING)) return

    setSaving(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('players')
      .insert({ trip_id: tripId, name: trimmed, handicap: hcp, gender, role: 'player' })
      .select('id')
      .single()
    if (err || !data) {
      // Another phone may have taken the name since the check above.
      setError(isDuplicateNameError(err) ? duplicateNameError(trimmed) : 'Could not add the player — try again.')
      setSaving(false)
      return
    }

    if (hcp !== null) {
      const hcpErr = await syncRoundHandicaps(roundIds, data.id, hcp)
      if (hcpErr) {
        setSaving(false)
        setError(`${trimmed} is on the field, but their round handicaps did not save — re-enter it in Trip Setup.`)
        router.refresh()
        return
      }
    }
    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="w-full mt-3 py-3 flex items-center justify-center gap-2 border border-dashed border-line-strong rounded-xl text-ink/65 text-sm hover:text-ink/80 transition-colors"
      >
        <IconPlus size={16} />
        Add a player
      </button>

      {open && (
        <Sheet
          title="Add to the field"
          onClose={() => !saving && setOpen(false)}
          onAdd={add}
          addLabel={saving ? 'Adding…' : 'Add player'}
          error={error}
        >
          {!mayAdd && passcodeHash && (
            <div className={`p-4 ${cardClass()}`}>
              <p className="text-ink text-sm font-medium">The organiser adds to the field</p>
              <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
                Enter the organiser PIN to carry on. Joining yourself is on the join screen.
              </p>
              <InlineUnlock
                tripCode={tripCode}
                passcodeHash={passcodeHash}
                onUnlocked={() => setUnlocked(true)}
                prompt="Enter the PIN"
              />
            </div>
          )}

          <div>
            <label className={FIELD_LABEL} htmlFor="field-name">Name</label>
            <input
              id="field-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="off"
              className={FIELD}
            />
          </div>

          <div>
            <label className={FIELD_LABEL}>Handicap</label>
            <HandicapField value={handicap} onChange={setHandicap} placeholder="Leave blank if unknown" className={FIELD} />
            <p className="t-cap text-ink/65 mt-2 leading-snug">
              Blank is pending, not scratch. They can add it when they claim their name.
            </p>
          </div>

          <div className="flex gap-1.5">
            {(['M', 'F'] as const).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                aria-pressed={gender === g}
                className={`${chipClass(gender === g)} flex-1`}
              >
                {g}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
