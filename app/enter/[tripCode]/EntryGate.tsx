'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MAX_PASSCODE } from '@/lib/passcode'
import { FIELD, buttonClass } from '@/app/components/ui'
import LegalLinks from '@/app/components/LegalLinks'
import { openDoor } from '@/lib/entryClient'
import { unlockError } from '@/app/components/OrganiserLock'

/**
 * The public PIN, asked once per phone. The event's own PIN lets the field
 * in; the admin PIN does too — and unlocks the organiser's side for the
 * session as well, so the organiser types one code, not two.
 *
 * The server checks it and sets this phone's cookie (/api/event/door,
 * row-level security stage 4, D64): no hash ever reaches the phone.
 */
export default function EntryGate({ tripCode, home, eventName }: {
  tripCode: string
  /** Where the event lives once entered — `/event/X` (lib/tripPaths.ts). */
  home: string
  eventName: string
}) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await openDoor(tripCode, code)
    if (r !== 'ok') {
      setError(r === 'wrong' ? 'That PIN is not this event’s.' : unlockError(r))
      setCode('')
      setBusy(false)
      return
    }
    router.replace(home)
    router.refresh()
  }

  return (
    <main className="min-h-dvh paper flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <div className="w-14 h-14 rounded-full border border-line-strong bg-accent-tint flex items-center justify-center mx-auto mb-6 text-accent-deep">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        <h1 className="t-h1 text-ink mb-2">{eventName}</h1>
        <p className="text-ink/65 text-sm mb-8 leading-relaxed">
          This event has a PIN. Ask the event organiser for it — you only enter it once on this phone.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="PIN"
            maxLength={MAX_PASSCODE}
            autoFocus
            aria-label="The event's PIN"
            className={`${FIELD} field-code`}
          />
          {error && <p className="text-rust-deep text-sm">{error}</p>}
          <button type="submit" disabled={busy || !code} className={buttonClass('primary')}>
            {busy ? 'Checking…' : 'Enter the event'}
          </button>
        </form>

        <p className="mt-8 t-cap">
          <Link href="/" className="text-accent-deep hover:text-accent">Not this event? Back to the start</Link>
        </p>
        <div className="mt-6">
          <LegalLinks />
        </div>
      </div>
    </main>
  )
}
