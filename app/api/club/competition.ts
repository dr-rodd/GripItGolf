// Making a club competition (D162, stage (d2)) — a verified club's owner or
// admin, from the short form on Comps. The event is made through the one
// create route's own checks (`runCreate`, handed the club), then its golf
// item and its round — on the tee sheet from the start, the sheet's rules
// written at once — in the same request, so nothing is ever half-made: a
// failure after the event exists takes the event back.
//
// What it is (lib/clubComp.ts): a tournament, standalone, one day, one
// round, one board; no PIN — Club admins only (D138–D140, a PIN nobody is
// given); members only (D164: the public PIN door with a PIN nobody is
// given, opened by the club's list) unless guests may watch (D184); the
// handicap the account's (D179). Handed its store, so `test:clubs` runs it.

import { isAccount, type AuthUser } from '@/lib/account'
import { compBoard, compFirstTee, compFormFrom, compFormIssue, compPermissions, compTeeRules, planSheetChange, readCompForm, type CompForm, type SheetBooking } from '@/lib/clubComp'
import { entryRefusal, readAgeDate, readEntryRules, refusalWords } from '@/lib/clubMembership'
import { teeClocks, type TeeRules } from '@/lib/teeSheet'
import { STAFF_NAME } from '@/lib/clubhouse'
import { MAX_COPIES } from '@/lib/clubhouse'
import { irishToday } from '@/lib/clubs'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { NO_FORMATS } from '@/lib/formats'
import { toItemRow } from '@/lib/itinerarySync'
import { unheldPin } from '@/lib/pinHash'
import { entryRulesIssue, type Category, type EntryRules } from '@/lib/clubMembership'
import { overdueMatches, type OverdueMatch } from '@/lib/clubMatchPlay'
import { matchPlayBoard, matchPlayDates, matchPlayFormIssue, matchPlayLine, matchPlayPermissions, matchPlayPhase, matchPlayRules, matchPlaySeed, readMatchPlayForm } from '@/lib/clubMatchPlay'
import { PHASE_WORDS } from '@/lib/compPhase'
import { formatLine } from '@/lib/clubhouse'
import { runCreate, type CreateStore } from '../trip/create/create'
import type { ClubRecord, MemberRecord } from './club'

/**
 * Who may make or change a club's competitions from where (Ross, 17 Nov
 * 2026): in the members app its Officers (D219); in the Clubhouse its
 * Clubhouse holders and Green Dot staff (`keep_calendar` — Clubhouse is its
 * own level of admin). The club, and the name its log carries.
 */
export async function competitionAsker(store: CompetitionStore, userId: string, clubId: unknown, from: 'app' | 'clubhouse'):
  Promise<{ ok: true; club: ClubRecord; byName: string; staff: boolean } | { ok: false; error: string }> {
  if (from === 'app') {
    const mine = (await store.clubsOf(userId)).find(x => x.club.id === clubId)
    if (!mine || !mine.club.verifiedAt || !clubMay('run_events', { row: credentialsOf(mine.row) })) return { ok: false, error: 'Only a verified club’s Officers make its competitions.' }
    return { ok: true, club: mine.club, byName: mine.row.name, staff: false }
  }
  if (typeof clubId !== 'string' || !store.club) return { ok: false, error: 'Only someone with Clubhouse makes the club’s competitions here.' }
  const [club, row, staff] = await Promise.all([
    store.club(clubId),
    store.rowOf ? store.rowOf(clubId, userId).catch(() => null) : Promise.resolve(null),
    store.isStaff ? store.isStaff(userId).catch(() => false) : Promise.resolve(false),
  ])
  if (!club || !club.verifiedAt || !clubMay('keep_calendar', { row: row ? credentialsOf(row) : null, staff })) {
    return { ok: false, error: 'Only someone with Clubhouse makes the club’s competitions here.' }
  }
  return { ok: true, club, byName: row ? row.name : STAFF_NAME, staff: !row && staff }
}

