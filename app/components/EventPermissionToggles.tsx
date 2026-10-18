'use client'

import Toggle from './Toggle'
import {
  type EventPermissionKey, EVENT_PERMISSIONS,
} from '@/lib/eventPermissions'
import { cardClass } from './ui'

/**
 * The collaboration question, asked as toggles — one card per permission in
 * the registry, so a permission added there appears here with nothing else
 * touched. Three creation doors and the admin page all render this one
 * component; the framing line is the caller's, because creation asks a
 * question ("how collaborative?") and the admin page states a section.
 *
 * Golf's registry by default. A run challenge hands in its own
 * (`RUN_PERMISSIONS`, lib/runChallenge.ts) — a different sport's field does
 * different things for itself, but the question looks the same.
 *
 * Controlled and pure: the caller holds the map and decides what a change
 * means — creation keeps it in form state, the admin page saves it on the
 * spot.
 */
export default function EventPermissionToggles<K extends string = EventPermissionKey>({
  value, onChange, disabled = false,
  registry = EVENT_PERMISSIONS as unknown as { key: K; label: string; hint: string }[],
}: {
  value: Record<K, boolean>
  // The map's keys decide K; the callback and the registry follow them.
  onChange: (next: NoInfer<Record<K, boolean>>) => void
  disabled?: boolean
  registry?: NoInfer<{ key: K; label: string; hint: string }[]>
}) {
  return (
    <div className="space-y-2">
      {registry.map(p => (
        <div
          key={p.key}
          className={`flex items-start justify-between gap-4 p-4 ${cardClass()}`}
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
