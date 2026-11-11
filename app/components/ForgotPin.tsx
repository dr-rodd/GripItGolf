'use client'

import { useState } from 'react'
import { askPinReset } from '@/lib/entryClient'
import { RESET_LINK_MINUTES, resetWords } from '@/lib/pinReset'
import { IconCheck } from './icons'
import { buttonClass } from './ui'

/**
 * "Forgot PIN?" (D67; Ross, 11 Nov 2026) — the link under Unlock in every
 * organiser PIN box: the padlock (`OrganiserLock`), the in-place prompt
 * (`InlineUnlock`) and the organiser area's ask (`PasscodeGate`).
 */
export function ForgotPinLink({ onClick, isTrip = false, className = '' }: {
  onClick: () => void
  isTrip?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 t-cap text-accent-deep hover:text-accent transition-colors ${className}`}
    >
      Forgot {resetWords(isTrip).pin}?
    </button>
  )
}

/**
 * What the box shows once "Forgot PIN?" is tapped, in place of the PIN —
 * its contents cross-fading (`.cross-fade`, instant under Reduce Motion).
 * The server emails a link to the address the event was made with; that
 * address never reaches this phone.
 */
export default function ForgotPin({ tripCode, isTrip = false, onBack }: {
  tripCode: string
  isTrip?: boolean
  /** Back to the PIN, or Done once sent. */
  onBack: () => void
}) {
  const [state, setState] = useState<'ask' | 'busy' | 'sent' | 'none' | 'failed'>('ask')
  const [support, setSupport] = useState('')
  const w = resetWords(isTrip)

  async function send() {
    setState('busy')
    const r = await askPinReset(tripCode)
    if (r.result === 'none') {
      setSupport(r.support)
      setState('none')
    } else {
      setState(r.result)
    }
  }

  if (state === 'sent') {
    return (
      <div key="sent" className="cross-fade flex flex-col gap-3 text-left">
        <div className="flex items-start gap-2">
          <span className="w-7 h-7 rounded-full bg-accent-tint text-accent-deep flex items-center justify-center flex-shrink-0">
            <IconCheck size={16} />
          </span>
          <p className="t-label text-ink">
            Sent. Check the email this {w.thing} was made with. The link works once, for {RESET_LINK_MINUTES} minutes.
          </p>
        </div>
        <p className="t-cap text-ink/65">Not there? Look in spam, or ask again in a few minutes.</p>
        <button type="button" onClick={onBack} className={buttonClass('secondary', true, true)}>Done</button>
      </div>
    )
  }

  if (state === 'none') {
    return (
      <div key="none" className="cross-fade flex flex-col gap-3 text-left">
        <p className="t-label text-ink">
          This {w.thing} has no email on file. Write to{' '}
          <a href={`mailto:${support}`} className="text-accent-deep underline">{support}</a>.
        </p>
        <button type="button" onClick={onBack} className={buttonClass('secondary', true, true)}>Back</button>
      </div>
    )
  }

  return (
    <div key="ask" className="cross-fade flex flex-col gap-3 text-left">
      <p className="t-label text-ink">Forgot your {w.pin}?</p>
      <p className="t-cap text-ink/65">
        We’ll email a link to choose a new one to the address this {w.thing} was made with.
      </p>
      <button type="button" onClick={send} disabled={state === 'busy'} className={buttonClass('primary', true, true)}>
        {state === 'busy' ? 'Sending…' : 'Email me a link'}
      </button>
      {state === 'failed' && <p className="t-cap text-rust-deep">Couldn’t send just now. Try again.</p>}
      <button type="button" onClick={onBack} className={buttonClass('secondary', true, true)}>Back</button>
    </div>
  )
}