export interface CompetitionStore {
  userFromToken(token: string): Promise<AuthUser | null>
  clubsOf(userId: string): Promise<{ club: ClubRecord; row: MemberRecord }[]>
  /** The create route's own store. */
  create: CreateStore
  insertItem(row: ReturnType<typeof toItemRow>): Promise<string>
  insertRound(row: Record<string, unknown>): Promise<void>
  deleteTrip(tripId: string): Promise<void>
  newCode(): string
  newId(): string
  /**
   * Stage (k2): a competition as it was made, for Copy and Repeat weekly —
   * its club, name, day, course, board, tee sheet and whether members only.
   */
  compSource?(code: string): Promise<{
    clubId: string; name: string; date: string; courseId: string
    board: { scoring?: unknown; handicapAllowance?: unknown } | null; teeSheet: unknown; membersOnly: boolean
    /** Stage (m): its entry rules as stored. */
    entry?: unknown
  } | null>
  /** Stage (m): the club's memberships, for checking a competition's entry rules. */
  categories?(clubId: string): Promise<Category[]>
  /** Stage (m): a competition's entry rules into trip_private (094) — throws when the column is missing. */
  setEntryRules?(tripId: string, rules: EntryRules): Promise<void>
  /** Stage c2 (095): the calendar file's Ref on a competition it made. */
  setImportRef?(tripId: string, ref: string): Promise<void>
  /** The club's activity log (092), fail-soft. */
  logActivity?(entries: import('./club').ActivityEntry[]): Promise<void>

  // Stage c1 — the Clubhouse makes and changes competitions (`keep_calendar`).
  /** A club by its id, for staff and Clubhouse holders. */
  club?(clubId: string): Promise<ClubRecord | null>
  /** This account's row at the club, linked and not taken off. */
  rowOf?(clubId: string, userId: string): Promise<MemberRecord | null>
  isStaff?(userId: string): Promise<boolean>
  /** A competition as it stands, for changing it: its rows, sheet, entry rules, bookings, and whether a card has started or it is certified. */
  compNow?(code: string): Promise<CompNow | null>
  /** The list rows of the members booked, for their entry under new rules. */
  rowsByIds?(clubId: string, ids: string[]): Promise<MemberRecord[]>
  /** The club's age date ('MM-DD'). */
  ageDate?(clubId: string): Promise<string>
  /** List rows an Officer booked anyway onto this competition (D231's `booking.override` lines). */
  overrides?(clubId: string, code: string): Promise<Set<string>>
  /** A change written: the bookings moved, then the round, its item, the event and its entry rules. */
  applyChange?(c: CompNow, change: CompChange): Promise<void>
}

/** A competition as it stands, read for a change (stage c1, M11). */
export interface CompNow {
  tripId: string
  roundId: string
  itemId: string | null
  clubId: string
  code: string
  name: string
  date: string
  courseId: string
  rules: TeeRules
  leaderboards: unknown[]
  entry: unknown
  membersOnly: boolean
  started: boolean
  certified: boolean
  bookings: { playerId: string; rowId: string | null; name: string; slot: number }[]
}

/** What a change writes. */
export interface CompChange {
  moves: { playerId: string; slot: number }[]
  name: string
  date: string
  courseId: string
  teeSheet: TeeRules
  firstTee: string
  leaderboards: unknown[]
  entry: CompForm['entry']
  /** Who can watch (D274): members only, or guests too. Written only when it differs from the competition as it stands. */
  membersOnly: boolean
}

export type CompetitionOutcome =
  | { status: 200; body: { ok: true; code: string; slug: string }; doorCookie: string | null }
  | { status: 400 | 401 | 403 | 404 | 503; body: { ok: false; error: string } }

const fail = (status: 400 | 401 | 403 | 404 | 503, error: string): CompetitionOutcome => ({ status, body: { ok: false, error } })

/** Who may enter cannot be kept yet (before migration 094). */
export class EntryNotReady extends Error {
  constructor() { super('trip_private.entry_rules is missing (migration 094)'); this.name = 'EntryNotReady' }
}
const ENTRY_LATER = 'Who may enter isn’t set up yet — open it to everybody, or try again later.'

