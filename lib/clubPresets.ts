// Event presets — the only copy of their rules (Clubhouse stage c1, M7;
// Ross, 17 Nov 2026).
//
// A preset is a named template a competition starts from — "Saturday men's
// comp", "Wednesday semi-open", "Ladies' Tuesday": a short code (A–Z, 0–9,
// unique in the club — a calendar file names it), what it is used for, the
// format and allowance, who may enter (entry rules, as a competition's), the
// tee sheet as a **plan** and when booking opens. One may be the club's
// default.
//
// The plan is kept as the office said it, never as clock times: a run of
// tee times may start at a clock time or at **sunrise**, and end at a clock
// time, after a number of tee times, or at **sunset less some minutes** (four
// and a half hours by default — lib/sun.ts). Only when a competition is made
// is it worked out for that day and course (`resolvePlan`) and its values
// copied in: changing a preset later changes no competition already made.
//
// Pure. No I/O.

import { MAX_BATCHES } from './teeSheet'
import { COMP_LAST_TEE_BEFORE_SUNSET_MINS, clockLess, countUntil, sunriseTee, type SunDay } from './sun'
import { countToLast } from './teeSheet'
import { describeTime } from './itinerary'
import { readEntryRules, type EntryRules } from './clubMembership'
import type { CompBatch, CompForm, CompScoring } from './clubComp'

export type PlanStart = { kind: 'clock'; at: string } | { kind: 'sunrise' }
export type PlanEnd = { kind: 'clock'; at: string } | { kind: 'count'; n: number } | { kind: 'sunset'; minus: number }

/** One run of tee times, as a preset says it. */
export interface PlanBatch {
  start: PlanStart
  end: PlanEnd
  interval: number
  perTime: number
}

/** A preset's tee sheet and when booking opens. */
export interface TeePlan {
  batches: PlanBatch[]
  /** Days before at a time — null: as soon as it is made. */
  opens: { daysBefore: number; time: string } | null
}

export interface Preset {
  id: string
  code: string
  name: string
  usedFor: string | null
  scoring: CompScoring
  allowance: number
  entry: EntryRules | null
  plan: TeePlan
  isDefault: boolean
}

export const PRESET_NAME_MAX = 60
export const PRESET_USED_FOR_MAX = 120
export const PRESET_CODE_MAX = 12
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/** A code as typed: capitals and digits, nothing else. */
export function presetCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, PRESET_CODE_MAX) : ''
}

