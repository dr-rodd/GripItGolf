'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hashPasscode } from '@/lib/passcode'
import { NO_PUBLIC_PIN, publicPinIssue, rememberEntry } from '@/lib/publicPin'
import PublicPinField from '@/app/components/PublicPinField'
import { buttonClass } from '@/app/components/ui'

/**
 * Who can see the event: the public PIN set, changed or taken off
 * (lib/publicPin.ts). Behind the organiser area's own PIN gate, so whoever
 * is holding this already has the admin PIN — which is why a new public
 * PIN cannot be checked against it here and is simply written.
 *
 * Changing it sends every phone back to the door, this one excepted;
 * taking it off opens the event to anybody with its code again.
 */
export default function PublicPinCard({ tripId, tripCode, hasPin }: {
  tripId: string
  tripCode: string
  hasPin: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(NO_PUBLIC_PIN)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const issue = publicPinIssue({ ...draft, on: true }, null)

  async function write(hash: string | null) {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('trips')
      .update({ public_passcode_hash: hash }).eq('id', tripId)
    setSaving(false)
    if (err) {
      console.error('Public PIN write failed:', err)
      setError(/public_passcode_hash/.test(err.message ?? '')
        ? 'The public PIN needs a database update first.'
        : 'Could not save the public PIN — try again.')
      return
    }
    if (hash) rememberEntry(tripCode, hash)
    setEditing(false)
    setDraft(NO_PUBLIC_PIN)
    router.refresh()
  }

  async function save() {
    if (issue) return
    try {
      await write(await hashPasscode(draft.pin))
    } catch {
      setError('Could not set the PIN on this device — try again.')
    }
  }

  function remove() {
    if (!window.confirm('Take the public PIN off? Anybody with the event code will be able to see the event again.')) return
    write(null)
  }

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
          <div className="flex gap-2">
            <button type="button" disabled={saving || !!issue} onClick={save} className={buttonClass('primary', false)}>
              {saving ? 'Saving…' : 'Save the public PIN'}
            </button>
            <button type="button" disabled={saving} onClick={() => { setEditing(false); setDraft(NO_PUBLIC_PIN); setError(null) }} className={buttonClass('quiet', false)}>
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
            <button type="button" disabled={saving} onClick={remove} className={buttonClass('quiet', false)}>
              Take it off
            </button>
          )}
        </div>
      )}
      {error && <p className="text-rust-deep text-sm mt-3 leading-snug">{error}</p>}
    </section>
  )
}
