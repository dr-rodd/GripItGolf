// A club's season brought in from whatever calendar it keeps — the only copy
// of the rules (Clubhouse stage c2, M12–M17; Ross, 17 Nov 2026).
//
// Green Dot never reads the club's calendar itself and never asks an AI
// (M17). It writes a **prompt** from the club's own setup — its memberships,
// presets, home course, the year, the types and who sees them, the CSV
// header and the rules — which the club takes, with its calendar file, to
// any chatbot. The chatbot answers with a CSV in **Green Dot calendar format
// v1**, which the Clubhouse reads here, previews row by row and imports:
// competitions through New competition's own path, everything else as the
// club's own events. Nothing is deleted by an import; a row whose Check is
// filled imports only when ticked.
//
// Pure. No I/O. `app/api/club/calendarImport.ts` matches and writes.

import { parseCsv, csvCell } from './csv'
import { CLUB_EVENT_TYPES, EVENT_TYPES, OFFICE_TYPES, isEventType, readClubNote, noteIssue, type ClubEventType, type EventType } from './clubEvents'
import { WEEKDAY_NAMES, type EntryRules, type Gender } from './clubMembership'
import { COMP_LAST_TEE_BEFORE_SUNSET_MINS } from './sun'
import { planLine, type PlanBatch, type Preset, type TeePlan } from './clubPresets'
import type { CompScoring } from './clubComp'

export const CALENDAR_FORMAT = 'Green Dot calendar format v1'
export const CALENDAR_VERSION = 1

/** The columns of v1, in order (M14). */
export const CALENDAR_COLUMNS = [
  'Ref', 'Date', 'End date', 'Start', 'End', 'Title', 'Type', 'Visibility', 'Memberships',
  'Gender', 'Min age', 'Max age', 'Format', 'Allowance', 'Preset', 'Where', 'Notes', 'Check',
] as const
export type CalendarColumn = (typeof CALENDAR_COLUMNS)[number]
export type CalendarCells = Partial<Record<CalendarColumn, string>>

/** At most this many rows in one file. */
export const MAX_CALENDAR_ROWS = 1000

/** What the prompt and the reading know of the club. */
export interface CalendarContext {
  clubName: string
  year: number
  homeCourse: string | null
  memberships: { id: string; code: string; name: string; days: number[] }[]
  presets: Pick<Preset, 'code' | 'name' | 'usedFor' | 'isDefault' | 'plan'>[]
}

// ─── Reading the file ─────────────────────────────────────────

/** The file read into rows of cells by column — or why it cannot be read. */
export function readCalendarFile(text: string): { ok: true; rows: { line: number; cells: CalendarCells }[] } | { ok: false; why: string } {
  const { rows, lines } = parseCsv(text)
  if (!rows.length) return { ok: false, why: 'The file is empty.' }
  let at = 0
  const stamp = /^#?\s*green dot calendar format v(\d+)\s*$/i.exec(rows[0][0] ?? '')
  if (stamp) {
    if (Number(stamp[1]) !== CALENDAR_VERSION) {
      return { ok: false, why: `This file is in Green Dot calendar format v${stamp[1]}, and this page reads v${CALENDAR_VERSION}. Copy the prompt from this page and ask the chatbot again.` }
    }
    at = 1
  }
  const header = (rows[at] ?? []).map(h => h.toLowerCase())
  const want = CALENDAR_COLUMNS.map(c => c.toLowerCase())
  if (header.length < want.length || want.some((w, i) => header[i] !== w)) {
    return { ok: false, why: `The columns aren’t ${CALENDAR_FORMAT}’s — the first line after the stamp must be ${CALENDAR_COLUMNS.join(', ')}. Copy the prompt from this page and ask the chatbot again.` }
  }
  const body = rows.slice(at + 1)
  if (body.length === 0) return { ok: false, why: 'The file has the header and no rows.' }
  if (body.length > MAX_CALENDAR_ROWS) return { ok: false, why: `At most ${MAX_CALENDAR_ROWS} rows at a time — import the season in parts.` }
  return {
    ok: true,
    rows: body.map((r, i) => ({ line: lines[at + 1 + i], cells: Object.fromEntries(CALENDAR_COLUMNS.map((c, j) => [c, (r[j] ?? '').trim()])) as CalendarCells })),
  }
}

