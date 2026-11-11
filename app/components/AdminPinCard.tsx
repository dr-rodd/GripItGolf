'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAX_PASSCODE, passcodeError } from '@/lib/passcode'
import { setAdminPin } from '@/lib/entryClient'
import { FIELD, buttonClass, chipClass } from './ui'

/**
 * Who can change the event: its organiser PIN — on a trip, its passcode —
 * set, changed, or (a trip only) taken off, after creation (Ross, 11 Nov
 * 2026: trips on the events' model). **Through the server** (D65): the
 * current PIN is asked when there is one, the new one is stored salted and
 * slow, and this phone becomes the organiser for twelve hours while every
 * other phone stops being one. A trip with no passcode is anybody's to
 * change, which is what "Any player" means — the database says the same
 * (migration 071, `organiser_trips()`).
 */
export default function AdminPinCard({ tripCode, pinSet, isTrip }: {
  tripCode: string
  /** Whether there is a PIN now — never the PIN's hash. */
  pinSet: boolean
  /** A trip: a passcode, and "Any player" may take it off. */
  isTrip: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'set' | 'remove'>('idle')
  const [current, setCurrent] = useState('')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = isTrip ? { pin: 'passcode', Pin: 'Passcode' } : { pin: 'PIN', Pin: 'PIN' }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, MAX_PASSCODE)
  const issue = passcodeError(pin) ?? (pin !== again ? `The two ${w.pin}s don’t match.` : null)
  const needsCurrent = pinSet && current.length === 0

  function reset() {
    setMode('idle'); setCurrent(''); setPin(''); setAgain(''); setError(null)
  }

  async function write(next: string | null) {
    setSaving(true)
    setError(null)
    const r = await setAdminPin(tripCode, pinSet ? current : null, next)
    setSaving(false)
    if (!r.ok) {
      setError(r.error)
      setCurrent('')
      return
    }
    reset()
    router.refresh()
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void) => (
    <label className="block" htmlFor={id}>
      <span className="t-label text-ink block mb-1">{label}</span>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete={id.endsWith('current') ? 'off' : 'new-password'}
        value={value}
        onChange={e => set(digits(e.target.value))}
        className={`${FIELD} field-code`}
      />
    </label>
  )
  const currentField = pinSet && field(`admin-pin-${tripCode}-current`, `Current ${w.pin}`, current, setCurrent)

  return (
    <section className={isTrip ? '' : 'mb-10'}>
      {isTrip ? (
        <>
          <p className="t-cap text-ink/65 mb-3 leading-snug">
            Who can change this trip&apos;s players, teams, format and dates.
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={saving}
              onClick={() => { if (pinSet) { reset(); setMode('remove') } else reset() }}
              className={`${chipClass(!pinSet)} flex-1`}>
              Any player
            </button>
            <button type="button" disabled={saving}
              onClick={() => { if (!pinSet) { reset(); setMode('set') } else reset() }}
              className={`${chipClass(pinSet)} flex-1`}>
              Lead player only
            </button>
          </div>
          <p className="t-cap text-ink/65 mt-3 leading-snug">
            {pinSet
              ? 'Changes need the passcode, entered once on a phone for 12 hours — the padlock at the top.'
              : 'Anyone with the trip code can change it. Lead player only asks for a passcode.'}
          </p>
        </>
      ) : (
        <>
          <h2 className="t-h2 text-ink mb-1">Organiser PIN</h2>
          <p className="text-ink/65 text-[13px] mb-3 leading-snug">
            Changing it ends organiser access on every other phone. This phone stays the organiser for 12 hours.
          </p>
        </>
      )}

      {mode === 'set' ? (
        <div className="space-y-3 mt-3">
          {currentField}
          {field(`admin-pin-${tripCode}-new`, `New ${w.pin}`, pin, setPin)}
          {field(`admin-pin-${tripCode}-again`, 'Type it again', again, setAgain)}
          <p className="t-cap text-ink/65">4 to 8 digits.</p>
          {pin.length > 0 && again.length >= pin.length && issue && <p className="t-cap text-rust-deep">{issue}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={saving || !!issue || needsCurrent} onClick={() => { void write(pin) }} className={buttonClass('primary', false)}>
              {saving ? 'Saving…' : `Save ${w.pin}`}
            </button>
            <button type="button" disabled={saving} onClick={reset} className={buttonClass('quiet', false)}>Cancel</button>
          </div>
        </div>
      ) : mode === 'remove' ? (
        <div className="space-y-3 mt-3">
          <p className="text-ink/65 text-[13px] leading-snug">Anybody with the trip code will be able to change the trip again.</p>
          {currentField}
          <div className="flex gap-2">
            <button type="button" disabled={saving || needsCurrent} onClick={() => { void write(null) }} className={buttonClass('primary', false)}>
              {saving ? 'Saving…' : 'Take the passcode off'}
            </button>
            <button type="button" disabled={saving} onClick={reset} className={buttonClass('quiet', false)}>Cancel</button>
          </div>
        </div>
      ) : pinSet || !isTrip ? (
        <div className={isTrip ? 'mt-3' : ''}>
          <button type="button" onClick={() => { reset(); setMode('set') }} className={buttonClass('secondary', false)}>
            {pinSet ? `Change the ${w.pin}` : `Set an organiser ${w.pin}`}
          </button>
        </div>
      ) : null}
      {error && <p className="text-rust-deep text-sm mt-3 leading-snug">{error}</p>}
    </section>
  )
}
