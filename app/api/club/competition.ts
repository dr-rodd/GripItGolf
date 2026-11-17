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
import { compBoard, compFormFrom, compFormIssue, compPermissions, compTeeRules, readCompForm, type CompForm } from '@/lib/clubComp'
import { MAX_COPIES } from '@/lib/clubhouse'
import { irishToday } from '@/lib/clubs'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { NO_FORMATS } from '@/lib/formats'
import { toItemRow } from '@/lib/itinerarySync'
import { unheldPin } from '@/lib/pinHash'
import { runCreate, type CreateStore } from '../trip/create/create'
import type { ClubRecord, MemberRecord } from './club'

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
  } | null>
  /** The club's activity log (092), fail-soft. */
  logActivity?(entries: import('./club').ActivityEntry[]): Promise<void>
}

export type CompetitionOutcome =
  | { status: 200; body: { ok: true; code: string; slug: string }; doorCookie: string | null }
  | { status: 400 | 401 | 403 | 404 | 503; body: { ok: false; error: string } }

const fail = (status: 400 | 401 | 403 | 404 | 503, error: string): CompetitionOutcome => ({ status, body: { ok: false, error } })

/** One competition made: the event through the create route's own checks, then its golf item and round — or why not. */
async function makeOne(
  store: CompetitionStore, token: string, clubId: string, form: CompForm, now: Date,
): Promise<{ ok: true; code: string; doorCookie: string | null } | { ok: false; status: 400 | 503; error: string }> {
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
      clubId,
    }, store.create, now)
    if (out.status === 409) continue
    if (out.status !== 200) return { ok: false, status: out.status === 400 ? 400 : 503, error: out.body.error?.message ?? 'Could not make the competition — try again.' }
    made = { tripId: out.body.data.id, code, doorCookie: out.doorCookie }
  }
  if (!made) return { ok: false, status: 503, error: 'Could not make the competition — try again.' }

  try {
    const itemId = await store.insertItem(toItemRow(made.tripId, {
      id: 'tmp-golf', dayIndex: 0, position: 0, kind: 'golf', courseId: form.courseId, teeTime: form.first, teeCount: 1,
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
  } catch (e) {
    console.error('competition round failed:', e)
    await store.deleteTrip(made.tripId).catch(() => undefined)
    return { ok: false, status: 503, error: 'Could not make the competition — try again.' }
  }
  return { ok: true, code: made.code, doorCookie: made.doorCookie }
}

export async function runNewCompetition(
  input: { token: string | null; clubId: unknown; form: unknown },
  store: CompetitionStore,
  now: Date,
): Promise<CompetitionOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const mine = (await store.clubsOf(user.id)).find(x => x.club.id === input.clubId)
  if (!mine || !mine.club.verifiedAt || !clubMay('run_events', { row: credentialsOf(mine.row) })) {
    return fail(403, 'Only a verified club’s Officers make its competitions.')
  }
  const form = readCompForm(input.form)
  if (!form) return fail(400, 'Fill in the competition.')
  const issue = compFormIssue(form, irishToday(now))
  if (issue) return fail(400, issue)

  const out = await makeOne(store, input.token, mine.club.id, form, now)
  if (!out.ok) return fail(out.status, out.error)
  return { status: 200, body: { ok: true, code: out.code, slug: mine.club.slug }, doorCookie: out.doorCookie }
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
  const mine = (await store.clubsOf(user.id)).find(x => x.club.id === input.clubId)
  if (!mine || !mine.club.verifiedAt || !clubMay('run_events', { row: credentialsOf(mine.row) })) {
    return no(403, 'Only a verified club’s Officers make its competitions.')
  }
  const dates = [...new Set((Array.isArray(input.dates) ? input.dates : []).filter((d): d is string => typeof d === 'string'))]
  if (dates.length === 0 || dates.length > MAX_COPIES) return no(400, `Choose between 1 and ${MAX_COPIES} dates.`)
  const source = store.compSource && typeof input.code === 'string' ? await store.compSource(input.code.trim().toUpperCase()) : null
  if (!source || source.clubId !== mine.club.id) return no(404, 'No such competition at this club.')
  const made: { code: string; date: string }[] = []
  const refused: { date: string; why: string }[] = []
  for (const date of dates.sort()) {
    const form = compFormFrom({ ...source, date })
    if (!form) return no(400, 'This competition’s tee sheet is not one run of times — make the copy from New competition.')
    const issue = compFormIssue(form, irishToday(now))
    if (issue) { refused.push({ date, why: issue }); continue }
    const out = await makeOne(store, input.token, mine.club.id, form, now)
    if (out.ok) made.push({ code: out.code, date })
    else refused.push({ date, why: out.error })
  }
  if (made.length && store.logActivity) {
    await store.logActivity([{
      clubId: mine.club.id, byUser: user.id, byName: mine.row.name, byStaff: false, action: 'competition.copy',
      memberId: null, memberName: null, changes: { from: [input.code, made.map(m => `${m.code} ${m.date}`).join(', ')] }, batchId: null,
    }]).catch(e => console.error('club activity not logged:', e))
  }
  return { status: 200, body: { ok: true, made, refused } }
}
