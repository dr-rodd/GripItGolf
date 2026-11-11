'use client'

import { useState } from 'react'
import { MAX_PASSCODE } from '@/lib/passcode'
import { FIELD, buttonClass } from './ui'
import { unlockWithPin } from '@/lib/entryClient'
import { unlockError } from './OrganiserLock'
import ForgotPin, { ForgotPinLink } from './ForgotPin'

/**
 * The organiser PIN, asked in place rather than as a wall.
 *
 * PasscodeGate stands in front of whole screens; this sits inside one — the
 * tee sheet, the teams join screen — where the page is for everybody and
 * only the *editing* is the organiser's. A quiet row offers the unlock, the
 * PIN opens inline, and success writes the same memory on this phone the
 * gate writes, so unlocking here unlocks everything for twelve hours — one
 * PIN, one memory. The server checks the PIN (stage 4, D64); drawn only
 * where the event has one.
 */
export default function InlineUnlock({
  tripCode, onUnlocked, prompt = 'Organiser? Enter your PIN to edit.', isTrip = false,
}: {
  tripCode: string
  onUnlocked: () => void
  prompt?: string
  /** A trip's: its Trip Setup passcode, in the Forgot words. */
  isTrip?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await unlockWithPin(tripCode, code)
    if (r === 'ok') {
      onUnlocked()
    } else {
      setError(unlockError(r))
      setCode('')
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="t-cap text-accent-deep hover:text-accent transition-colors"
      >
        {prompt}
      </button>
    )
  }

  if (forgot) {
    return <ForgotPin tripCode={tripCode} isTrip={isTrip} onBack={() => setForgot(false)} />
  }

  return (
    <div className="flex flex-col items-start">
    <form onSubmit={submit} className="flex items-center gap-2 w-full">
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="PIN"
        maxLength={MAX_PASSCODE}
        className={`${FIELD} field-dense flex-1 min-w-0`}
      />
      <button
        type="submit"
        disabled={busy || code.length === 0}
        className={`${buttonClass('primary', false, true)} flex-shrink-0`}
      >
        {busy ? '…' : 'Unlock'}
      </button>
      {error && <span className="t-cap text-rust-deep flex-shrink-0">{error}</span>}
    </form>
    <ForgotPinLink isTrip={isTrip} onClick={() => { setError(''); setForgot(true) }} />
    </div>
  )
}
