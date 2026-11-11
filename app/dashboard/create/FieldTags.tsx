'use client'

import { useState } from 'react'
import Toggle from '@/app/components/Toggle'
import {
  MAX_FIELD_TAGS, TAGS_INTRO, activeTags, fieldTagsIssue, newTag, switchedOn, type FieldTags,
} from '@/lib/fieldTags'
import { PRESET_COLORS, PRESET_COLOR_NAMES } from '@/lib/teamColors'
import { FIELD, cardClass, chipClass } from '@/app/components/ui'

/**
 * Tags in a creation wizard's field step (lib/fieldTags.ts, the rules) — the
 * one copy, for match play's field step and the league wizard's alike: the
 * switch with what tags are for, the tags themselves, and a tag to choose on
 * each player.
 */

/** A player's tag, chosen from the active tags; tapping the chosen one takes it off. */
export function PlayerTagChips({ tags, value, label, onChange }: {
  tags: FieldTags
  value: string | undefined
  label: string
  onChange: (tag: string | undefined) => void
}) {
  const live = activeTags(tags)
  if (live.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {live.map(t => (
        <button
          key={t.key}
          type="button"
          aria-pressed={value === t.key}
          onClick={() => onChange(value === t.key ? undefined : t.key)}
          className={`${chipClass(value === t.key, true)} gap-1.5`}
        >
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.colour }} aria-hidden="true" />
          {t.name.trim() || 'Unnamed tag'}
        </button>
      ))}
    </div>
  )
}

/**
 * "Enable tags" — off to start with; on, the tags themselves: a colour (tap
 * it for the palette) and a name each, two to begin with, more added or
 * taken away. Taking one away takes it off every player who had it.
 */
export function TagsCard({ tags, setTags, counts, onRemove }: {
  tags: FieldTags
  setTags: (next: FieldTags) => void
  counts: Record<string, number>
  onRemove: (key: string) => void
}) {
  const [colourFor, setColourFor] = useState<string | null>(null)
  const issue = fieldTagsIssue(tags)
  const edit = (key: string, patch: Partial<FieldTags['tags'][number]>) =>
    setTags({ ...tags, tags: tags.tags.map(t => (t.key === key ? { ...t, ...patch } : t)) })

  return (
    <div className={`p-4 ${cardClass()}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">Enable tags</p>
          <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{TAGS_INTRO}</p>
        </div>
        <Toggle checked={tags.on} onChange={on => setTags(on ? switchedOn(tags) : { ...tags, on: false })} label="Enable tags" />
      </div>

      {tags.on && (
        <div className="mt-4 space-y-2">
          {tags.tags.map(t => (
            <div key={t.key}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColourFor(colourFor === t.key ? null : t.key)}
                  aria-label={`Change the colour of ${t.name.trim() || 'this tag'}`}
                  aria-expanded={colourFor === t.key}
                  className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-tile press"
                >
                  <span className="w-6 h-6 rounded-full border border-line" style={{ backgroundColor: t.colour }} />
                </button>
                <input
                  type="text"
                  value={t.name}
                  onChange={e => edit(t.key, { name: e.target.value })}
                  placeholder="Tag name"
                  aria-label="Tag name"
                  maxLength={40}
                  className={`${FIELD} field-dense flex-1 min-w-0`}
                />
                <span className="t-cap text-ink/65 tabular-nums w-14 text-right flex-shrink-0">
                  {counts[t.key] ?? 0} {(counts[t.key] ?? 0) === 1 ? 'player' : 'players'}
                </span>
                <button
                  type="button"
                  onClick={() => { setTags({ ...tags, tags: tags.tags.filter(x => x.key !== t.key) }); onRemove(t.key) }}
                  className="w-9 h-11 flex-shrink-0 flex items-center justify-center text-ink/65 hover:text-ink/80"
                  aria-label={`Remove ${t.name.trim() || 'this tag'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {colourFor === t.key && (
                <div className="flex flex-wrap gap-2 mt-2 mb-1 pl-1" role="group" aria-label="Colours">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { edit(t.key, { colour: c }); setColourFor(null) }}
                      aria-label={PRESET_COLOR_NAMES[c] ?? c}
                      aria-pressed={c === t.colour}
                      className={`w-8 h-8 rounded-full ring-1 ring-line-strong border-2 ${c === t.colour ? 'border-ink/60' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {tags.tags.length < MAX_FIELD_TAGS && (
            <button
              type="button"
              onClick={() => setTags({ ...tags, tags: [...tags.tags, newTag(tags.tags)] })}
              className="w-full py-3 border border-dashed border-line-strong rounded-xl text-ink/65 text-sm hover:text-ink/80 transition-colors"
            >
              + Add a tag
            </button>
          )}
          {issue && <p className="text-rust-deep text-[13px] leading-snug">{issue}</p>}
          {!issue && <p className="t-cap text-ink/65 leading-snug">Give each player their tag below. More can be added in the organiser area.</p>}
        </div>
      )}
    </div>
  )
}
