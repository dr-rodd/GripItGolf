'use client'

import { FIELD, FIELD_LABEL, chipClass } from '@/app/components/ui'
import { gateOf, pickableLabels, type ClubLabel } from '@/lib/clubLabels'
import {
  AGE_MAX, GENDER_COMP_WORDS, WEEKDAY_NAMES, ageDateLabel, entryLine, playsOn, readEntryRules, weekdayOf,
  type Category, type EntryRules, type Gender,
} from '@/lib/clubMembership'

/**
 * Who can enter a competition (stage (m), D228): Men's and/or Ladies', the
 * memberships ticked, an age band — and the line it reads as. New
 * competition in the members app, the Clubhouse's competition panel and a
 * preset all draw it; the checks are `entryRulesIssue`'s.
 */
export default function EntryRulesFields({ entry, onChange, cats, date, ageDate, idPrefix = 'entry', labels }: {
  entry: EntryRules | null | undefined
  onChange: (e: EntryRules) => void
  /** D288: the club's labels — a label picked decides who may enter, on top of the rest. Absent: no label offered. */
  labels?: ClubLabel[]
  cats: Category[]
  /** The competition's day, for which memberships play it — none on a preset. */
  date?: string
  ageDate: string
  idPrefix?: string
}) {
  const e: EntryRules = entry ?? {}
  const own = labels ? pickableLabels(labels) : []
  return (
    <div className="space-y-5">
      {own.length > 0 && (
        <div>
          <p className={FIELD_LABEL}>Label</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!e.label} className={chipClass(!e.label)}
              onClick={() => { const { label: _l, ...rest } = e; onChange(rest) }}>None</button>
            {own.map(l => {
              const on = e.label?.id === l.id
              return (
                <button key={l.id} type="button" aria-pressed={on} className={`${chipClass(on)} inline-flex items-center gap-1.5`}
                  onClick={() => onChange({ ...e, label: gateOf(l) })}>
                  <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ background: l.colour }} />{l.name}
                </button>
              )
            })}
          </div>
          <p className="t-cap text-ink/65 mt-2">
            {e.label ? `Only ${e.label.name} may enter — and the rest below narrows it further. Its colour goes wherever it shows.` : 'A label decides who may enter and gives it its colour.'}
          </p>
        </div>
      )}
      <div>
        <p className={FIELD_LABEL}>Men’s or ladies’</p>
        <div className="flex flex-wrap gap-2">
          {(['M', 'F'] as Gender[]).map(g => {
            const on = !!e.genders?.includes(g)
            return (
              <button key={g} type="button" aria-pressed={on} className={chipClass(on)}
                onClick={() => onChange({ ...e, genders: on ? (e.genders ?? []).filter(x => x !== g) : [...(e.genders ?? []), g] })}>
                {GENDER_COMP_WORDS[g]}
              </button>
            )
          })}
        </div>
        <p className="t-cap text-ink/65 mt-2">Neither, or both: open to everybody.</p>
      </div>
      {cats.length > 0 && (
        <div>
          <p className={FIELD_LABEL}>Memberships</p>
          <div className="flex flex-wrap gap-2">
            {cats.map(c => {
              const on = !!e.categories?.includes(c.id)
              return (
                <button key={c.id} type="button" aria-pressed={on} className={chipClass(on)}
                  onClick={() => onChange({ ...e, categories: on ? (e.categories ?? []).filter(x => x !== c.id) : [...(e.categories ?? []), c.id] })}>
                  {c.name}
                </button>
              )
            })}
          </div>
          <p className="t-cap text-ink/65 mt-2">
            {e.categories?.length
              ? 'Only these, whatever their playing days.'
              : date
                ? `None ticked: every membership that plays on a ${WEEKDAY_NAMES[weekdayOf(date)]}${cats.some(c => !playsOn(c, date)) ? ` — not ${cats.filter(c => !playsOn(c, date)).map(c => c.name).join(' or ')}` : ''}.`
                : 'None ticked: every membership whose playing days include the day.'}
          </p>
        </div>
      )}
      <div>
        <p className={FIELD_LABEL}>Ages</p>
        <div className="grid grid-cols-[6rem_auto_6rem] items-center gap-2 w-fit">
          <input id={`${idPrefix}-from`} aria-label="Aged from" className={FIELD} inputMode="numeric" placeholder="From" value={e.minAge ?? ''}
            onChange={ev => { const v = ev.target.value.replace(/\D/g, ''); onChange({ ...e, minAge: v ? Math.min(AGE_MAX, Number(v)) : undefined }) }} />
          <span className="t-label text-ink/80">to</span>
          <input id={`${idPrefix}-to`} aria-label="Aged up to" className={FIELD} inputMode="numeric" placeholder="To" value={e.maxAge ?? ''}
            onChange={ev => { const v = ev.target.value.replace(/\D/g, ''); onChange({ ...e, maxAge: v ? Math.min(AGE_MAX, Number(v)) : undefined }) }} />
        </div>
        <p className="t-cap text-ink/65 mt-2">Empty is any age. Ages count on {ageDateLabel(ageDate)}.</p>
      </div>
      <p className="t-label text-ink">Open to: {entryLine(readEntryRules(entry), cats) ?? 'everybody on the club’s list who plays here'}</p>
    </div>
  )
}