/** One row as the import reads it: a competition's answers or a club event's, and every bad cell with why. */
export interface CalendarRow {
  line: number
  ref: string | null
  date: string
  endDate: string | null
  /** "HH:MM", "SUNRISE" / "SUNSET", or null. */
  start: string | null
  end: string | null
  title: string
  type: EventType
  visibility: 'members' | 'office'
  /** A competition's own answers — each null where the row left it to the preset. */
  comp: {
    categoryIds: string[] | null
    gender: Gender | null
    minAge: number | null
    maxAge: number | null
    scoring: CompScoring | null
    allowance: number | null
    /** The preset's code: the row's, else the club's default, else none. */
    preset: string | null
  } | null
  place: string | null
  notes: string | null
  check: string | null
  bad: { column: CalendarColumn; why: string }[]
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const realDay = (d: string) => DAY.test(d) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d)

/** One row's cells read against the club (M14, M15): what it says, and every cell that cannot be used. */
export function readCalendarRow(line: number, c: CalendarCells, ctx: Pick<CalendarContext, 'memberships' | 'presets'>): CalendarRow {
  const bad: CalendarRow['bad'] = []
  const cell = (k: CalendarColumn) => (c[k] ?? '').trim()
  const no = (column: CalendarColumn, why: string) => bad.push({ column, why })

  const typeRaw = cell('Type').toUpperCase()
  const type: EventType = isEventType(typeRaw) ? typeRaw : 'MISC'
  if (!isEventType(typeRaw)) no('Type', typeRaw ? `“${cell('Type')}” isn’t a type — ${EVENT_TYPES.map(t => t.code).join(', ')}.` : 'Every row needs a Type.')
  const isComp = type === 'COMP'

  const ref = cell('Ref') || null
  if (ref && ref.length > 40) no('Ref', 'A Ref is up to 40 characters.')
  const date = cell('Date')
  if (!realDay(date)) no('Date', date ? `“${date}” isn’t a date — YYYY-MM-DD.` : 'Every row needs a Date.')
  const endDate = cell('End date') || null
  if (endDate && (!realDay(endDate) || endDate < date)) no('End date', `“${endDate}” isn’t a date on or after the Date.`)
  if (isComp && endDate && endDate !== date) no('End date', 'A competition is one day — leave End date blank.')

  const clock = (k: 'Start' | 'End') => {
    const v = cell(k).toUpperCase()
    if (!v) return null
    if (isComp && v === (k === 'Start' ? 'SUNRISE' : 'SUNSET')) return v
    if (CLOCK.test(v)) return v
    if (/^\d:[0-5]\d$/.test(v)) return `0${v}`
    no(k, isComp ? `“${cell(k)}” isn’t a time — HH:MM${k === 'Start' ? ' or SUNRISE' : ' or SUNSET'}.` : `“${cell(k)}” isn’t a time — HH:MM.`)
    return null
  }
  const start = clock('Start'), end = clock('End')
  if (!isComp && start && end && (endDate ?? date) === date && end <= start) no('End', 'It ends after it starts.')
  if (!isComp && end && !start) no('Start', 'An End needs a Start.')

  const title = cell('Title').replace(/\s+/g, ' ')
  if (!title) no('Title', 'Every row needs a Title.')
  else if (title.length > (isComp ? 60 : 80)) no('Title', `Keep the title under ${isComp ? 60 : 80} characters.`)

  const vis = cell('Visibility').toUpperCase()
  const visibility = vis === 'OFFICE' ? 'office' as const : 'members' as const
  if (vis && vis !== 'MEMBERS' && vis !== 'OFFICE') no('Visibility', `“${cell('Visibility')}” — MEMBERS or OFFICE.`)
  if (visibility === 'office' && !(OFFICE_TYPES as readonly string[]).includes(type)) no('Visibility', `${EVENT_TYPES.find(t => t.code === type)?.label ?? type} rows touch the golf, so members always see them — MEMBERS.`)

  let comp: CalendarRow['comp'] = null
  if (isComp) {
    const codes = cell('Memberships').split('|').map(s => s.trim().toUpperCase()).filter(Boolean)
    const ids: string[] = []
    for (const code of codes) {
      const m = ctx.memberships.find(x => x.code === code)
      if (m) ids.push(m.id)
      else no('Memberships', `“${code}” isn’t one of the club’s memberships${ctx.memberships.length ? ` — ${ctx.memberships.map(x => x.code).join(', ')}` : ' (it has none set up)'}.`)
    }
    const g = cell('Gender').toUpperCase()
    if (g && g !== 'M' && g !== 'F') no('Gender', `“${cell('Gender')}” — M, F or blank.`)
    const age = (k: 'Min age' | 'Max age') => {
      const v = cell(k)
      if (!v) return null
      const n = Number(v)
      if (!/^\d{1,3}$/.test(v) || n > 110) { no(k, `“${v}” isn’t an age.`); return null }
      return n
    }
    const minAge = age('Min age'), maxAge = age('Max age')
    if (minAge !== null && maxAge !== null && minAge > maxAge) no('Max age', 'The Max age is at least the Min age.')
    const f = cell('Format').toUpperCase()
    if (f && f !== 'STABLEFORD' && f !== 'STROKES') no('Format', `“${cell('Format')}” — STABLEFORD or STROKES. Anything else is a GOLF row.`)
    const a = cell('Allowance')
    const allowance = a ? Number(a.replace(/%$/, '')) : null
    if (a && (!Number.isInteger(allowance) || allowance! < 50 || allowance! > 100)) no('Allowance', `“${a}” — a whole number from 50 to 100, or blank.`)
    const p = cell('Preset').toUpperCase()
    const preset = p ? (ctx.presets.some(x => x.code === p) ? p : null) : ctx.presets.find(x => x.isDefault)?.code ?? null
    if (p && !preset) no('Preset', `“${cell('Preset')}” isn’t one of the club’s presets${ctx.presets.length ? ` — ${ctx.presets.map(x => x.code).join(', ')}` : ' (it has none set up)'}.`)
    if (!preset && !p && !start) no('Start', 'The club has no default preset, so a competition needs a Start (or name a Preset).')
    comp = {
      categoryIds: codes.length ? ids : null,
      gender: g === 'M' || g === 'F' ? g : null,
      minAge, maxAge,
      scoring: f === 'STROKES' ? 'strokes' : f === 'STABLEFORD' ? 'stableford' : null,
      allowance: a && Number.isInteger(allowance) ? allowance : null,
      preset,
    }
  }
  const place = cell('Where') || null
  if (place && place.length > 80) no('Where', 'Keep Where under 80 characters.')
  const notes = cell('Notes') || null
  if (notes && notes.length > 1000) no('Notes', 'Keep the Notes under 1,000 characters.')
  return { line, ref, date, endDate, start, end, title, type, visibility, comp, place, notes, check: cell('Check') || null, bad }
}

