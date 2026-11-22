'use client'

import { useEffect, useState } from 'react'
import { IconPlus, IconX } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, buttonClass, chipClass } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import { LABEL_COLOURS, LABEL_GROUPS_MAX, LABEL_NAME_MAX, labelIssue, readLabel, type ClubLabel } from '@/lib/clubLabels'
import { AGE_MAX, LABEL_INDEX_MAX, LABEL_INDEX_MIN, indexWords, labelGroupLine, type Category, type Gender, type LabelGroup } from '@/lib/clubMembership'
import { PRESET_COLOR_NAMES } from '@/lib/teamColors'
import { typeLabel } from '@/lib/clubEvents'

/** A handicap as typed — "+2" a plus index (stored negative), "12.4" — or undefined. */
function readIndexBox(v: string): number | undefined {
  const t = v.trim().replace(',', '.')
  if (!t) return undefined
  const plus = t.startsWith('+')
  const n = Number(plus ? t.slice(1) : t)
  if (!Number.isFinite(n)) return undefined
  const i = plus ? -n : n
  return Math.max(LABEL_INDEX_MIN, Math.min(LABEL_INDEX_MAX, Math.round(i * 10) / 10))
}

/**
 * A label made or changed (D288): its name and colour and — a label of the
 * club's own — who belongs, as groups (anybody in any one of them):
 * memberships, men or women, an age band, a handicap band. A type's default
 * label changes only its name and colour; it decides nothing about entry.
 */