/** A code made from a name: "Saturday men's comp" → "SMC". */
export function presetCodeFrom(name: string): string {
  const words = name.toUpperCase().replace(/['’]/g, '').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const code = words.length > 1 ? words.map(w => (/^\d+$/.test(w) ? w : w[0])).join('') : (words[0] ?? 'P').slice(0, 6)
  return code.slice(0, PRESET_CODE_MAX) || 'P'
}

/** The plan as stored or sent — whatever does not read is dropped to a sensible answer; `planIssue` says what is wrong. */
export function readTeePlan(raw: unknown): TeePlan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
  const batches = (Array.isArray(r.batches) ? r.batches : []).filter((b): b is Record<string, unknown> => !!b && typeof b === 'object').map(b => {
    const s = (b.start && typeof b.start === 'object' ? b.start : {}) as Record<string, unknown>
    const e = (b.end && typeof b.end === 'object' ? b.end : {}) as Record<string, unknown>
    const start: PlanStart = s.kind === 'sunrise' ? { kind: 'sunrise' } : { kind: 'clock', at: typeof s.at === 'string' ? s.at.slice(0, 5) : '' }
    const end: PlanEnd = e.kind === 'sunset' ? { kind: 'sunset', minus: num(e.minus) }
      : e.kind === 'clock' ? { kind: 'clock', at: typeof e.at === 'string' ? e.at.slice(0, 5) : '' }
        : { kind: 'count', n: num(e.n) }
    return { start, end, interval: num(b.interval), perTime: num(b.perTime) }
  })
  const o = r.opens && typeof r.opens === 'object' ? r.opens as Record<string, unknown> : null
  return { batches, opens: o ? { daysBefore: num(o.daysBefore), time: typeof o.time === 'string' ? o.time.slice(0, 5) : '' } : null }
}

/** Why a plan cannot be kept, in a sentence — or null. Whether it makes any tee times is a day's question (`resolvePlan`). */
export function planIssue(p: TeePlan): string | null {
  if (!p.batches.length) return 'Add the first run of tee times.'
  if (p.batches.length > MAX_BATCHES) return `At most ${MAX_BATCHES} runs of tee times.`
  for (const [i, b] of p.batches.entries()) {
    const which = p.batches.length > 1 ? `Run ${i + 1}: ` : ''
    if (b.start.kind === 'clock' && !CLOCK.test(b.start.at)) return `${which}pick the first tee time.`
    if (b.start.kind === 'sunrise' && i > 0) return `${which}only the first run can start at sunrise.`
    if (!Number.isInteger(b.interval) || b.interval < 5 || b.interval > 20) return `${which}between 5 and 20 minutes between tee times.`
    if (!Number.isInteger(b.perTime) || b.perTime < 2 || b.perTime > 4) return `${which}two, three or four players a tee time.`
    if (b.end.kind === 'count' && (!Number.isInteger(b.end.n) || b.end.n < 1 || b.end.n > 100)) return `${which}between 1 and 100 tee times.`
    if (b.end.kind === 'clock' && !CLOCK.test(b.end.at)) return `${which}pick the last tee time.`
    if (b.end.kind === 'sunset' && (!Number.isInteger(b.end.minus) || b.end.minus < 0 || b.end.minus > 12 * 60)) return `${which}up to 12 hours before sunset.`
  }
  if (p.opens && (!Number.isInteger(p.opens.daysBefore) || p.opens.daysBefore < 0 || p.opens.daysBefore > 30 || !CLOCK.test(p.opens.time))) {
    return 'Booking opens up to 30 days before, at a time.'
  }
  return null
}

/**
 * The plan worked out for a day (M9): each run's first tee time and how
 * many — sunrise and sunset from the course's sun that day — or why no
 * sheet can be made ("no tee times between sunrise and 4h30 before sunset").
 */
export function resolvePlan(p: TeePlan, sun: Pick<SunDay, 'sunrise' | 'sunset'>): { ok: true; batches: CompBatch[] } | { ok: false; why: string } {
  const issue = planIssue(p)
  if (issue) return { ok: false, why: issue }
  const out: CompBatch[] = []
  for (const [i, b] of p.batches.entries()) {
    const which = p.batches.length > 1 ? `Run ${i + 1}: ` : ''
    let start: string | null
    if (b.start.kind === 'sunrise') {
      if (!sun.sunrise) return { ok: false, why: `${which}the sun does not rise that day.` }
      start = sunriseTee(sun.sunrise, b.interval)
    } else start = b.start.at
    if (!start) return { ok: false, why: `${which}no first tee time.` }
    let times: number
    if (b.end.kind === 'count') times = b.end.n
    else if (b.end.kind === 'clock') times = countToLast(start, b.interval, b.end.at) ?? 0
    else {
      const limit = sun.sunset ? clockLess(sun.sunset, b.end.minus) : null
      times = limit ? countUntil(start, b.interval, limit) : 0
    }
    if (times < 1) {
      const until = b.end.kind === 'sunset' ? `${minutesWords(b.end.minus)} before sunset${sun.sunset ? ` (${describeTime(sun.sunset)})` : ''}`
        : b.end.kind === 'clock' ? describeTime(b.end.at) : 'its end'
      return { ok: false, why: `${which}no tee times between ${b.start.kind === 'sunrise' ? `sunrise (${describeTime(sun.sunrise!)})` : describeTime(start)} and ${until}.` }
    }
    out.push({ start, interval: b.interval, perTime: b.perTime, times })
  }
  return { ok: true, batches: out }
}

/** "4h30", "1 hour", "45 minutes". */
export function minutesWords(m: number): string {
  if (m % 60 === 0) return m === 60 ? '1 hour' : `${m / 60} hours`
  if (m < 60) return `${m} minutes`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** A plan in a line: "Sunrise to 4h30 before sunset, every 10, in fours". */
export function planLine(p: TeePlan): string {
  return p.batches.map(b => {
    const from = b.start.kind === 'sunrise' ? 'Sunrise' : describeTime(b.start.at)
    const to = b.end.kind === 'count' ? `${b.end.n} times` : b.end.kind === 'clock' ? `to ${describeTime(b.end.at)}` : `to ${minutesWords(b.end.minus)} before sunset`
    return `${from} ${to}, every ${b.interval}, in ${['', '', 'twos', 'threes', 'fours'][b.perTime] ?? `${b.perTime}s`}`
  }).join('; then ')
}

/** A preset as it arrives from the office's form — tidied; `presetIssue` says whether it can be kept. */
export function readPreset(raw: unknown): Omit<Preset, 'id'> & { id: string | null } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ') : ''
  return {
    id: typeof r.id === 'string' && r.id ? r.id : null,
    code: presetCode(r.code) || presetCodeFrom(name),
    name,
    usedFor: typeof r.usedFor === 'string' && r.usedFor.trim() ? r.usedFor.trim().replace(/\s+/g, ' ') : null,
    scoring: r.scoring === 'strokes' ? 'strokes' : 'stableford',
    allowance: typeof r.allowance === 'number' ? r.allowance : NaN,
    entry: readEntryRules(r.entry),
    plan: readTeePlan(r.plan),
    isDefault: r.isDefault === true,
  }
}

/** Why a preset cannot be kept — or null. `others` are the club's other presets, `categoryIds` its memberships. */
export function presetIssue(p: ReturnType<typeof readPreset>, others: Pick<Preset, 'code' | 'name'>[]): string | null {
  if (!p.name) return 'Name the preset.'
  if (p.name.length > PRESET_NAME_MAX) return `Keep the name under ${PRESET_NAME_MAX} characters.`
  if (!/^[A-Z0-9]{1,12}$/.test(p.code)) return 'A code is up to 12 capitals and digits.'
  if (others.some(o => o.code === p.code)) return `Another preset already uses the code ${p.code}.`
  if (others.some(o => o.name.toLowerCase() === p.name.toLowerCase())) return 'Another preset already has that name.'
  if (p.usedFor && p.usedFor.length > PRESET_USED_FOR_MAX) return `Keep “used for” under ${PRESET_USED_FOR_MAX} characters.`
  if (!Number.isInteger(p.allowance) || p.allowance < 50 || p.allowance > 100) return 'The handicap allowance runs from 50% to 100%.'
  return planIssue(p.plan)
}

/**
 * A competition's form from a preset on a day (M7): its format, allowance,
 * entry rules and tee times copied in — the sheet worked out for that day's
 * sun — or why the sheet cannot be made.
 */
export function formFromPreset(p: Pick<Preset, 'name' | 'scoring' | 'allowance' | 'entry' | 'plan'>, o: { name?: string; date: string; courseId: string; sun: Pick<SunDay, 'sunrise' | 'sunset'> }): { ok: true; form: CompForm } | { ok: false; why: string } {
  const sheet = resolvePlan(p.plan, o.sun)
  if (!sheet.ok) return sheet
  return {
    ok: true,
    form: {
      name: o.name ?? p.name, date: o.date, courseId: o.courseId, scoring: p.scoring, allowance: p.allowance, watch: 'members',
      batches: sheet.batches, opens: p.plan.opens ? { ...p.plan.opens } : null, entry: p.entry ? { ...p.entry } : null,
    },
  }
}

/** A new preset's plan: sunrise until four and a half hours before sunset, every ten, in fours, opening a week before at 8 pm. */
export function starterPlan(): TeePlan {
  return {
    batches: [{ start: { kind: 'sunrise' }, end: { kind: 'sunset', minus: COMP_LAST_TEE_BEFORE_SUNSET_MINS }, interval: 10, perTime: 4 }],
    opens: { daysBefore: 7, time: '20:00' },
  }
}

/**
 * A preset laid onto a form being filled in (New competition, either app):
 * its format, allowance, who may enter and booking opening; its name where
 * the form has none; and, once the form has a day, its tee times worked out
 * for that day's sun — or why they cannot be, the form's own times kept.
 */
export function applyPreset(form: CompForm, p: Pick<Preset, 'name' | 'scoring' | 'allowance' | 'entry' | 'plan'>, sun: Pick<SunDay, 'sunrise' | 'sunset'> | null): { form: CompForm; why: string | null } {
  const next: CompForm = {
    ...form, name: form.name || p.name, scoring: p.scoring, allowance: p.allowance,
    entry: p.entry ? { ...p.entry } : null, opens: p.plan.opens ? { ...p.plan.opens } : null,
  }
  if (!form.date || !sun) return { form: next, why: null }
  const sheet = resolvePlan(p.plan, sun)
  return sheet.ok ? { form: { ...next, batches: sheet.batches }, why: null } : { form: next, why: `Tee sheet not made: ${sheet.why}` }
}
