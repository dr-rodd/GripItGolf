'use client'

import { useState } from 'react'
import { IconLink, IconLinkOff } from '@/app/components/icons'
import { askClub } from '@/lib/accountClient'

/**
 * D285 (Ross, 22 Nov 2026): the status of an event that opens outside the
 * members app is whether it is linked to it — two chain links where the
 * phase would be. Linked, members see it in Comps, Home and Other events;
 * unlinked it stays under the club, read here, greyed, never in a member's
 * list. A tap switches it (the office's); anybody else sees the state.
 */
export default function LinkToggle({ clubId, code, unlinked, office, onChange }: {
  clubId: string
  code: string
  unlinked: boolean
  office: boolean
  onChange: (unlinked: boolean, error?: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const label = unlinked
    ? 'Not linked to the members app. Not shown to members.'
    : 'Linked to the members app. Shown to members.'
  const icon = unlinked ? <IconLinkOff size={20} /> : <IconLink size={20} />
  const tone = unlinked ? 'text-ink/65' : 'text-accent-deep'
  if (!office) return <span title={label} role="img" aria-label={label} className={`inline-flex items-center justify-center w-9 h-9 ${tone}`}>{icon}</span>
  async function tap() {
    setBusy(true)
    const r = await askClub('event.link', { clubId, code, linked: unlinked })
    setBusy(false)
    if (r.ok) onChange(!!r.unlinked)
    else onChange(unlinked, r.error)
  }
  return (
    <button type="button" onClick={() => void tap()} disabled={busy} aria-pressed={!unlinked}
      title={`${label} Tap to ${unlinked ? 'link' : 'unlink'}.`} aria-label={`${label} Tap to ${unlinked ? 'link' : 'unlink'}.`}
      className={`ch-hover ch-focus inline-flex items-center justify-center w-11 h-11 md:w-9 md:h-9 rounded-tile ${tone} ${busy ? 'opacity-60' : ''}`}>
      {icon}
    </button>
  )
}
