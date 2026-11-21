// A calendar imported into the Clubhouse (stage c2, M12–M16) — the server's
// half; lib/calendarImport.ts holds every rule. Handed its store, so
// `test:clubs` runs it on a stand-in.
//
// * `import.prompt` — the prompt and the blank template, written live from
//   the club: its memberships, presets, home course and the year.
// * `import.preview` — every row read and matched (its Ref, else its day and
//   title) against what the club already has: New, Changed, Same, or bad
//   cells with why; and what the club has in the file's dates that the file
//   does not mention ("Not in this file" — shown, never acted on).
// * `import.rows` — a few rows at a time, each worked out again here (the
//   preview is never trusted): a competition made through New competition's
//   own path (`makeOne`) or changed through the panel's (`changeOne`), a club
//   event kept; one row failing never stops the rest; a row with Check
//   filled only when ticked. Every row a line in the club's activity log
//   under the import's one batch id.

import { isAccount } from '@/lib/account'
import { compFormIssue, type CompForm } from '@/lib/clubComp'
import { entryRulesIssue, type Category } from '@/lib/clubMembership'
import { resolvePlan, type Preset } from '@/lib/clubPresets'
import { irishToday } from '@/lib/clubs'
import { sunDay } from '@/lib/sun'
import { describeRules } from '@/lib/teeSheet'
import { compTeeRules } from '@/lib/clubComp'
import { mayBlockSheet, typeLabel, type ClubEventType, type ClubNote, type EventType } from '@/lib/clubEvents'
import { NO_PLACES, placeFields, type ClubPlaces } from '@/lib/clubLocations'
import {
  MAX_CALENDAR_ROWS, calendarPrompt, calendarTemplate, noteIssue, readCalendarRow, rowAsNote, rowRecipe,
  type CalendarCells, type CalendarContext, type CalendarRow, type PreviewRow, type RowOutcome, type RowStatus,
} from '@/lib/calendarImport'
import { changeOne, competitionAsker, makeOne, type CompetitionStore } from './competition'
import type { ActivityEntry } from './club'

/** What the import asks of the store beyond the competition route's own. */
export interface ImportStore extends CompetitionStore {
  notes?(clubId: string): Promise<ClubNote[] | null>
  saveNote?(clubId: string, note: Omit<ClubNote, 'id'> & { id: string | null }, by: { userId: string; batch?: string | null }): Promise<string>
  presets?(clubId: string): Promise<Preset[] | null>
  /** A course's name and where it is, for the prompt and the sun. */
  course?(courseId: string): Promise<{ name: string; lat: number | null; lng: number | null } | null>
  /** D277: the club's courses and rooms — `used` the courses its competitions play. */
  places?(clubId: string, used: string[]): Promise<ClubPlaces>
  /** Every competition under the club, as its form (null where its sheet does not read), with its Ref. */
  clubComps?(clubId: string): Promise<{ code: string; ref: string | null; name: string; date: string; form: CompForm | null }[]>
}

