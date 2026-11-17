'use client'

import { useEffect, useState } from 'react'
import { IconPlus, IconX } from '@/app/components/icons'
import EntryRulesFields from '@/app/components/EntryRulesFields'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { FIELD, FIELD_LABEL, Segmented, buttonClass, chipClass } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import type { Category } from '@/lib/clubMembership'
import {
  PRESET_CODE_MAX, PRESET_NAME_MAX, PRESET_USED_FOR_MAX, presetCode, presetCodeFrom, presetIssue, readPreset, resolvePlan, starterPlan,
  type PlanBatch, type Preset, type TeePlan,
} from '@/lib/clubPresets'
import { COMP_LAST_TEE_BEFORE_SUNSET_MINS, sunDay, sunWords } from '@/lib/sun'
import { MAX_BATCHES, batchLast } from '@/lib/teeSheet'
import { describeTime } from '@/lib/itinerary'
import { irishToday } from '@/lib/clubs'

const INTERVALS = [7, 8, 9, 10, 12, 15] as const

/** The next Saturday from today, YYYY-MM-DD — the preview's day to start with. */
function nextSaturday(today: string): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

/**
 * A preset made or changed (stage c1, M7): a side panel of 480 — its name,
 * code and what it is used for; format and allowance; who can enter; the
 * tee times as runs that may start at sunrise and end at a clock time, a
 * count, or sunset less some minutes; when booking opens; and whether it is
 * the club's default. A live preview works the times out on a sample day
 * at the home course.
 */