/** One competition made: the event through the create route's own checks, then its golf item and round — or why not. */
export async function makeOne(
  store: CompetitionStore, token: string, clubId: string, form: CompForm, now: Date,
  /** Stage c1: made from the Clubhouse, the club already checked (`competitionAsker`). */
  trusted?: ClubRecord,
  /** Stage c2: a calendar file's Ref, kept on the event. */
  ref?: string | null,
): Promise<{ ok: true; code: string; tripId: string; doorCookie: string | null } | { ok: false; status: 400 | 503; error: string }> {
  const roundId = store.newId()
  let made: { tripId: string; code: string; doorCookie: string | null } | null = null
  // A code another event holds is tried again, as the create forms do.
  for (let attempt = 0; attempt < 4 && !made; attempt++) {
    const code = store.newCode()
    const row = {
      name: form.name,
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: form.date,
      end_date: form.date,
      kind: 'tournament',
      formats: { ...NO_FORMATS, league: { ...NO_FORMATS.league }, matchplay: { ...NO_FORMATS.matchplay } },
      leaderboards: [compBoard(roundId, form)],
      bracket_setup: { format: 'league', entry: 'organiser' },
      event_permissions: compPermissions(),
      competition: 'club',
    }
    const out = await runCreate({
      token, row, adminPin: null,
      publicPin: form.watch === 'members' ? unheldPin() : null,
      ...(trusted ? { trustedClub: { id: trusted.id, name: trusted.name } } : { clubId }),
    }, store.create, now)
    if (out.status === 409) continue
    if (out.status !== 200) return { ok: false, status: out.status === 400 ? 400 : 503, error: out.body.error?.message ?? 'Could not make the competition — try again.' }
    made = { tripId: out.body.data.id, code, doorCookie: out.doorCookie }
  }
  if (!made) return { ok: false, status: 503, error: 'Could not make the competition — try again.' }

  try {
    const itemId = await store.insertItem(toItemRow(made.tripId, {
      id: 'tmp-golf', dayIndex: 0, position: 0, kind: 'golf', courseId: form.courseId, teeTime: compFirstTee(form), teeCount: 1,
    }))
    await store.insertRound({
      id: roundId,
      trip_id: made.tripId,
      course_id: form.courseId,
      round_number: 1,
      status: 'upcoming',
      itinerary_item_id: itemId,
      scheduled_date: form.date,
      start_format: 'tee_sheet',
      tee_sheet: compTeeRules(form),
    })
    // Stage (m): who may enter. Rules that cannot be kept make no
    // competition — one open to everybody when it was meant to be the
    // ladies' would be the worse failure.
    if (form.entry) {
      if (!store.setEntryRules) throw new EntryNotReady()
      await store.setEntryRules(made.tripId, form.entry)
    }
    if (ref && store.setImportRef) await store.setImportRef(made.tripId, ref)
  } catch (e) {
    console.error('competition round failed:', e)
    await store.deleteTrip(made.tripId).catch(() => undefined)
    if (form.entry && (e as Error)?.name === 'EntryNotReady') return { ok: false, status: 503, error: ENTRY_LATER }
    return { ok: false, status: 503, error: 'Could not make the competition — try again.' }
  }
  return { ok: true, code: made.code, tripId: made.tripId, doorCookie: made.doorCookie }
}

