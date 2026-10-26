'use client'

import { ChoiceChips, FIELD_LABEL, cardClass } from './ui'
import Toggle from './Toggle'

/**
 * The tee times question's two answers (Ross, 26 Oct 2026) — asked where
 * an event is made and again in the organiser area, one copy for both.
 * Each is an event permission (lib/eventPermissions.ts
 * `TEE_SHEET_PERMISSIONS`), which is why neither appears among the
 * collaborative toggles as well.
 *
 *   Making the sheets — the organiser, behind the PIN; or anyone, a casual
 *   event nobody runs (`set_tee_sheets`).
 *   Placing players — the organiser, the sheet read-only to everybody
 *   else; or each player picking their own time from what is free
 *   (`edit_tee_sheet`).
 */
export type TeeTimesAccessValue = { anyoneMakes: boolean; playersPick: boolean }

export default function TeeTimesAccess({ value, onChange }: {
  value: TeeTimesAccessValue
  onChange: (next: TeeTimesAccessValue) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className={FIELD_LABEL}>Who makes the tee sheets</p>
        <ChoiceChips
          label="Who makes the tee sheets"
          value={value.anyoneMakes ? 'anyone' : 'organiser'}
          onChange={v => onChange({ ...value, anyoneMakes: v === 'anyone' })}
          options={[
            { value: 'organiser', label: 'The organiser' },
            { value: 'anyone', label: 'Anyone' },
          ]}
        />
        <p className="t-cap text-ink/65 mt-1.5 leading-snug">
          {value.anyoneMakes
            ? 'A casual event nobody runs: anyone can make or change a round’s tee times, no PIN.'
            : 'Made and changed behind the organiser PIN.'}
        </p>
      </div>
      <div>
        <p className={FIELD_LABEL}>Who puts players on a tee time</p>
        <ChoiceChips
          label="Who puts players on a tee time"
          value={value.playersPick ? 'players' : 'organiser'}
          onChange={v => onChange({ ...value, playersPick: v === 'players' })}
          options={[
            { value: 'organiser', label: 'The organiser' },
            { value: 'players', label: 'Each player' },
          ]}
        />
        <p className="t-cap text-ink/65 mt-1.5 leading-snug">
          {value.playersPick
            ? 'Each player picks a free time for themselves.'
            : 'The organiser places everyone; the sheet is read-only to the rest.'}
        </p>
      </div>
    </div>
  )
}

/**
 * The question as an event's creation asks it: tee times on or off and,
 * on, the two answers above. On, every round the event is made with starts
 * from a tee sheet — an empty slot on the Tee times tab until the organiser
 * makes it — and a league round added later follows (lib/leagueRoundStore.ts).
 */
export function TeeTimesQuestion({ on, onToggle, value, onChange }: {
  on: boolean
  onToggle: (on: boolean) => void
  value: TeeTimesAccessValue
  onChange: (next: TeeTimesAccessValue) => void
}) {
  return (
    <div>
      <div className={`flex items-center justify-between gap-4 px-4 py-3 ${cardClass()}`}>
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">Tee times</p>
          <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
            A tee sheet for every round, set up once the field is in.
          </p>
        </div>
        <Toggle checked={on} onChange={onToggle} label="Tee times" />
      </div>
      {on && (
        <div className="mt-4">
          <TeeTimesAccess value={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
