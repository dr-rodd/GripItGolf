'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import BackButton from '@/app/components/BackButton'
import { verifyPasscode, rememberUnlock, hasUnlocked, MAX_PASSCODE } from '@/lib/passcode'

/**
 * Stands in front of trip settings when the trip was created with a passcode.
 *
 * A soft lock — see the note at the top of lib/passcode.ts. It keeps a player
 * from wandering into settings and changing the format mid-trip; it is not a
 * security boundary, and should be replaced by real ownership when auth lands.
 */
export default function PasscodeGate({
  tripCode, tripName, passcodeHash, children, title, hint,
}: {
  tripCode: string
  tripName: string
  passcodeHash: string
  children: React.ReactNode
  /**
   * What the locked screen calls itself. The defaults are Trip Setup's; the
   * organiser area hands in its own words and the same lock does the work —
   * one gate, one sessionStorage memory, so unlocking either unlocks both,
   * which is the point of one PIN.
   */
  title?: string
  hint?: string
}) {
  // sessionStorage is browser-only, so it is read through an external store
  // rather than an effect: the server renders locked, and the client corrects
  // it on hydration. Failing closed is the right way round for a lock.
  const remembered = useSyncExternalStore(
    useCallback(() => () => {}, []),   // does not change while the page is open
    useCallback(() => hasUnlocked(tripCode), [tripCode]),
    () => false,
  )
  const [justUnlocked, setJustUnlocked] = useState(false)
  const unlocked = remembered || justUnlocked

  const [code, setCode]   = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const ok = await verifyPasscode(code, passcodeHash)
    if (ok) {
      rememberUnlock(tripCode)
      setJustUnlocked(true)
    } else {
      setError('Incorrect code.')
      setCode('')
    }
    setBusy(false)
  }

  if (unlocked) return <>{children}</>

  return (
    <main className="min-h-dvh bg-cream flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <div className="w-14 h-14 rounded-full border border-accent/40 bg-accent/10 flex items-center justify-center mx-auto mb-6">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0A9D56"
               strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink leading-tight mb-2">
          {title ?? 'Settings are locked'}
        </h1>
        <p className="text-ink/65 text-sm mb-8 leading-relaxed">
          {hint ?? `${tripName} was set up with a passcode. Ask your lead player!`}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="Passcode"
            maxLength={MAX_PASSCODE}
            autoFocus
            className="w-full py-4 px-5 bg-surface border border-bark/12 rounded-xl text-ink text-center text-lg tracking-[0.3em] placeholder:tracking-normal placeholder:text-ink/50 focus:outline-none focus:border-accent/60 transition-colors"
          />

          {error && <p className="text-rust-deep text-sm">{error}</p>}

          <button
            type="submit"
            disabled={busy || !code}
            className="w-full py-4 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40"
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>

        <div className="mt-8">
          <BackButton href={`/trip/${tripCode}`} label="Trip" />
        </div>
      </div>
    </main>
  )
}
