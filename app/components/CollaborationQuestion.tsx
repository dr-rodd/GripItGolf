'use client'

import { useState } from 'react'
import {
  COLLAB_STYLES, collabAdvice, collabStyleOf, describePermissions, withCollabStyle,
  type EVENT_PERMISSIONS, type EventPermissions,
} from '@/lib/eventPermissions'
import EventPermissionToggles from './EventPermissionToggles'
import Toggle from './Toggle'
import { cardClass, optionClass } from './ui'

/**
 * "How collaborative should this event be?" answered in one tap (Ross, 5
 * Nov 2026) — **Relaxed** or **Strict** (lib/eventPermissions.ts, the
 * rules), the one chosen saying what it means in a few lines, and a switch
 * that shows every permission for anybody who wants their own mix. Every
 * event creation door and the organiser area draw this one component; a mix
 * that is neither style leaves neither chosen, and the line under them says
 * where the answers stand.
 *
 * Controlled: the caller holds the answers and decides what a change means.
 */
export default function CollaborationQuestion({ value, onChange, registry, settingsOpen = false }: {
  value: EventPermissions
  onChange: (next: EventPermissions) => void
  /** The permissions asked of this event (`permissionsFor`). */
  registry: (typeof EVENT_PERMISSIONS)[number][]
  /** Whether every permission shows to begin with — the organiser area's way. */
  settingsOpen?: boolean
}) {
  const [open, setOpen] = useState(settingsOpen)
  const style = collabStyleOf(value, registry)

  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }} role="radiogroup" aria-label="How collaborative">
        {COLLAB_STYLES.map(s => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={style === s.key}
            onClick={() => onChange(withCollabStyle(value, s.key, registry))}
            className={optionClass(style === s.key)}
          >
            <span className="block text-sm font-medium text-ink">{s.label}</span>
            <span className="block t-cap text-ink/65">{s.hint}</span>
          </button>
        ))}
      </div>

      {style ? (
        <div className={`p-4 ${cardClass('flat')} space-y-1.5`} aria-live="polite">
          {collabAdvice(style, registry).map((line, i) => (
            <p key={i} className={`text-sm leading-snug ${i === 0 ? 'text-ink font-medium' : 'text-ink/80'}`}>{line}</p>
          ))}
        </div>
      ) : (
        <p className="t-cap text-ink/65 leading-snug" aria-live="polite">
          {describePermissions(value, registry)}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 pt-1">
        <p className="text-sm text-ink">Show each setting</p>
        <Toggle checked={open} onChange={setOpen} label="Show each setting" />
      </div>
      {open && <EventPermissionToggles value={value} onChange={onChange} registry={registry} />}
    </div>
  )
}
