'use client'

import Toggle from './Toggle'
import {
  type EventPermissions, EVENT_PERMISSIONS,
} from '@/lib/eventPermissions'

/**
 * The collaboration question, asked as toggles — one card per permission in
 * the registry, so a permission added there appears here with nothing else
 * touched. Three creation doors and the admin page all render this one
 * component; the framing line is the caller's, because creation asks a
 * question ("how collaborative?") and the admin page states a section.
 *
 * Controlled and pure: the caller holds the map and decides what a change
 * means — creation keeps it in form state, the admin page saves it on the
 * spot.
 */
export default function EventPermissionToggles({
  value, onChange, disabled = false,
}: {
  value: EventPermissions
  onChange: (next: EventPermissions) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      {EVENT_PERMISSIONS.map(p => (
        <div
          key={p.key}
          className="flex items-start justify-between gap-4 bg-surface border border-bark/12 rounded-2xl p-4"
        >
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium">{p.label}</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{p.hint}</p>
          </div>
          <Toggle
            checked={value[p.key]}
            onChange={on => !disabled && onChange({ ...value, [p.key]: on })}
            label={p.label}
          />
        </div>
      ))}
    </div>
  )
}