export type ImportOutcome =
  | { status: 200; body: { ok: true; prompt?: string; template?: string; ready?: boolean; rows?: PreviewRow[]; notInFile?: { name: string; date: string; type: EventType }[]; done?: RowOutcome[] } }
  | { status: 400 | 401 | 403 | 503; body: { ok: false; error: string } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const key = (date: string, title: string) => `${date}|${title.trim().toLowerCase().replace(/\s+/g, ' ')}`

/** A form's answers as compared: the same file twice changes nothing. */
function sameForm(a: CompForm, b: CompForm): boolean {
  const norm = (f: CompForm) => JSON.stringify({
    name: f.name, date: f.date, courseId: f.courseId, scoring: f.scoring, allowance: f.allowance,
    batches: f.batches, opens: f.opens ?? null,
    entry: f.entry ? { ...f.entry, categories: f.entry.categories ? [...f.entry.categories].sort() : undefined, genders: f.entry.genders ? [...f.entry.genders].sort() : undefined } : null,
  })
  return norm(a) === norm(b)
}
const sameNote = (a: ClubNote, b: Omit<ClubNote, 'id'>) =>
  a.title === b.title && a.type === b.type && a.startsOn === b.startsOn && (a.endsOn ?? null) === (b.endsOn ?? null)
  && a.startTime === b.startTime && a.endTime === b.endTime && a.place === b.place && a.notes === b.notes && a.visibility === b.visibility
  && (a.locationId ?? null) === (b.locationId ?? null) && (a.locationCourseId ?? null) === (b.locationCourseId ?? null)

/** Everything a row is worked out against, read once a request. */
async function contextOf(store: ImportStore, clubId: string, year: number) {
  const club = store.club ? await store.club(clubId) : null
  const homeId = club?.homeCourseId ?? null
  const [categories, presets, notes, comps, home] = await Promise.all([
    store.categories ? store.categories(clubId).catch(() => [] as Category[]) : Promise.resolve([] as Category[]),
    store.presets ? store.presets(clubId).catch(() => null) : Promise.resolve(null),
    store.notes ? store.notes(clubId).catch(() => null) : Promise.resolve(null),
    store.clubComps ? store.clubComps(clubId) : Promise.resolve([]),
    homeId && store.course ? store.course(homeId).catch(() => null) : Promise.resolve(null),
  ])
  const used = [...new Set(comps.flatMap(c => (c.form?.courseId ? [c.form.courseId] : [])))]
  const places = store.places ? await store.places(clubId, used).catch(() => NO_PLACES) : NO_PLACES
  const ctx: CalendarContext = {
    clubName: club?.name ?? '', year, homeCourse: home?.name ?? null,
    memberships: categories.map(c => ({ id: c.id, code: c.code, name: c.name, days: c.days })),
    presets: presets ?? [],
    places: [...(places.courses.length > 1 ? places.courses.map(c => c.label) : []), ...places.rooms.map(r => r.name)],
  }
  return { club, homeId, home, categories, presets: presets ?? [], notes, comps, ctx, places, ready: presets !== null && notes !== null }
}
type Context = Awaited<ReturnType<typeof contextOf>>

/** One row worked out: what it becomes, what it matches, and its status. */
function workOut(r: CalendarRow, k: Context, today: string): {
  preview: PreviewRow; form: CompForm | null; note: Omit<ClubNote, 'id'> | null
  comp: Context['comps'][number] | null; existingNote: ClubNote | null
} {
  const base = { line: r.line, type: r.type, title: r.title, date: r.date, ref: r.ref, bad: r.bad, check: r.check, why: null as string | null, sheet: null as string | null, sheetWhy: null as string | null }
  if (r.type === 'COMP') {
    const comp = (r.ref ? k.comps.find(c => c.ref === r.ref) : undefined) ?? k.comps.find(c => key(c.date, c.name) === key(r.date, r.title)) ?? null
    if (r.bad.length) return { preview: { ...base, status: 'bad' }, form: null, note: null, comp, existingNote: null }
    if (!k.homeId) return { preview: { ...base, status: 'bad', why: 'Set the club’s home course in Club settings — a competition is played there.' }, form: null, note: null, comp, existingNote: null }
    const preset = r.comp!.preset ? k.presets.find(p => p.code === r.comp!.preset) ?? null : null
    const recipe = rowRecipe(r, preset)
    const sun = sunDay(r.date, k.home ? { lat: k.home.lat ?? NaN, lng: k.home.lng ?? NaN } : null)
    const sheet = resolvePlan(recipe.plan, sun)
    const form: CompForm = {
      name: r.title, date: r.date, courseId: comp?.form?.courseId ?? k.homeId, scoring: recipe.scoring, allowance: recipe.allowance,
      watch: comp?.form?.watch ?? 'members', batches: sheet.ok ? sheet.batches : comp?.form?.batches ?? [], opens: recipe.plan.opens, entry: recipe.entry,
    }
    const sheetWhy = sheet.ok ? null : sheet.why
    const status: RowStatus = !comp ? 'new' : comp.form && sameForm(comp.form, form) ? 'same' : 'changed'
    const issue = status !== 'same' && r.date < today ? (comp ? 'That day has gone — a competition played can’t be changed by a file.' : 'That day has gone.')
      : entryRulesIssue(recipe.entry, k.categories.map(c => c.id))
    if (issue) return { preview: { ...base, status: 'bad', why: issue }, form: null, note: null, comp, existingNote: null }
    return {
      preview: { ...base, status, sheet: sheet.ok ? describeRules(compTeeRules(form)) : null, sheetWhy },
      form, note: null, comp, existingNote: null,
    }
  }
  const notes = k.notes ?? []
  const existing = (r.ref ? notes.find(n => n.ref === r.ref) : undefined) ?? notes.find(n => key(n.startsOn, n.title) === key(r.date, r.title)) ?? null
  if (r.bad.length) return { preview: { ...base, status: 'bad' }, form: null, note: null, comp: null, existingNote: existing }
  // D277: Where matched to one of the club's places, else kept as text and said so.
  const at = placeFields(r.type as ClubEventType, r.place, k.places)
  const note = { ...rowAsNote(r), place: at.place, locationId: at.locationId, locationCourseId: at.locationCourseId }
  const issue = noteIssue(note)
  if (issue) return { preview: { ...base, status: 'bad', why: issue }, form: null, note: null, comp: null, existingNote: existing }
  // A calendar file says nothing about the tee sheet: an event the office set to take it keeps doing so.
  const n = { ...note, ref: note.ref ?? existing?.ref ?? null, blocksSheet: !!existing?.blocksSheet && mayBlockSheet(note.type) }
  const placeNote = at.kept ? `Where: “${at.place}” isn’t one of the club’s places — kept as text.` : null
  return { preview: { ...base, status: !existing ? 'new' : sameNote(existing, n) ? 'same' : 'changed', placeNote }, form: null, note: n, comp: null, existingNote: existing }
}

/** The rows a request carries, read against the club. */
function readRows(raw: unknown, k: Context): CalendarRow[] {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_CALENDAR_ROWS)
    .filter((x): x is { line: number; cells: CalendarCells } => !!x && typeof x === 'object' && typeof (x as { line?: unknown }).line === 'number')
    .map(x => readCalendarRow(x.line, x.cells && typeof x.cells === 'object' ? x.cells : {}, k.ctx))
}

