'use client'

import { useState } from 'react'
import { verifyPasscode, rememberUnlock, MAX_PASSCODE } from '@/lib/passcode'

/**
 * The organiser PIN, asked in place rather than as a wall.
 *
 * PasscodeGate stands in front of whole screens; this sits inside one — the
 * tee sheet, the teams join screen — where the page is for everybody and
 * only the *editing* is the organiser's. A quiet row offers the unlock, the
 * PIN opens inline, and success writes the same sessionStorage memory the
 * gate writes (`rememberUnlock`), so unlocking here unlocks everything for
 * the session — one PIN, one memory.
 *
 * The same soft lock as ever: verification is the client comparing a hash
 * the server already sent (lib/passcode.ts's note holds).
 */
export default function InlineUnlock({
  tripCode, passcodeHash, onUnlocked, prompt = 'Organiser? Enter your PIN to edit.',
}: {
  tripCode: string
  passcodeHash: string
  onUnlocked: () => void
  prompt?: string
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const ok = await verifyPasscode(code, passcodeHash)
    if (ok) {
      rememberUnlock(tripCode)
      onUnlocked()
    } else {
      setError('Incorrect code.')
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

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="PIN"
        maxLength={MAX_PASSCODE}
        className="flex-1 min-w-0 bg-surface border border-bark/12 rounded-lg px-3 py-2 text-ink text-sm placeholder:text-ink/50 focus:outline-none focus:border-accent/50 transition-colors"
      />
      <button
        type="submit"
        disabled={busy || code.length === 0}
        className="flex-shrink-0 px-4 py-2 bg-accent-deep text-white text-sm font-medium rounded-lg hover:bg-accent transition-colors disabled:opacity-40"
      >
        {busy ? '…' : 'Unlock'}
      </button>
      {error && <span className="t-cap text-rust-deep flex-shrink-0">{error}</span>}
    </form>
  )
}