/** A club event's row as the club's own event (`club_events`), or why it cannot be one. */
export function rowAsNote(r: CalendarRow): ReturnType<typeof readClubNote> {
  return readClubNote({
    ref: r.ref, title: r.title, type: r.type as ClubEventType, startsOn: r.date, endsOn: r.endDate,
    startTime: r.start, endTime: r.end, place: r.place, notes: r.notes, visibility: r.visibility,
  })
}
export { noteIssue }

/**
 * A competition row as a preset-like recipe (M7, M14): the preset's answers
 * with the row's own laid over them — Format, Allowance, who may enter (each
 * given part replaces the preset's), and Start/End replacing the preset's
 * tee times with one run at its first interval and players a time (Ross,
 * 17 Nov 2026). Worked out for the day by the server.
 */
export function rowRecipe(r: CalendarRow, preset: Pick<Preset, 'scoring' | 'allowance' | 'entry' | 'plan'> | null): {
  scoring: CompScoring; allowance: number; entry: EntryRules | null; plan: TeePlan
} {
  const c = r.comp!
  const base = preset?.entry ?? {}
  const entry: EntryRules = {
    ...base,
    ...(c.categoryIds ? { categories: c.categoryIds } : {}),
    ...(c.gender ? { genders: [c.gender] } : {}),
    ...(c.minAge !== null ? { minAge: c.minAge } : {}),
    ...(c.maxAge !== null ? { maxAge: c.maxAge } : {}),
  }
  const first: PlanBatch | undefined = preset?.plan.batches[0]
  const plan: TeePlan = r.start || r.end || !preset
    ? {
        batches: [{
          start: r.start === 'SUNRISE' ? { kind: 'sunrise' } : r.start ? { kind: 'clock', at: r.start } : first?.start ?? { kind: 'sunrise' },
          end: r.end === 'SUNSET' ? { kind: 'sunset', minus: COMP_LAST_TEE_BEFORE_SUNSET_MINS } : r.end ? { kind: 'clock', at: r.end } : first?.end ?? { kind: 'sunset', minus: COMP_LAST_TEE_BEFORE_SUNSET_MINS },
          interval: first?.interval ?? 10,
          perTime: first?.perTime ?? 4,
        }],
        opens: preset ? preset.plan.opens : { daysBefore: 7, time: '20:00' },
      }
    : preset.plan
  return {
    scoring: c.scoring ?? preset?.scoring ?? 'stableford',
    allowance: c.allowance ?? preset?.allowance ?? 95,
    entry: Object.keys(entry).length ? entry : null,
    plan,
  }
}

