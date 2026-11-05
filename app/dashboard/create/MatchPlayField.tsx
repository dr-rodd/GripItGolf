'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import Toggle from '@/app/components/Toggle'
import HandicapField from '@/app/components/HandicapField'
import { parseHandicap, isHandicapPending, HANDICAP_PENDING_LABEL } from '@/lib/handicap'
import { addLabel, withSeeded, withoutSeeded, type FieldPlayer, type FieldSeed } from '@/lib/fieldSeed'
import SeedFromEvent from './SeedFromEvent'
import {
  MAX_FIELD_TAGS, TAGS_INTRO, activeTags, fieldTagsIssue, newTag, switchedOn, tagCounts, type FieldTags,
} from '@/lib/fieldTags'
import { PRESET_COLORS, PRESET_COLOR_NAMES } from '@/lib/teamColors'
import { ChoiceChips, FIELD, cardClass, chipClass } from '@/app/components/ui'

const GENDER_OPTIONS = [{ value: 'M', label: 'M' }, { value: 'F', label: 'F' }] as const

/**
 * "Next, let's add the field" — a match play event's players, on both of
 * its creation doors (Ross, 4 Nov 2026): what to expect in a box at the top,
 * whether the organiser is playing, the field seeded from another event if
 * wanted (SeedFromEvent), then a card a player. Enter after a name goes on
 * to that player's handicap. **Tags** (Ross, 5 Nov 2026) are switched on
 * here, off to start with: named and coloured, and each player given one
 * as they are typed in (lib/fieldTags.ts). The draw is a step of its own
 * after this one.
 */
export default function MatchPlayField({
  players, setPlayers, organiserPlaying, setOrganiserPlaying, duplicateIndex, duplicateIssue, seed, setSeed,
  tags, setTags,
}: {
  players: FieldPlayer[]
  setPlayers: Dispatch<SetStateAction<FieldPlayer[]>>
  organiserPlaying: boolean
  setOrganiserPlaying: (on: boolean) => void
  duplicateIndex: number
  duplicateIssue: string | null
  seed: FieldSeed
  setSeed: (next: FieldSeed) => void
  tags: FieldTags
  setTags: (next: FieldTags) => void
}) {
  const update = (i: number, patch: Partial<FieldPlayer>) =>
    setPlayers(prev => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const live = activeTags(tags)

  return (
    <div className="space-y-4">
      <div className={`p-4 ${cardClass('flat')}`}>
        <p className="text-ink/80 text-sm leading-relaxed">
          Start adding players and their handicaps. New players can be added up until the draw
          is made, by invite link or QR code, so don&apos;t worry if the list is incomplete.
          Players fill in their own handicaps, and you can allow them to be edited until the
          day of play.
        </p>
      </div>

      <div className={`p-4 ${cardClass()}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium">Are you playing?</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
              {organiserPlaying
                ? 'Put your own name first below — the rest of the field follows.'
                : 'You run the event; the names below are the field.'}
            </p>
          </div>
          <Toggle checked={organiserPlaying} onChange={setOrganiserPlaying} label="The organiser is playing" />
        </div>
      </div>

      <SeedFromEvent
        value={seed}
        onChange={setSeed}
        onSeed={seeded => setPlayers(prev => withSeeded(prev, seeded, organiserPlaying))}
        onUnseed={() => setPlayers(prev => withoutSeeded(prev))}
      />

      <TagsCard tags={tags} setTags={setTags} counts={tagCounts(tags, players)}
        onRemove={key => setPlayers(prev => prev.map(p => (p.tag === key ? { ...p, tag: undefined } : p)))} />

      {players.map((player, i) => (
        <div key={i} className={`p-4 ${cardClass()}`}>
          <div className="flex items-center justify-between mb-4">
            <span className="t-label text-ink/80">
              {i === 0 && organiserPlaying ? 'Organiser — you' : `Player ${i + 1}`}
            </span>
            {i > 0 && (
              <button
                onClick={() => setPlayers(prev => prev.filter((_, idx) => idx !== i))}
                className="text-ink/65 hover:text-ink/80 transition-colors p-1"
                aria-label="Remove player"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={player.name}
              onChange={e => update(i, { name: e.target.value })}
              // Enter goes on to the handicap (Ross, 4 Nov 2026).
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                document.getElementById(`field-hcp-${i}`)?.focus()
              }}
              enterKeyHint="next"
              placeholder="Full name"
              // Swapped, not appended: two border-colour classes in one
              // string leaves which one wins up to stylesheet order.
              className={i === duplicateIndex ? FIELD.replace('border-line', 'border-rust/60') : FIELD}
            />
            {i === duplicateIndex && (
              <p className="text-rust-deep text-[13px] leading-snug">{duplicateIssue}</p>
            )}

            <div className="flex gap-3">
              <HandicapField
                id={`field-hcp-${i}`}
                value={player.handicap}
                onChange={v => update(i, { handicap: v })}
                placeholder="Handicap (or leave blank)"
                rowClassName="flex-1 min-w-0"
                className={`${FIELD} flex-1 min-w-0`}
              />
              <ChoiceChips
                label="Men’s or ladies’ tees"
                equal={false}
                className="flex-shrink-0 self-center flex-nowrap"
                value={player.gender}
                onChange={g => update(i, { gender: g })}
                options={GENDER_OPTIONS}
              />
            </div>

            {live.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${player.name.trim() || `Player ${i + 1}`}'s tag`}>
                {live.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={player.tag === t.key}
                    onClick={() => update(i, { tag: player.tag === t.key ? undefined : t.key })}
                    className={`${chipClass(player.tag === t.key, true)} gap-1.5`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.colour }} aria-hidden="true" />
                    {t.name.trim() || 'Unnamed tag'}
                  </button>
                ))}
              </div>
            )}

            {isHandicapPending(parseHandicap(player.handicap)) && (
              <p className="text-ink/65 text-[13px] leading-snug">
                Shows as {HANDICAP_PENDING_LABEL} until they set it when claiming their name.
              </p>
            )}
          </div>
        </div>
      ))}

      <button
        onClick={() => setPlayers(prev => [...prev, { name: '', handicap: '', gender: 'M' }])}
        className="w-full py-4 border border-dashed border-line-strong rounded-xl text-ink/65 text-sm hover:border-line-strong hover:text-ink/80 transition-colors"
      >
        {addLabel(players)}
      </button>
    </div>
  )
}

/**
 * "Enable tags" — off to start with; on, the tags themselves: a colour (tap
 * it for the palette) and a name each, two to begin with, more added or
 * taken away. Taking one away takes it off every player who had it.
 */
function TagsCard({ tags, setTags, counts, onRemove }: {
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
                      className={`w-8 h-8 rounded-full border-2 ${c === t.colour ? 'border-ink/60' : 'border-transparent'}`}
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
