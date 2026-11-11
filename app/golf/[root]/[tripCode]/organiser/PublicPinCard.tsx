'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAX_PASSCODE } from '@/lib/passcode'
import { NO_PUBLIC_PIN, publicPinIssue } from '@/lib/publicPin'
import { setPublicPin } from '@/lib/entryClient'
import PublicPinField from '@/app/components/PublicPinField'
import { FIELD, buttonClass } from '@/app/components/ui'

/**
 * Who can see the event: the public PIN set, changed or taken off
 * (lib/publicPin.ts). **Through the server** (row-level security stage 4,
 * D65): a PIN is never written from a phone. The server asks for the admin
 * PIN when the event has one, refuses a public PIN equal to it, stores it
 * salted and slow, and lets this phone straight back through the door.
 *
 * Changing it sends every other phone back to the door; taking it off opens
 * the event to anybody with its code again.
 */
export default function PublicPinCard({ tripCode, hasPin, adminPinSet }: {
  tripCode: string
  hasPin: boolean
  /** Whether the event has an admin PIN, which the server will ask for. */
  adminPinSet: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(NO_PUBLIC_PIN)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [adminPin, setAdminPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const issue = publicPinIssue({ ...draft, on: true }, null)
  const needsAdmin = adminPinSet && adminPin.length === 0

  function reset() {
    setEditing(false); setRemoving(false); setDraft(NO_PUBLIC_PIN); setAdminPin(''); setError(null)
  }

  async function write(pin: string | null) {
    setSaving(true)
    setError(null)
    const r = await setPublicPin(tripCode, adminPinSet ? adminPin : null, pin)
    setSaving(false)
    if (!r.ok) {
      setError(r.error)
      setAdminPin('')
      return
    }
    reset()
    router.refresh()
  }

  const adminField = adminPinSet && (
    <label className="block">
      <span className="t-label text-ink block mb-1">Your admin PIN, to confirm</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={adminPin}
        onChange={e => setAdminPin(e.target.value.replace(/\D/g, ''))}
        maxLength={MAX_PASSCODE}
        className={`${FIELD} field-code`}
      />
    </label>
  )

  return (
    <section className="mb-10">
      <h2 className="t-h2 text-ink mb-1">Who can see the event</h2>
      <p className="text-ink/65 text-[13px] mb-3 leading-snug">
        {hasPin
          ? 'The field enters the public PIN once on each phone. Changing it asks everybody again.'
          : 'Open to anybody with the event code. A public PIN keeps it to the people you give it to.'}
      </p>
      {editing ? (
        <div className="space-y-3">
          <PublicPinField value={{ ...draft, on: true }} onChange={d => setDraft({ ...d, on: true })} issue={issue} />
          {adminField}
          <div className="flex gap-2">
            <button type="button" disabled={saving || !!issue || needsAdmin} onClick={() => { void write(draft.pin) }} className={buttonClass('primary', false)}>
              {saving ? 'Saving…' : 'Save the public PIN'}
            </button>
            <button type="button" disabled={saving} onClick={reset} className={buttonClass('quiet', false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : removing ? (
        <div className="space-y-3">
          <p className="text-ink/65 text-[13px] leading-snug">
            Anybody with the event code will be able to see the event again.
          </p>
          {adminField}
          <div className="flex gap-2">
            <button type="button" disabled={saving || needsAdmin} onClick={() => { void write(null) }} className={buttonClass('primary', false)}>
              {saving ? 'Saving…' : 'Take the public PIN off'}
            </button>
            <button type="button" disabled={saving} onClick={reset} className={buttonClass('quiet', false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className={buttonClass('secondary', false)}>
            {hasPin ? 'Change the public PIN' : 'Set a public PIN'}
          </button>
          {hasPin && (
            <button type="button" disabled={saving} onClick={() => setRemoving(true)} className={buttonClass('quiet', false)}>
              Take it off
            </button>
          )}
        </div>
      )}
      {error && <p className="text-rust-deep text-sm mt-3 leading-snug">{error}</p>}
    </section>
  )
}