// ─── What the preview and the import answer (M15, M16) ────────────

export type RowStatus = 'new' | 'changed' | 'same' | 'bad'
export interface PreviewRow {
  line: number
  status: RowStatus
  type: EventType
  title: string
  date: string
  ref: string | null
  /** The cells that cannot be used, by column — in rust. */
  bad: { column: string; why: string }[]
  /** A reason the row as a whole cannot come in (a date gone, no home course). */
  why: string | null
  /** The chatbot's doubt — the row imports only when ticked. */
  check: string | null
  /** A competition's tee times in a line, or why they cannot be made. */
  sheet: string | null
  sheetWhy: string | null
}
export interface RowOutcome { line: number; title: string; outcome: 'made' | 'changed' | 'same' | 'skipped' | 'failed'; why: string | null }


// ─── The prompt and the template (M13) ────────────────────────

const EXAMPLE_COMP = (ctx: CalendarContext) => {
  const p = ctx.presets.find(x => x.isDefault) ?? ctx.presets[0]
  const m = ctx.memberships[0]
  return ['MED-0418', `${ctx.year}-04-18`, '', '', '', 'April Medal', 'COMP', 'MEMBERS', m ? m.code : '', 'M', '', '', 'STROKES', '', p ? p.code : '', '', '', '']
}
const EXAMPLE_NOTE = (ctx: CalendarContext) => ['AGM', `${ctx.year}-03-05`, '', '20:00', '22:00', 'Annual General Meeting', 'BUSINESS', 'MEMBERS', '', '', '', '', '', '', '', 'Clubhouse lounge', 'Members only. Agenda on the noticeboard.', '']

