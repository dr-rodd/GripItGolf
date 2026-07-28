'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { verifyPasscode, rememberUnlock, hasUnlocked, MAX_PASSCODE } from '@/lib/passcode'

/**
 * Stands in front of trip settings when the trip was created with a passcode.
 *
 * A soft lock — see the note at the top of lib/passcode.ts. It keeps a player
 * from wandering into settings and changing the format mid-trip; it is not a
 * security boundary, and should be replaced by real ownership when auth lands.
 */
export default function PasscodeGate({
  tripCode, tripName, passcodeHash, children,
}: {
  tripCode: string
  tripName: string
  passcodeHash: string
  children: React.ReactNode
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
      setError('That passcode is not right.')
      setCode('')
    }
    setBusy(false)
  }

  if (unlocked) return <>{children}</>

  return (
    <main className="min-h-dvh bg-[#0a1a0e] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <div className="w-14 h-14 rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/10 flex items-center justify-center mx-auto mb-6">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A84C"
               strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        <h1 className="font-[family-name:var(--font-playfair)] text-2xl text-white leading-tight mb-2">
          Settings are locked
        </h1>
        <p className="text-white/40 text-sm mb-8 leading-relaxed">
          {tripName} was set up with a passcode. Ask whoever created the trip.
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
            className="w-full py-4 px-5 bg-white/5 border border-white/15 rounded-xl text-white text-center text-lg tracking-[0.3em] placeholder:tracking-normal placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/60 transition-colors"
          />

          {error && <p className="text-amber-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={busy || !code}
            className="w-full py-4 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors disabled:opacity-40"
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>

        <Link
          href={`/trip/${tripCode}`}
          className="inline-block text-white/25 text-xs tracking-wide hover:text-white/50 transition-colors mt-8"
        >
          ← Back to trip
        </Link>
      </div>
    </main>
  )
}
