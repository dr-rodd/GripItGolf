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
import { compBoard, compFormIssue, compPermissions, compTeeRules, readCompForm } from '@/lib/clubComp'
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
}

export type CompetitionOutcome =
  | { status: 200; body: { ok: true; code: string; slug: string }; doorCookie: string | null }
  | { status: 400 | 401 | 403 | 503; body: { ok: false; error: string } }

const fail = (status: 400 | 401 | 403 | 503, error: string): CompetitionOutcome => ({ status, body: { ok: false, error } })

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
      token: input.token, row, adminPin: null,
      publicPin: form.watch === 'members' ? unheldPin() : null,
      clubId: mine.club.id,
    }, store.create, now)
    if (out.status === 409) continue
    if (out.status !== 200) return fail(out.status === 400 ? 400 : 503, out.body.error?.message ?? 'Could not make the competition — try again.')
    made = { tripId: out.body.data.id, code, doorCookie: out.doorCookie }
  }
  if (!made) return fail(503, 'Could not make the competition — try again.')

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
    return fail(503, 'Could not make the competition — try again.')
  }
  return { status: 200, body: { ok: true, code: made.code, slug: mine.club.slug }, doorCookie: made.doorCookie }
}