/** The blank template (M12): the stamp, the header and the two example rows. */
export function calendarTemplate(ctx: CalendarContext): string {
  return [[CALENDAR_FORMAT], [...CALENDAR_COLUMNS], EXAMPLE_COMP(ctx), EXAMPLE_NOTE(ctx)].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** The prompt (M13), written live from the club's own setup. */
export function calendarPrompt(ctx: CalendarContext): string {
  const days = (d: number[]) => (d.length === 7 ? 'every day' : d.length === 0 ? 'no days' : d.slice().sort((a, b) => a - b).map(i => WEEKDAY_NAMES[i]).join(', '))
  const memberships = ctx.memberships.length
    ? ctx.memberships.map(m => `- ${m.code}: ${m.name} (plays ${days(m.days)})`).join('\n')
    : '- (The club has no memberships set up. Leave Memberships blank on every row.)'
  const presets = ctx.presets.length
    ? ctx.presets.map(p => `- ${p.code}: ${p.name}${p.isDefault ? ' (the default)' : ''}${p.usedFor ? ` — used for ${p.usedFor}` : ''}. Tee times: ${planLine(p.plan)}.`).join('\n')
    : '- (The club has no presets. Give every COMP row a Start and an End.)'
  const types = EVENT_TYPES.map(t => `- ${t.code}: ${t.label}${t.code === 'COMP' ? ' — a competition members book on Green Dot' : t.code === 'GOLF' ? ' — golf on the calendar that is not booked here: interclubs, societies, team matches, scrambles, any format other than singles Stableford or strokeplay' : t.code === 'COURSE' ? ' — course closures, maintenance, hollow-tining' : t.code === 'BUSINESS' ? ' — the AGM, committee meetings' : t.code === 'SPORT' ? ' — tennis, bridge, other sports' : ''}`).join('\n')
  const ex = [CALENDAR_FORMAT, CALENDAR_COLUMNS.join(','), EXAMPLE_COMP(ctx).map(csvCell).join(','), EXAMPLE_NOTE(ctx).map(csvCell).join(',')].join('\n')
  return `You are turning a golf club's calendar into a CSV file for Green Dot, the club's booking and scoring platform. I will give you the calendar after these instructions (a document, a spreadsheet, a calendar export or a photo). Read every event in it for the ${ctx.year} season.

THE CLUB
- Name: ${ctx.clubName}
- Home course: ${ctx.homeCourse ?? '(not set)'}
- Season: ${ctx.year}

ITS MEMBERSHIPS (use only these codes, in the Memberships column)
${memberships}

ITS PRESETS (use only these codes, in the Preset column)
${presets}

EVENT TYPES (the Type column)
${types}

WHO SEES IT (the Visibility column)
- MEMBERS: members see it in the app. Every COMP, GOLF and COURSE row is MEMBERS.
- OFFICE: only the club office sees it. Only for ${CLUB_EVENT_TYPES.filter(t => (OFFICE_TYPES as readonly string[]).includes(t)).join(', ')} rows that members should not see.

THE FILE — ${CALENDAR_FORMAT}
Answer with the CSV only, in one code block, nothing before or after it. The first line is exactly:
${CALENDAR_FORMAT}
The second line is exactly this header:
${CALENDAR_COLUMNS.join(',')}
Then one line per event. Dates are YYYY-MM-DD, times HH:MM in 24-hour Irish time. Quote any cell that holds a comma.

THE COLUMNS
- Ref: a short reference that stays the same if you are asked again for the same calendar (for example MED-0418). Never reuse one for two events.
- Date: the day it starts. End date: only for events over several days; blank otherwise. A COMP is always one day.
- Start, End: the times, if the calendar gives them. On a COMP, blank Start and End mean the preset's tee times; SUNRISE and SUNSET may be used.
- Title: the event's name as the calendar gives it.
- Type: one of the codes above. COMP only for a singles Stableford or strokeplay competition; anything else golf is GOLF.
- Visibility: MEMBERS or OFFICE.
- Memberships (COMP only): the membership codes that may enter, separated by | (for example FULL|6DAY). Blank means the preset's memberships, or with none, whoever's membership plays that day.
- Gender (COMP only): M for a men's competition, F for a ladies', blank for both.
- Min age, Max age (COMP only): whole numbers, or blank.
- Format (COMP only): STABLEFORD or STROKES, or blank for the preset's.
- Allowance (COMP only): the handicap allowance, a whole number from 50 to 100, or blank for the preset's (95 if there is none).
- Preset (COMP only): one of the preset codes above, or blank for the club's default.
- Where: where it happens, if not the course.
- Notes: anything else worth telling members, short.
- Check: blank, unless you are unsure of anything in the row — then say what, in a few words. Rows with Check filled are looked at by a person before they come in.

THE RULES
- Never invent a membership, a preset or a date. If the calendar does not say, leave the cell blank and say so in Check.
- If you are in any doubt about a row — its type, its date, who may enter — fill in Check.
- COMP only for singles Stableford or strokeplay. Fourballs, foursomes, scrambles, team events, opens and anything else are GOLF.
- One line per event; a weekly event is one line per week.

AN EXAMPLE (two rows)
\`\`\`
${ex}
\`\`\``
}
