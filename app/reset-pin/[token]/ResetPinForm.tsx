'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MAX_PASSCODE } from '@/lib/passcode'
import { ORGANISER_HOURS } from '@/lib/membership'
import { RESET_EXPIRED, newPinIssue, resetWords } from '@/lib/pinReset'
import { checkResetLink, saveResetPin, type ResetLink } from '@/lib/entryClient'
import { FIELD, buttonClass } from '@/app/components/ui'

/**
 * Choose a new PIN (D67). The link is checked on arrival — nothing used up
 * — and saving spends it: the PIN is stored salted and slow on the server,
 * every other phone stops being the organiser, and this one is for twelve
 * hours, landing in the organiser area unlocked.
 */
export default function ResetPinForm({ resetToken }: { resetToken: string }) {
  const router = useRouter()
  const [link, setLink] = useState<ResetLink | null>(null)
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    checkResetLink(resetToken).then(r => { if (live) setLink(r) })
    return () => { live = false }
  }, [resetToken])

  if (!link) {
    return <main className="min-h-dvh paper" aria-busy="true" />
  }

  if (!link.ok) {
    return (
      <main className="min-h-dvh paper flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <h1 className="t-h1 text-ink mb-3">Choose a new PIN</h1>
          <p className="text-ink/65 text-sm leading-relaxed">{link.error}</p>
          <p className="mt-8 t-cap">
            <Link href="/" className="text-accent-deep hover:text-accent">Back to the start</Link>
          </p>
        </div>
      </main>
    )
  }

  const w = resetWords(link.isTrip)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const issue = newPinIssue(pin, again)
    if (issue) { setError(issue); return }
    setBusy(true)
    setError('')
    const r = await saveResetPin(resetToken, pin, again)
    if (r.ok) {
      router.replace(r.home)
      router.refresh()
      return
    }
    setBusy(false)
    if (r.expired) setLink({ ok: false, error: RESET_EXPIRED })
    else setError(r.error)
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, MAX_PASSCODE)

  return (
    <main className="min-h-dvh paper flex flex-col">
      <form onSubmit={save} className="flex-1 flex flex-col w-full max-w-md mx-auto">
        <div className="flex-1 px-4 pt-10">
          <h1 className="t-h1 text-ink">Choose a new {w.pin}</h1>
          <p className="text-ink/65 text-sm mt-1">{link.eventName} · <span className="t-code">{link.code}</span></p>

          <label htmlFor="new-pin" className="t-label text-ink block mt-8 mb-2">New {w.pin}</label>
          <input
            id="new-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            autoFocus
            value={pin}
            onChange={e => { setPin(digits(e.target.value)); setError('') }}
            className={`${FIELD} field-code`}
          />
          <p className="t-cap text-ink/65 mt-2">4 to 8 digits.</p>

          <label htmlFor="again-pin" className="t-label text-ink block mt-6 mb-2">Type it again</label>
          <input
            id="again-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={again}
            onChange={e => { setAgain(digits(e.target.value)); setError('') }}
            className={`${FIELD} field-code`}
          />
          {error && <p className="t-cap text-rust-deep mt-2" role="alert">{error}</p>}

          <p className="t-cap text-ink/65 mt-6">
            Saving ends organiser access on every other phone. This phone is organiser for the next {ORGANISER_HOURS} hours.
          </p>
        </div>

        <div className="sticky bottom-0 paper px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] hide-with-keyboard">
          <button type="submit" disabled={busy || !pin || !again} className={buttonClass('primary')}>
            {busy ? 'Saving…' : `Save ${w.Pin}`}
          </button>
        </div>
      </form>
    </main>
  )
}