export async function runCalendarImport(
  input: { token: string | null; action: unknown; clubId: unknown; rows?: unknown; confirmed?: unknown; batch?: unknown; year?: unknown },
  store: ImportStore,
  now: Date,
): Promise<ImportOutcome> {
  const no = (status: 400 | 401 | 403 | 503, error: string): ImportOutcome => ({ status, body: { ok: false, error } })
  if (!input.token) return no(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return no(403, 'Sign in to your Green Dot account first.')
  const who = await competitionAsker(store, user.id, input.clubId, 'clubhouse')
  if (!who.ok) return no(403, who.error.replace('makes the club’s competitions', 'imports the club’s calendar'))
  const today = irishToday(now)
  const thisYear = Number(today.slice(0, 4))

  if (input.action === 'import.prompt') {
    const year = typeof input.year === 'number' && input.year >= thisYear - 1 && input.year <= thisYear + 2 ? input.year : thisYear
    const k = await contextOf(store, who.club.id, year)
    return { status: 200, body: { ok: true, prompt: calendarPrompt(k.ctx), template: calendarTemplate(k.ctx), ready: k.ready } }
  }

  const raw = Array.isArray(input.rows) ? input.rows : []
  const firstDate = raw.map(r => String((r as { cells?: { Date?: string } })?.cells?.Date ?? '')).find(d => /^\d{4}/.test(d))
  const k = await contextOf(store, who.club.id, firstDate ? Number(firstDate.slice(0, 4)) : thisYear)
  if (!k.ready) return no(503, 'The club’s calendar isn’t set up yet — try again later.')
  const rows = readRows(input.rows, k)
  if (!rows.length) return no(400, 'No rows to read.')

  if (input.action === 'import.preview') {
    const worked = rows.map(r => workOut(r, k, today))
    const dates = rows.map(r => r.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
    const [from, to] = [dates[0], dates[dates.length - 1]]
    const seenComps = new Set(worked.map(w => w.comp?.code).filter(Boolean))
    const seenNotes = new Set(worked.map(w => w.existingNote?.id).filter(Boolean))
    const inRange = (d: string) => !!from && d >= from && d <= to
    const notInFile = [
      ...k.comps.filter(c => inRange(c.date) && !seenComps.has(c.code)).map(c => ({ name: c.name, date: c.date, type: 'COMP' as EventType })),
      ...(k.notes ?? []).filter(n => inRange(n.startsOn) && !seenNotes.has(n.id)).map(n => ({ name: n.title, date: n.startsOn, type: n.type as EventType })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    return { status: 200, body: { ok: true, rows: worked.map(w => w.preview), notInFile } }
  }

  if (input.action !== 'import.rows') return no(400, 'What should the import do?')
  const batch = typeof input.batch === 'string' && UUID.test(input.batch) ? input.batch : null
  if (!batch) return no(400, 'The import needs its batch.')
  if (rows.length > 25) return no(400, 'At most 25 rows at a time.')
  const confirmed = new Set((Array.isArray(input.confirmed) ? input.confirmed : []).filter((x): x is number => typeof x === 'number'))
  const done: RowOutcome[] = []
  const log: ActivityEntry[] = []
  for (const r of rows) {
    const w = workOut(r, k, today)
    const say = (outcome: RowOutcome['outcome'], why: string | null) => {
      done.push({ line: r.line, title: r.title, outcome, why })
      log.push({
        clubId: who.club.id, byUser: user.id, byName: who.byName, byStaff: who.staff, action: 'calendar.import',
        memberId: null, memberName: null, changes: { [`${r.title} · ${r.date}`]: [`${typeLabel(r.type)} · ${w.preview.status}`, why ? `${outcome}: ${why}` : outcome] }, batchId: batch,
      })
    }
    try {
      if (w.preview.status === 'bad') { say('failed', w.preview.why ?? w.preview.bad.map(b => `${b.column}: ${b.why}`).join(' ')); continue }
      if (r.check && !confirmed.has(r.line)) { say('skipped', 'Check not ticked.'); continue }
      if (w.preview.status === 'same') { say('same', w.preview.sheetWhy ? `Tee sheet kept: ${w.preview.sheetWhy}` : null); continue }
      if (w.note) {
        if (!store.saveNote) { say('failed', 'The club’s calendar isn’t set up yet.'); continue }
        await store.saveNote(who.club.id, { ...w.note, id: w.existingNote?.id ?? null }, { userId: user.id, batch })
        say(w.existingNote ? 'changed' : 'made', null)
        continue
      }
      const form = w.form!
      if (!w.comp) {
        // A new competition whose tee sheet cannot be made is not made (M11): the row is fixed and imported again.
        if (w.preview.sheetWhy) { say('failed', `Tee sheet not made: ${w.preview.sheetWhy}`); continue }
        const issue = compFormIssue(form, today)
        if (issue) { say('failed', issue); continue }
        const out = await makeOne(store, input.token, who.club.id, form, now, who.club, r.ref)
        if (!out.ok) { say('failed', out.error); continue }
        say('made', null)
        continue
      }
      // An existing competition keeps its old tee sheet where the new one cannot be made or changed (M16).
      const c = store.compNow ? await store.compNow(w.comp.code) : null
      if (!c) { say('failed', 'That competition could not be read.'); continue }
      if (c.certified) { say('failed', 'Its results are certified.'); continue }
      if (c.started) { say('failed', 'A card has started.'); continue }
      const sheetForm = w.preview.sheetWhy ? { ...form, batches: c.rules.batches.map(b => ({ start: b.start, interval: b.interval, perTime: b.groupSize ?? c.rules.groupSize, times: b.count })) } : form
      sheetForm.watch = c.membersOnly ? 'members' : 'guests'
      const issue = compFormIssue(sheetForm, today)
      if (issue) { say('failed', issue); continue }
      const out = await changeOne(store, c, sheetForm, true)
      if (!out.ok) { say('failed', out.error); continue }
      const kept = w.preview.sheetWhy ? `Tee sheet kept: ${w.preview.sheetWhy}` : out.keptSheet ? `Tee sheet kept: ${out.keptSheet.map(p => `${p.name} — ${p.why}`).join(' ')}` : null
      say('changed', kept)
    } catch (e) {
      console.error('calendar row failed:', e)
      say('failed', 'Could not save this row — try again.')
    }
  }
  if (store.logActivity && log.length) await store.logActivity(log).catch(e => console.error('club activity not logged:', e))
  return { status: 200, body: { ok: true, done } }
}
