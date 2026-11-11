'use client'

import { useEffect, useRef, useState } from 'react'
import { MAX_PASSCODE } from '@/lib/passcode'
import { useUnlocked } from './useUnlocked'
import { IconLock, IconLockOpen } from './icons'
import { FIELD, buttonClass, cardClass } from './ui'
import { lockShut, unlockWithPin } from '@/lib/entryClient'

/**
 * The organiser's lock, at the header's right edge on every page that has
 * organiser settings (Ross, 10 Nov 2026). Shut, a tap gives it a little
 * wobble and opens a small box under it for the PIN; the right PIN opens it
 * and every organiser setting on the page with it. Open, a tap shuts it
 * again — on every page, for this device — so a phone handed round is not
 * left unlocked by accident.
 *
 * The PIN is checked by the server (row-level security stage 4, D64),
 * which makes this phone the organiser for twelve hours; shutting the lock
 * ends that on the server too (D61). The phone remembers only when the
 * twelve hours end, and `useUnlocked` tells every control on the page the
 * moment that changes. An event or trip with no PIN has nothing to unlock,
 * so draws no lock at all.
 */
export default function OrganiserLock({ tripCode, pinSet, isTrip = false }: {
  tripCode: string
  /** Whether the event has an organiser PIN at all — never the PIN's hash. */
  pinSet: boolean
  /** A trip's: its Trip Setup passcode, never an organiser PIN. */
  isTrip?: boolean
}) {
  const [unlocked] = useUnlocked(tripCode)
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Each tap restarts the wobble: a fresh key, a fresh animation.
  const [wobble, setWobble] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  // A tap anywhere else puts the box away.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  if (!pinSet) return null

  const what = isTrip ? 'Trip Setup passcode' : 'organiser PIN'

  function tap() {
    setWobble(n => n + 1)
    setError('')
    if (unlocked) {
      lockShut(tripCode)
      setOpen(false)
      return
    }
    setOpen(o => !o)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await unlockWithPin(tripCode, code)
    setBusy(false)
    setWobble(n => n + 1)
    if (r === 'ok') {
      setOpen(false)
      setCode('')
    } else {
      setError(unlockError(r, what))
      setCode('')
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={tap}
        aria-expanded={unlocked ? undefined : open}
        aria-label={unlocked
          ? 'Organiser settings open — tap to lock them'
          : 'Organiser settings locked — tap to unlock them'}
        className={`w-10 h-10 rounded-tile flex items-center justify-center press ${
          unlocked ? 'text-accent-deep bg-accent-tint' : 'text-ink/65 hover:text-ink'
        }`}
      >
        <span key={wobble} className={`inline-flex ${wobble ? 'lock-wobble' : ''}`}>
          {unlocked ? <IconLockOpen size={20} /> : <IconLock size={20} />}
        </span>
      </button>

      {open && !unlocked && (
        <form
          onSubmit={submit}
          className={`absolute right-0 top-full mt-1 w-64 p-3 ${cardClass('floating')}`}
        >
          <label htmlFor={`lock-${tripCode}`} className="t-label text-ink block mb-2">
            Enter the {what} to open the organiser settings
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`lock-${tripCode}`}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder={isTrip ? 'Passcode' : 'PIN'}
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
          </div>
          {error && <p className="t-cap text-rust-deep mt-2">{error}</p>}
        </form>
      )}
    </div>
  )
}

/** What a PIN that did not open says — the same words in the padlock and every in-place prompt. */
export function unlockError(r: 'wrong' | 'blocked' | 'failed', what = 'PIN'): string {
  if (r === 'wrong') return `That isn’t the ${what}.`
  if (r === 'blocked') return 'Too many tries — wait a few minutes and try again.'
  return 'Could not check the PIN — try again.'
}