export default function LabelPanel({ clubId, label, labels, cats, onClose, onSaved }: {
  clubId: string
  /** The label being changed — none for a new one. */
  label: ClubLabel | null
  labels: ClubLabel[]
  cats: Category[]
  onClose: () => void
  onSaved: (labels: ClubLabel[]) => void
}) {
  const isDefault = !!label?.eventType
  const [name, setName] = useState(label?.name ?? '')
  const [colour, setColour] = useState(label?.colour ?? LABEL_COLOURS.find(c => !labels.some(l => l.colour === c)) ?? LABEL_COLOURS[0])
  const [groups, setGroups] = useState<LabelGroup[]>(label?.groups.length ? label.groups : isDefault ? [] : [{}])
  // The handicap boxes as typed, so "+" can be typed before its number.
  const [hcp, setHcp] = useState<{ min: string; max: string }[]>(() => (label?.groups ?? [{}]).map(g => ({
    min: g.minIndex !== undefined ? indexWords(g.minIndex) : '', max: g.maxIndex !== undefined ? indexWords(g.maxIndex) : '',
  })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sure, setSure] = useState(false)

  const draft = readLabel({ id: label?.id ?? '', name, colour, groups, eventType: label?.eventType ?? null })
  const issue = labelIssue(draft, cats.map(c => c.id), labels)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setGroup = (i: number, patch: Partial<LabelGroup>) => setGroups(gs => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  const toggle = <T,>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter(x => x !== v) : [...(list ?? []), v])

  async function save() {
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const r = await askClub('label.save', { clubId, id: label?.id, label: draft })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    if (r.labels) onSaved(r.labels)
    onClose()
  }
  async function remove() {
    if (!label) return
    if (!sure) { setSure(true); return }
    setBusy(true); setError('')
    const r = await askClub('label.delete', { clubId, id: label.id })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    if (r.labels) onSaved(r.labels)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="label-panel-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <div className="ch-panel relative w-full md:w-[480px] h-full paper border-l border-line shadow-floating flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
          <h2 id="label-panel-title" className="t-h2 text-ink flex-1">{label ? (isDefault ? `${typeLabel(label.eventType!)}’s label` : 'Change the label') : 'New label'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-10 h-10 rounded-tile inline-flex items-center justify-center text-ink"><IconX size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <div>
            <label htmlFor="lb-name" className={FIELD_LABEL}>Name</label>
            <input id="lb-name" className={`${FIELD} ch-focus`} value={name} maxLength={LABEL_NAME_MAX} onChange={e => setName(e.target.value)}
              placeholder={isDefault ? typeLabel(label!.eventType!) : 'Men’s, Ladies’, Seniors, Juniors…'} />
          </div>
          <div>
            <p className={FIELD_LABEL}>Colour</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
              {LABEL_COLOURS.map(c => (
                <button key={c} type="button" role="radio" aria-checked={colour === c} aria-label={PRESET_COLOR_NAMES[c] ?? c} onClick={() => setColour(c)}
                  className={`w-10 h-10 rounded-full ch-focus ${colour === c ? 'ring-2 ring-offset-2 ring-ink' : ''}`} style={{ background: c }} />
              ))}
            </div>
            <p className="t-cap text-ink/65 mt-2">Down the edge of its cards, and a soft wash at the top of its pages.</p>
          </div>
          {isDefault ? (
            <p className="t-cap text-ink/65">Every {typeLabel(label!.eventType!).toLowerCase()} event wears this unless it carries a label of its own. A type’s label decides nothing about who may enter.</p>
          ) : (
            <div>
              <p className={FIELD_LABEL}>Who belongs</p>
              <p className="t-cap text-ink/65 mb-3">Anybody in any one group. On a competition, only they may enter.</p>
              <div className="space-y-3">
                {groups.map((g, i) => (
                  <div key={i} className="rounded-card border border-line p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="t-label text-ink flex-1">{labelGroupLine(g, cats)}</p>
                      {groups.length > 1 && (
                        <button type="button" onClick={() => { setGroups(gs => gs.filter((_, j) => j !== i)); setHcp(h => h.filter((_, j) => j !== i)) }}
                          aria-label="Take this group out" className="ch-hover ch-focus w-9 h-9 rounded-tile inline-flex items-center justify-center text-ink/65"><IconX size={18} /></button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['M', 'F'] as Gender[]).map(x => {
                        const on = g.genders?.length === 1 && g.genders[0] === x
                        return <button key={x} type="button" aria-pressed={on} className={chipClass(on)} onClick={() => setGroup(i, { genders: on ? undefined : [x] })}>{x === 'M' ? 'Men' : 'Women'}</button>
                      })}
                    </div>
                    {cats.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {cats.map(c => {
                          const on = !!g.categories?.includes(c.id)
                          return <button key={c.id} type="button" aria-pressed={on} className={chipClass(on)} onClick={() => setGroup(i, { categories: toggle(g.categories, c.id) })}>{c.name}</button>
                        })}
                      </div>
                    )}
                    <div className="grid grid-cols-[4.5rem_auto_4.5rem] items-center gap-2 w-fit">
                      <input aria-label="Aged from" className={`${FIELD} ch-focus`} inputMode="numeric" placeholder="Age" value={g.minAge ?? ''}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); setGroup(i, { minAge: v ? Math.min(AGE_MAX, Number(v)) : undefined }) }} />
                      <span className="t-label text-ink/80">to</span>
                      <input aria-label="Aged up to" className={`${FIELD} ch-focus`} inputMode="numeric" placeholder="Age" value={g.maxAge ?? ''}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); setGroup(i, { maxAge: v ? Math.min(AGE_MAX, Number(v)) : undefined }) }} />
                    </div>
                    <div className="grid grid-cols-[4.5rem_auto_4.5rem] items-center gap-2 w-fit">
                      <input aria-label="Handicap from" className={`${FIELD} ch-focus`} inputMode="decimal" placeholder="Hcp" value={hcp[i]?.min ?? ''}
                        onChange={e => { const t = e.target.value; setHcp(h => { const n = [...h]; n[i] = { ...(n[i] ?? { min: '', max: '' }), min: t }; return n }); setGroup(i, { minIndex: readIndexBox(t) }) }} />
                      <span className="t-label text-ink/80">to</span>
                      <input aria-label="Handicap up to" className={`${FIELD} ch-focus`} inputMode="decimal" placeholder="Hcp" value={hcp[i]?.max ?? ''}
                        onChange={e => { const t = e.target.value; setHcp(h => { const n = [...h]; n[i] = { ...(n[i] ?? { min: '', max: '' }), max: t }; return n }); setGroup(i, { maxIndex: readIndexBox(t) }) }} />
                    </div>
                    <p className="t-cap text-ink/65">Empty is any age, any handicap. A plus handicap is typed with its plus (+2). The handicap is the member’s index when they book or enter.</p>
                  </div>
                ))}
              </div>
              {groups.length < LABEL_GROUPS_MAX && (
                <button type="button" onClick={() => { setGroups(gs => [...gs, {}]); setHcp(h => [...h, { min: '', max: '' }]) }}
                  className={`${buttonClass('quiet', false, true)} ch-focus mt-3 inline-flex items-center gap-1`}><IconPlus size={16} /> Add a group</button>
              )}
            </div>
          )}
          {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-line flex items-center gap-3">
          {label && !isDefault && (
            <button type="button" onClick={() => void remove()} disabled={busy} className={`${buttonClass('quiet', false)} ch-focus`}>{sure ? 'Delete it' : 'Delete'}</button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={`${buttonClass('secondary', false)} ch-focus`}>Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy || !!issue} title={issue ?? undefined} className={`${buttonClass('primary', false)} ch-focus`}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
