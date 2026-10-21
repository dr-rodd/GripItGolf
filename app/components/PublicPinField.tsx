'use client'

import { MAX_PASSCODE, MIN_PASSCODE } from '@/lib/passcode'
import type { PublicPinDraft } from '@/lib/publicPin'
import Toggle from './Toggle'
import { FIELD, cardClass } from './ui'

/**
 * The public PIN on an event's creation form, beside the admin PIN
 * (lib/publicPin.ts). Off, the event is open to anybody with its code, as
 * every event has been; on, the field enters this PIN once per phone. The
 * organiser can change or remove it later in the organiser area — unlike
 * the admin PIN, which is for keeps.
 */
export default function PublicPinField({ value, onChange, issue }: {
  value: PublicPinDraft
  onChange: (next: PublicPinDraft) => void
  /** `publicPinIssue`'s answer, shown once something has been typed. */
  issue: string | null
}) {
  return (
    <div className={`px-4 py-4 ${cardClass()}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">Public PIN</p>
          <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
            Optional. The field needs it to see the event at all — the code alone is not enough.
            A different PIN from your admin PIN; you can change it later.
          </p>
        </div>
        <Toggle checked={value.on} onChange={on => onChange({ ...value, on })} label="Ask for a public PIN" />
      </div>
      {value.on && (
        <div className="mt-3 space-y-3">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={value.pin}
            onChange={e => onChange({ ...value, pin: e.target.value.replace(/\D/g, '') })}
            placeholder={`Public PIN (${MIN_PASSCODE}–${MAX_PASSCODE} digits)`}
            maxLength={MAX_PASSCODE}
            aria-label="Public PIN"
            className={FIELD}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={value.confirm}
            onChange={e => onChange({ ...value, confirm: e.target.value.replace(/\D/g, '') })}
            placeholder="Enter it again"
            maxLength={MAX_PASSCODE}
            aria-label="Public PIN again"
            className={FIELD}
          />
          {issue && (value.pin || value.confirm) && (
            <p className="text-rust-deep text-[13px] leading-snug">{issue}</p>
          )}
        </div>
      )}
    </div>
  )
}