export async function runNewCompetition(
  input: { token: string | null; clubId: unknown; form: unknown; from?: 'app' | 'clubhouse' },
  store: CompetitionStore,
  now: Date,
): Promise<CompetitionOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const from = input.from ?? 'app'
  const who = await competitionAsker(store, user.id, input.clubId, from)
  if (!who.ok) return fail(403, who.error)
  const form = readCompForm(input.form)
  if (!form) return fail(400, 'Fill in the competition.')
  const issue = compFormIssue(form, irishToday(now)) ?? await entryIssue(store, who.club.id, form)
  if (issue) return fail(400, issue)

  const out = await makeOne(store, input.token, who.club.id, form, now, from === 'clubhouse' ? who.club : undefined)
  if (!out.ok) return fail(out.status, out.error)
  if (from === 'clubhouse' && store.logActivity) {
    await store.logActivity([{
      clubId: who.club.id, byUser: user.id, byName: who.byName, byStaff: who.staff, action: 'competition.add',
      memberId: null, memberName: null, changes: { [out.code]: [null, `${form.name} · ${form.date}`] }, batchId: null,
    }]).catch(e => console.error('club activity not logged:', e))
  }
  return { status: 200, body: { ok: true, code: out.code, slug: who.club.slug }, doorCookie: out.doorCookie }
}

/** Why a form's entry rules cannot be kept at this club — a membership not the club's — or null. */
async function entryIssue(store: CompetitionStore, clubId: string, form: CompForm): Promise<string | null> {
  if (!form.entry) return null
  if (form.entry.categories?.length && !store.categories) return 'Memberships aren’t set up yet — try again later.'
  const known = form.entry.categories?.length && store.categories ? (await store.categories(clubId)).map(c => c.id) : []
  return entryRulesIssue(form.entry, known)
}

export type CopyOutcome =
  | { status: 200; body: { ok: true; made: { code: string; date: string }[]; refused: { date: string; why: string }[] } }
  | { status: 400 | 401 | 403 | 404 | 503; body: { ok: false; error: string } }

/**
 * Copy a competition to other dates (stage (k2), D214): Copy to another
 * date is one date, Repeat weekly a run of them (`weeklyFrom`). The
 * competition is read back into its form (`compFormFrom`) and each date
 * made exactly as New competition makes one — its checks, its tee sheet,
 * its board — so a copy is never a different kind of thing. A club's
 * Officers only (D219), as New competition. A date that cannot be made
 * (in the past, say) is said by name; the rest are made. Logged.
 */