export default function PresetPanel({ clubId, preset, presets, homeCourseId, cats, ageDate, onClose, onSaved }: {
  clubId: string
  preset: Preset | null
  presets: Preset[]
  homeCourseId: string | null
  cats: Category[]
  ageDate: string
  onClose: () => void
  onSaved: (list: Preset[]) => void
}) {
  const [name, setName] = useState(preset?.name ?? '')
  const [code, setCode] = useState(preset?.code ?? '')
  const [usedFor, setUsedFor] = useState(preset?.usedFor ?? '')
  const [scoring, setScoring] = useState(preset?.scoring ?? 'stableford')
  const [allowance, setAllowance] = useState(preset?.allowance ?? 95)
  const [entry, setEntry] = useState(preset?.entry ?? null)
  const [plan, setPlan] = useState<TeePlan>(preset?.plan ?? starterPlan())
  const [isDefault, setDefault] = useState(preset?.isDefault ?? presets.length === 0)
  const [sample, setSample] = useState(() => nextSaturday(irishToday(new Date())))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sure, setSure] = useState(false)

  const { courses } = usePlatformCourses()
  const home = courses.find(c => c.id === homeCourseId)
  const sun = sunDay(sample, home ? { lat: home.latitude ?? NaN, lng: home.longitude ?? NaN } : null)
  const preview = resolvePlan(plan, sun)

  const draft = readPreset({ name, code: code || presetCodeFrom(name), usedFor, scoring, allowance, entry, plan, isDefault })
  const issue = presetIssue(draft, presets.filter(p => p.id !== preset?.id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setBatch = (i: number, patch: Partial<PlanBatch>) => setPlan(p => ({ ...p, batches: p.batches.map((b, j) => (j === i ? { ...b, ...patch } : b)) }))

  async function save() {
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const r = await askClub('preset.save', { clubId, id: preset?.id, preset: draft })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved(r.presets ?? [])
    onClose()
  }

  async function remove() {
    if (!preset) return
    if (!sure) { setSure(true); return }
    setBusy(true); setError('')
    const r = await askClub('preset.delete', { clubId, id: preset.id })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved(r.presets ?? presets.filter(p => p.id !== preset.id))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="preset-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <form onSubmit={e => { e.preventDefault(); void save() }}
        className="ch-panel relative w-full md:w-[480px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <h2 id="preset-title" className="t-h2 text-ink flex-1 break-words">{preset ? preset.name : 'New preset'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div>
              <label htmlFor="pp-name" className={FIELD_LABEL}>Name</label>
              <input id="pp-name" className={`${FIELD} ch-focus`} value={name} maxLength={PRESET_NAME_MAX} placeholder="e.g. Saturday men’s comp" autoFocus={!preset}
                onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pp-code" className={FIELD_LABEL}>Code</label>
              <input id="pp-code" className={`${FIELD} ch-focus font-mono`} value={code} maxLength={PRESET_CODE_MAX} placeholder={presetCodeFrom(name || 'Preset')}
                onChange={e => setCode(presetCode(e.target.value))} />
            </div>
          </div>
          <div>
            <label htmlFor="pp-used" className={FIELD_LABEL}>Used for</label>
            <input id="pp-used" className={`${FIELD} ch-focus`} value={usedFor} maxLength={PRESET_USED_FOR_MAX} placeholder="e.g. Saturday singles for men’s full members"
              onChange={e => setUsedFor(e.target.value)} />
            <p className="t-cap text-ink/65 mt-2">A calendar file names the preset by its code; this line helps whoever writes it choose.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={FIELD_LABEL}>Scoring</p>
              <Segmented label="Scoring" value={scoring} onChange={setScoring}
                options={[{ value: 'stableford', label: 'Stableford' }, { value: 'strokes', label: 'Strokes' }] as const} />
            </div>
            <div>
              <label htmlFor="pp-allowance" className={FIELD_LABEL}>Allowance</label>
              <div className="flex items-center gap-2">
                <input id="pp-allowance" className={`${FIELD} ch-focus`} inputMode="numeric" value={String(allowance)}
                  onChange={e => setAllowance(Number(e.target.value.replace(/\D/g, '') || 0))} />
                <span className="t-label text-ink/80">%</span>
              </div>
            </div>
          </div>

          <h3 className="t-card text-ink pt-1">Who can enter</h3>
          <EntryRulesFields entry={entry} onChange={setEntry} cats={cats} ageDate={ageDate} idPrefix="pp-entry" />

          <h3 className="t-card text-ink pt-1">Tee times</h3>
          {plan.batches.map((b, i) => (
            <div key={i} className={plan.batches.length > 1 ? 'rounded-tile border border-line p-3 space-y-3' : 'space-y-3'}>
              {plan.batches.length > 1 && (
                <div className="flex items-center gap-2">
                  <p className="t-label text-ink flex-1">Run {i + 1}</p>
                  <button type="button" onClick={() => setPlan(p => ({ ...p, batches: p.batches.filter((_, j) => j !== i) }))} aria-label={`Take run ${i + 1} off`}
                    className="ch-hover ch-focus rounded-full p-1 text-ink/65"><IconX size={18} /></button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`pp-start-${i}`} className={FIELD_LABEL}>Starts</label>
                  <select id={`pp-start-${i}`} className={`${FIELD} ch-focus`} value={b.start.kind}
                    onChange={e => setBatch(i, { start: e.target.value === 'sunrise' ? { kind: 'sunrise' } : { kind: 'clock', at: '08:00' } })}>
                    <option value="clock">At a time</option>
                    {i === 0 && <option value="sunrise">At sunrise</option>}
                  </select>
                </div>
                {b.start.kind === 'clock' && (
                  <div>
                    <label htmlFor={`pp-start-at-${i}`} className={FIELD_LABEL}>First tee time</label>
                    <input id={`pp-start-at-${i}`} type="time" className={`${FIELD} ch-focus`} value={b.start.at} onChange={e => setBatch(i, { start: { kind: 'clock', at: e.target.value } })} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`pp-end-${i}`} className={FIELD_LABEL}>Ends</label>
                  <select id={`pp-end-${i}`} className={`${FIELD} ch-focus`} value={b.end.kind}
                    onChange={e => setBatch(i, { end: e.target.value === 'sunset' ? { kind: 'sunset', minus: COMP_LAST_TEE_BEFORE_SUNSET_MINS } : e.target.value === 'clock' ? { kind: 'clock', at: '13:00' } : { kind: 'count', n: 12 } })}>
                    <option value="count">After a count</option>
                    <option value="clock">At a last time</option>
                    <option value="sunset">Before sunset</option>
                  </select>
                </div>
                <div>
                  {b.end.kind === 'count' && (<>
                    <label htmlFor={`pp-n-${i}`} className={FIELD_LABEL}>How many</label>
                    <input id={`pp-n-${i}`} className={`${FIELD} ch-focus`} inputMode="numeric" value={String(b.end.n)} onChange={e => setBatch(i, { end: { kind: 'count', n: Number(e.target.value.replace(/\D/g, '') || 0) } })} />
                  </>)}
                  {b.end.kind === 'clock' && (<>
                    <label htmlFor={`pp-last-${i}`} className={FIELD_LABEL}>Last tee time</label>
                    <input id={`pp-last-${i}`} type="time" className={`${FIELD} ch-focus`} value={b.end.at} onChange={e => setBatch(i, { end: { kind: 'clock', at: e.target.value } })} />
                  </>)}
                  {b.end.kind === 'sunset' && (<>
                    <label htmlFor={`pp-minus-${i}`} className={FIELD_LABEL}>Last tee, before sunset</label>
                    <select id={`pp-minus-${i}`} className={`${FIELD} ch-focus`} value={b.end.minus} onChange={e => setBatch(i, { end: { kind: 'sunset', minus: Number(e.target.value) } })}>
                      {[60, 120, 180, 210, 240, 270, 300, 330, 360].map(m => <option key={m} value={m}>{m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>)}
                    </select>
                  </>)}
                </div>
              </div>
              <div>
                <p className={FIELD_LABEL}>Minutes between</p>
                <div className="flex flex-wrap gap-2">
                  {INTERVALS.map(n => <button key={n} type="button" aria-pressed={b.interval === n} className={chipClass(b.interval === n)} onClick={() => setBatch(i, { interval: n })}>{n}</button>)}
                </div>
              </div>
              <div>
                <p className={FIELD_LABEL}>Players a tee time</p>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 4].map(n => <button key={n} type="button" aria-pressed={b.perTime === n} className={chipClass(b.perTime === n)} onClick={() => setBatch(i, { perTime: n })}>{n}</button>)}
                </div>
              </div>
            </div>
          ))}
          {plan.batches.length < MAX_BATCHES && (
            <button type="button" onClick={() => setPlan(p => ({ ...p, batches: [...p.batches, { start: { kind: 'clock', at: '13:00' }, end: { kind: 'count', n: 8 }, interval: 10, perTime: 4 }] }))}
              className="ch-hover ch-focus rounded-tile px-2 -mx-2 t-label text-accent-deep inline-flex items-center gap-1 min-h-9">
              <IconPlus size={16} /> Add another run of times
            </button>
          )}

          <div className="rounded-tile bg-tint p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="pp-sample" className={FIELD_LABEL}>On a day like</label>
                <input id="pp-sample" type="date" className={`${FIELD} ch-focus w-[11rem]`} value={sample} onChange={e => e.target.value && setSample(e.target.value)} />
              </div>
              <p className="t-cap text-ink/65 pb-3">{sunWords(sun) ?? ''}{home ? '' : ' · set the home course in Club settings'}</p>
            </div>
            <p className={`t-cap mt-2 ${preview.ok ? 'text-ink/80' : 'text-rust-deep'}`}>
              {preview.ok
                ? preview.batches.map(b => `${b.times} tee time${b.times === 1 ? '' : 's'}, ${describeTime(b.start)}${b.times > 1 ? ` to ${describeTime(batchLast({ start: b.start, interval: b.interval, count: b.times }))}` : ''}, in ${['', '', 'twos', 'threes', 'fours'][b.perTime]}`).join('; then ')
                : `Tee sheet not made: ${preview.why}`}
            </p>
          </div>

          <div>
            <p className={FIELD_LABEL}>Booking opens</p>
            <Segmented label="Booking opens" value={plan.opens ? 'later' : 'now'}
              onChange={v => setPlan(p => ({ ...p, opens: v === 'now' ? null : { daysBefore: 7, time: '20:00' } }))}
              options={[{ value: 'now', label: 'Straight away' }, { value: 'later', label: 'Days before' }] as const} />
            {plan.opens && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label htmlFor="pp-days" className={FIELD_LABEL}>Days before</label>
                  <input id="pp-days" className={`${FIELD} ch-focus`} inputMode="numeric" value={String(plan.opens.daysBefore)}
                    onChange={e => setPlan(p => ({ ...p, opens: { ...p.opens!, daysBefore: Number(e.target.value.replace(/\D/g, '') || 0) } }))} />
                </div>
                <div>
                  <label htmlFor="pp-open-time" className={FIELD_LABEL}>At</label>
                  <input id="pp-open-time" type="time" className={`${FIELD} ch-focus`} value={plan.opens.time}
                    onChange={e => setPlan(p => ({ ...p, opens: { ...p.opens!, time: e.target.value } }))} />
                </div>
              </div>
            )}
          </div>
          <div>
            <p className={FIELD_LABEL}>The club’s default</p>
            <Segmented label="The club’s default" value={isDefault ? 'yes' : 'no'} onChange={v => setDefault(v === 'yes')}
              options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] as const} />
            <p className="t-cap text-ink/65 mt-2">New competition starts from the default, and a calendar row with no preset uses it.</p>
          </div>
        </div>

        {error && <p role="alert" className="t-cap text-rust-deep mt-5">{error}</p>}
        <div className="flex flex-wrap gap-3 mt-6">
          <button type="submit" disabled={busy || !!issue} className={`${buttonClass('primary', false)} ch-focus`}>{busy ? 'Saving…' : preset ? 'Save' : 'Add the preset'}</button>
          <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
          {preset && (
            <button type="button" disabled={busy} onClick={() => void remove()} className={`${buttonClass('quiet', false)} ch-focus text-rust-deep ml-auto`}>
              {sure ? 'Delete it' : 'Delete'}
            </button>
          )}
        </div>
        {issue && name && !error && <p className="t-cap text-ink/65 mt-3">{issue}</p>}
      </form>
    </div>
  )
}