export async function runCopyCompetition(
  input: { token: string | null; clubId: unknown; code: unknown; dates: unknown },
  store: CompetitionStore,
  now: Date,
): Promise<CopyOutcome> {
  const no = (status: 400 | 401 | 403 | 404 | 503, error: string): CopyOutcome => ({ status, body: { ok: false, error } })
  if (!input.token) return no(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return no(403, 'Sign in to your Green Dot account first.')
  // Copy and Repeat weekly live in the Clubhouse: its holders' (Ross, 17 Nov 2026).
  const who = await competitionAsker(store, user.id, input.clubId, 'clubhouse')
  if (!who.ok) return no(403, who.error)
  const mine = { club: who.club, row: { name: who.byName } }
  const dates = [...new Set((Array.isArray(input.dates) ? input.dates : []).filter((d): d is string => typeof d === 'string'))]
  if (dates.length === 0 || dates.length > MAX_COPIES) return no(400, `Choose between 1 and ${MAX_COPIES} dates.`)
  const source = store.compSource && typeof input.code === 'string' ? await store.compSource(input.code.trim().toUpperCase()) : null
  if (!source || source.clubId !== mine.club.id) return no(404, 'No such competition at this club.')
  const made: { code: string; date: string }[] = []
  const refused: { date: string; why: string }[] = []
  for (const date of dates.sort()) {
    const form = compFormFrom({ ...source, date })
    if (!form) return no(400, 'This competition’s tee sheet could not be read — make the copy from New competition.')
    const issue = compFormIssue(form, irishToday(now)) ?? await entryIssue(store, mine.club.id, form)
    if (issue) { refused.push({ date, why: issue }); continue }
    const out = await makeOne(store, input.token, mine.club.id, form, now, who.club)
    if (out.ok) made.push({ code: out.code, date })
    else refused.push({ date, why: out.error })
  }
  if (made.length && store.logActivity) {
    await store.logActivity([{
      clubId: mine.club.id, byUser: user.id, byName: mine.row.name, byStaff: who.staff, action: 'competition.copy',
      memberId: null, memberName: null, changes: { from: [input.code, made.map(m => `${m.code} ${m.date}`).join(', ')] }, batchId: null,
    }]).catch(e => console.error('club activity not logged:', e))
  }
  return { status: 200, body: { ok: true, made, refused } }
}

// ─── Stage c1, M10–M11: a competition read and changed in the Clubhouse ───

/** A fault's words follow what was asked — a read or a change never claims to be making one (D274). */
export function failWords(action: unknown): string {
  if (action === 'read' || action === 'matchplay.read') return 'Could not open the competition — try again.'
  if (action === 'change') return 'Could not change the competition — try again.'
  if (action === 'copy') return 'Could not copy the competition — try again.'
  if (typeof action === 'string' && action.startsWith('import.')) return 'Could not import the calendar — try again.'
  return 'Could not make the competition — try again.'
}


export type CompReadOutcome =
  | { status: 200; body: { ok: true; form: CompForm; booked: number; started: boolean; certified: boolean } }
  | { status: 400 | 401 | 403 | 404 | 503; body: { ok: false; error: string } }

/** A competition as its form, for the Clubhouse's panel — with how many are booked and whether it can still be changed. */
export async function runReadCompetition(
  input: { token: string | null; clubId: unknown; code: unknown },
  store: CompetitionStore,
): Promise<CompReadOutcome> {
  const no = (status: 400 | 401 | 403 | 404 | 503, error: string): CompReadOutcome => ({ status, body: { ok: false, error } })
  if (!input.token) return no(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return no(403, 'Sign in to your Green Dot account first.')
  const who = await competitionAsker(store, user.id, input.clubId, 'clubhouse')
  if (!who.ok) return no(403, who.error)
  const c = store.compNow && typeof input.code === 'string' ? await store.compNow(input.code.trim().toUpperCase()) : null
  if (!c || c.clubId !== who.club.id) return no(404, 'No such competition at this club.')
  const board = c.leaderboards.find(b => (b as { clubCompetition?: boolean }).clubCompetition) as { scoring?: unknown; handicapAllowance?: unknown } | undefined
  const form = compFormFrom({ name: c.name, date: c.date, courseId: c.courseId, board: board ?? null, teeSheet: c.rules, membersOnly: c.membersOnly, entry: c.entry })
  if (!form) return no(404, 'This competition’s tee sheet could not be read.')
  return { status: 200, body: { ok: true, form, booked: c.bookings.length, started: c.started, certified: c.certified } }
}

export type CompChangeOutcome =
  | { status: 200; body: { ok: true; moved: number } }
  | { status: 400 | 401 | 403 | 404 | 409 | 503; body: { ok: false; error: string; problems?: { name: string; why: string }[] } }

/**
 * A competition changed in the Clubhouse (M10, M11): its name, day, course,
 * format, allowance, who may enter, who can watch (D274), tee times and when
 * booking opens. Every
 * booking stays at its tee time and the member stays in if they may still
 * enter — an Officer's Book anyway kept — or the change is refused, each
 * member named with why (`planSheetChange`). Never once a card has started
 * or the results are certified. Logged.
 */
export async function runChangeCompetition(
  input: { token: string | null; clubId: unknown; code: unknown; form: unknown },
  store: CompetitionStore,
  now: Date,
): Promise<CompChangeOutcome> {
  const no = (status: 400 | 401 | 403 | 404 | 409 | 503, error: string, problems?: { name: string; why: string }[]): CompChangeOutcome =>
    ({ status, body: { ok: false, error, ...(problems ? { problems } : {}) } })
  if (!input.token) return no(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return no(403, 'Sign in to your Green Dot account first.')
  const who = await competitionAsker(store, user.id, input.clubId, 'clubhouse')
  if (!who.ok) return no(403, who.error)
  if (!store.compNow || !store.applyChange) return no(503, 'Changing a competition isn’t set up yet — try again later.')
  const c = typeof input.code === 'string' ? await store.compNow(input.code.trim().toUpperCase()) : null
  if (!c || c.clubId !== who.club.id) return no(404, 'No such competition at this club.')
  if (c.certified) return no(409, 'The results are certified — reopen them in the members app first.')
  if (c.started) return no(409, 'A card has started — the competition is in play.')
  const form = readCompForm(input.form)
  if (!form) return no(400, 'Fill in the competition.')
  const issue = compFormIssue(form, irishToday(now)) ?? await entryIssue(store, who.club.id, form)
  if (issue) return no(400, issue)

  const out = await changeOne(store, c, form, false)
  if (!out.ok) return no(out.status, out.error, out.problems)
  if (store.logActivity) {
    const before = compFormFrom({ name: c.name, date: c.date, courseId: c.courseId, board: null, teeSheet: c.rules, membersOnly: c.membersOnly, entry: c.entry })
    await store.logActivity([{
      clubId: c.clubId, byUser: user.id, byName: who.byName, byStaff: who.staff, action: 'competition.change',
      memberId: null, memberName: null,
      changes: { [c.code]: [`${c.name} · ${c.date} · ${watchWord(c.membersOnly)} · ${before ? sheetLine(before) : ''}`, `${form.name} · ${form.date} · ${watchWord(form.watch === 'members')} · ${sheetLine(form)}`] }, batchId: null,
    }]).catch(e => console.error('club activity not logged:', e))
  }
  return { status: 200, body: { ok: true, moved: out.moved } }
}

/**
 * One competition changed (M11) — the Clubhouse's panel and a calendar
 * import alike: every booking kept at its tee time, the member kept in if
 * they may still enter (an Officer's Book anyway kept). Where they cannot
 * be, the panel is refused; an import (`keepSheet`) keeps the old tee sheet,
 * day, course and who may enter, changes the rest, and says why (M16).
 */
export async function changeOne(store: CompetitionStore, c: CompNow, form: CompForm, keepSheet: boolean):
  Promise<{ ok: true; moved: number; keptSheet: { name: string; why: string }[] | null } | { ok: false; status: 409 | 503; error: string; problems?: { name: string; why: string }[] }> {
  if (!store.applyChange) return { ok: false, status: 503, error: 'Changing a competition isn’t set up yet — try again later.' }
  const after = compTeeRules(form)
  // Each booked member's entry under the new rules and day — unless an Officer booked them anyway (D231).
  const rowIds = c.bookings.map(b => b.rowId).filter((x): x is string => !!x)
  const [rows, categories, ageDate, anyway] = await Promise.all([
    rowIds.length && store.rowsByIds ? store.rowsByIds(c.clubId, rowIds) : Promise.resolve([] as MemberRecord[]),
    store.categories ? store.categories(c.clubId).catch(() => [] as Category[]) : Promise.resolve([] as Category[]),
    store.ageDate ? store.ageDate(c.clubId).catch(() => '01-01') : Promise.resolve('01-01'),
    store.overrides ? store.overrides(c.clubId, c.code).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
  ])
  const rowOf = new Map(rows.map(r => [r.id, r]))
  const bookings: SheetBooking[] = c.bookings.map(b => {
    const r = b.rowId ? rowOf.get(b.rowId) : undefined
    const f = r && !anyway.has(r.id) ? entryRefusal({
      rules: form.entry ?? null, person: { gender: r.gender ?? null, birthDate: r.birthDate ?? null, categoryId: r.categoryId ?? null },
      category: categories.find(x => x.id === r.categoryId) ?? null, day: form.date, ageDate: readAgeDate(ageDate), categories,
    }) : null
    return { playerId: b.playerId, name: b.name, slot: b.slot, refused: f ? refusalWords(f, b.name) : null }
  })
  const plan = planSheetChange({ before: c.rules, after, bookings })
  if (!plan.ok && !keepSheet) {
    return { ok: false, status: 409, error: `The change would leave ${plan.problems.length === 1 ? 'a booking' : `${new Set(plan.problems.map(p => p.name)).size} bookings`} that can’t be kept — nothing was changed.`, problems: plan.problems }
  }
  const kept = !plan.ok
  const boards = c.leaderboards.map(b => ((b as { clubCompetition?: boolean }).clubCompetition ? compBoard(c.roundId, form) : b))
  try {
    await store.applyChange(c, {
      moves: plan.ok ? plan.moves : [], name: form.name, date: kept ? c.date : form.date, courseId: kept ? c.courseId : form.courseId,
      teeSheet: kept ? c.rules : after, firstTee: kept ? (teeClocks(c.rules)[0] ?? compFirstTee(form)) : compFirstTee(form),
      leaderboards: boards, entry: kept ? readEntryRules(c.entry) : form.entry ?? null,
      membersOnly: form.watch === 'members',
    })
  } catch (e) {
    console.error('competition change failed:', e)
    return { ok: false, status: 503, error: (e as Error)?.name === 'EntryNotReady' ? ENTRY_LATER : 'Could not change the competition — try again.' }
  }
  return { ok: true, moved: plan.ok ? plan.moves.length : 0, keptSheet: plan.ok ? null : plan.problems }
}

const watchWord = (membersOnly: boolean) => (membersOnly ? 'Members only' : 'Guests can watch')
const sheetLine = (f: Pick<CompForm, 'batches'>) => f.batches.map(b => `${b.start} ×${b.times} every ${b.interval} in ${b.perTime}s`).join(', ')

// ─── A club match play (Ross, 17 Nov 2026; D264–D271) ──────────

/**
 * A club match play made in the Clubhouse (`keep_calendar`, stage 1 of
 * the plan in docs/pending-concepts.md): the event through the create
 * route's own checks — a continuous knockout, `trips.competition = 'club'`,
 * Club admins only, members only unless guests may watch — with no golf
 * item and no round: matches are played when the players arrange them,
 * paced by the deadlines set here. A qualifier must be one of this club's
 * own competitions, played before the first round is due. Logged.
 */
export async function runNewMatchPlay(
  input: { token: string | null; clubId: unknown; form: unknown },
  store: CompetitionStore,
  now: Date,
): Promise<CompetitionOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const who = await competitionAsker(store, user.id, input.clubId, 'clubhouse')
  if (!who.ok) return fail(403, who.error)
  const form = readMatchPlayForm(input.form)
  if (!form) return fail(400, 'Fill in the competition.')
  const today = irishToday(now)
  const issue = matchPlayFormIssue(form, now, today) ?? await entryIssue(store, who.club.id, { entry: form.entry } as CompForm)
  if (issue) return fail(400, issue)
  if (form.field === 'qualifier' && form.qualifier) {
    if (!store.compSource) return fail(503, 'Qualifiers aren’t set up yet — try again later.')
    const q = await store.compSource(form.qualifier.code)
    if (!q || q.clubId !== who.club.id) return fail(400, 'The qualifier must be one of the club’s own competitions.')
    if (q.date > form.deadlines[0]) return fail(400, 'The qualifier must be played before the first round is due.')
  }

  const dates = matchPlayDates(form, today)
  let made: { tripId: string; code: string; doorCookie: string | null } | null = null
  for (let attempt = 0; attempt < 4 && !made; attempt++) {
    const code = store.newCode()
    const row = {
      name: form.name,
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: dates.start,
      end_date: dates.end,
      kind: 'tournament',
      formats: { ...NO_FORMATS, league: { ...NO_FORMATS.league }, matchplay: { ...NO_FORMATS.matchplay } },
      leaderboards: [matchPlayBoard(form)],
      bracket_setup: matchPlaySeed(form, who.club.homeCourseId ?? null),
      event_permissions: matchPlayPermissions(),
      competition: 'club',
    }
    const out = await runCreate({
      token: input.token, row, adminPin: null,
      publicPin: form.watch === 'members' ? unheldPin() : null,
      trustedClub: { id: who.club.id, name: who.club.name },
    }, store.create, now)
    if (out.status === 409) continue
    if (out.status !== 200) return fail(out.status === 400 ? 400 : 503, out.body.error?.message ?? 'Could not make the competition — try again.')
    made = { tripId: out.body.data.id, code, doorCookie: out.doorCookie }
  }
  if (!made) return fail(503, 'Could not make the competition — try again.')

  if (form.entry) {
    try {
      if (!store.setEntryRules) throw new EntryNotReady()
      await store.setEntryRules(made.tripId, form.entry)
    } catch (e) {
      console.error('match play entry rules failed:', e)
      await store.deleteTrip(made.tripId).catch(() => undefined)
      return fail(503, (e as Error)?.name === 'EntryNotReady' ? ENTRY_LATER : 'Could not make the competition — try again.')
    }
  }
  if (store.logActivity) {
    await store.logActivity([{
      clubId: who.club.id, byUser: user.id, byName: who.byName, byStaff: who.staff, action: 'competition.add',
      memberId: null, memberName: null, changes: { [made.code]: [null, `${form.name} · match play · final by ${dates.end}`] }, batchId: null,
    }]).catch(e => console.error('club activity not logged:', e))
  }
  return { status: 200, body: { ok: true, code: made.code, slug: who.club.slug }, doorCookie: made.doorCookie }
}

export type MatchPlayReadOutcome =
  | { status: 200; body: { ok: true; name: string; format: string; phase: string; line: string; entered: number; cap: number | null; rules: ReturnType<typeof matchPlayRules>; overdue: OverdueMatch[]; rounds: { roundNumber: number; roundName: string }[] } }
  | { status: 400 | 401 | 403 | 404 | 503; body: { ok: false; error: string } }

/** A club match play as the Clubhouse reads it (Ross, 17 Nov 2026): where it stands, its rules and its dates — the office's (`keep_calendar`). */
export async function runReadMatchPlay(
  input: { token: string | null; clubId: unknown; code: unknown },
  store: CompetitionStore & {
    matchPlayComp?(code: string): Promise<import('./matchPlayStore').MatchPlayComp | null>
    /** Stage 3 (D271): its draw, for the overdue matches. */
    matchPlayDraw?(code: string): Promise<{ view: { names: Record<string, string> }; rounds: Parameters<typeof overdueMatches>[0] } | null>
  },
  now: Date,
): Promise<MatchPlayReadOutcome> {
  const no = (status: 400 | 401 | 403 | 404 | 503, error: string): MatchPlayReadOutcome => ({ status, body: { ok: false, error } })
  if (!input.token) return no(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return no(403, 'Sign in to your Green Dot account first.')
  const who = await competitionAsker(store, user.id, input.clubId, 'clubhouse')
  if (!who.ok) return no(403, who.error)
  const mp = store.matchPlayComp && typeof input.code === 'string' ? await store.matchPlayComp(input.code.trim().toUpperCase()) : null
  if (!mp || mp.clubId !== who.club.id) return no(404, 'No such match play at this club.')
  const phase = matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won, fielded: mp.entered > 0 }, now)
  const draw = mp.drawn && store.matchPlayDraw ? await store.matchPlayDraw(mp.code).catch(() => null) : null
  return {
    status: 200,
    body: {
      ok: true, name: mp.name,
      format: formatLine({ scoring: 'stableford', allowance: mp.allowance, matchPlay: { format: mp.setup.format } }),
      phase: PHASE_WORDS[phase], line: matchPlayLine(mp.setup, phase, { qualifierName: mp.qualifierName, qualifierDate: mp.qualifierDate }),
      entered: mp.entered, cap: mp.setup.maxField,
      rules: matchPlayRules(mp.setup, { allowance: mp.allowance, qualifierName: mp.qualifierName, entryLine: mp.entryLine }),
      overdue: draw ? overdueMatches(draw.rounds, draw.view.names, irishToday(now)) : [],
      rounds: (draw?.rounds ?? []).map(r => ({ roundNumber: r.roundNumber, roundName: r.roundName })),
    },
  }
}
