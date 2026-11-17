// The Clubhouse's browser half (stage (k0), D212): which clubs this account
// may open it at, and the one it last used here. Never imported by
// app/club or app/home — the members app stays as lean as it was.

import { ACCOUNT_WORDS } from '@/lib/account'
import { accountToken, askClub, askServer, describeStoredSession, readAccount, type ClubSummary } from '@/lib/accountClient'
import { clubMay } from '@/lib/clubMay'
import type { CompForm } from '@/lib/clubComp'
import type { MatchPlayForm } from '@/lib/clubMatchPlay'

/** The club this device last opened the Clubhouse at — a convenience, never authorising. */
const LAST_KEY = 'gd.clubhouse.v1'

export function lastClubhouse(): string | null {
  try { return window.localStorage.getItem(LAST_KEY) } catch { return null }
}

export function rememberClubhouse(slug: string) {
  try { window.localStorage.setItem(LAST_KEY, slug) } catch { /* refused — the first club opens next time */ }
}

export type Door =
  | { kind: 'signedOut'; why: string }
  | { kind: 'lost'; error: string }
  | { kind: 'none' }
  | { kind: 'open'; clubs: ClubSummary[] }

/** Who is at the door: signed out, a lost signal, no Clubhouse anywhere, or the verified clubs it opens at. */
export async function knock(): Promise<Door> {
  if (!(await readAccount())) return { kind: 'signedOut', why: `this phone holds ${describeStoredSession()}` }
  const r = await askClub('mine')
  if (!r.ok) return /sign in/i.test(r.error) ? { kind: 'signedOut', why: `the server said “${r.error}” (this phone holds ${describeStoredSession()})` } : { kind: 'lost', error: r.error }
  const clubs = (r.clubs ?? []).filter(c => c.status === 'verified' && clubMay('open_clubhouse', { row: c.credentials }))
  return clubs.length ? { kind: 'open', clubs } : { kind: 'none' }
}

/** Where the door opens: the club last used here, if this account still has it, else the first. */
export function doorClub(clubs: ClubSummary[], last: string | null): ClubSummary {
  return clubs.find(c => c.slug === last) ?? clubs[0]
}

/**
 * Stage (k2), D214: a competition copied to other dates — Copy to another
 * date (one) or Repeat weekly (a run). Each made as New competition makes
 * one; a date that could not be made comes back with why. Never throws.
 */
export async function copyCompetition(clubId: string, code: string, dates: string[]): Promise<{ ok: true; made: { code: string; date: string }[]; refused: { date: string; why: string }[] } | { ok: false; error: string }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.' }
  const r = await askServer(token, { action: 'copy', clubId, code, dates }, '/api/club/competition')
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
  const b = r.body as { made?: { code: string; date: string }[]; refused?: { date: string; why: string }[] }
  return { ok: true, made: b.made ?? [], refused: b.refused ?? [] }
}

/** Stage c1: one ask of /api/club/competition from the Clubhouse. Never throws. */
async function askCompetition(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const token = await accountToken()
  if (!token) return { status: 0, body: { error: 'Sign in to your Green Dot account first.' } }
  const r = await askServer(token, body, '/api/club/competition')
  return r ?? { status: 0, body: { error: ACCOUNT_WORDS.noReach } }
}
const errorOf = (b: Record<string, unknown>) => (typeof b.error === 'string' ? b.error : ACCOUNT_WORDS.noReach)

/** Stage c1, M10: New competition from the Clubhouse — the office's. */
export async function makeClubhouseCompetition(clubId: string, form: CompForm): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const r = await askCompetition({ clubId, form, from: 'clubhouse' })
  return r.status === 200 ? { ok: true, code: String(r.body.code) } : { ok: false, error: errorOf(r.body) }
}

/** A club match play from the Clubhouse (Ross, 17 Nov 2026) — the office's. */
export async function makeClubMatchPlay(clubId: string, form: MatchPlayForm): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const r = await askCompetition({ action: 'matchplay.new', clubId, form })
  return r.status === 200 ? { ok: true, code: String(r.body.code) } : { ok: false, error: errorOf(r.body) }
}

/** A club match play as the office reads it: where it stands, its rules and dates. */
export type MatchPlayOfficeBody = { name: string; format: string; phase: string; line: string; entered: number; cap: number | null; rules: { lines: { label: string; value: string }[]; deadlines: { round: string; date: string }[] } }
export async function readClubMatchPlay(clubId: string, code: string): Promise<({ ok: true } & MatchPlayOfficeBody) | { ok: false; error: string }> {
  const r = await askCompetition({ action: 'matchplay.read', clubId, code })
  return r.status === 200 ? { ok: true, ...(r.body as unknown as MatchPlayOfficeBody) } : { ok: false, error: errorOf(r.body) }
}

/** Stage c1, M11: a competition as its form, for the Clubhouse's panel. */
export async function readCompetitionForm(clubId: string, code: string): Promise<{ ok: true; form: CompForm; booked: number; started: boolean; certified: boolean } | { ok: false; error: string }> {
  const r = await askCompetition({ action: 'read', clubId, code })
  if (r.status !== 200) return { ok: false, error: errorOf(r.body) }
  return { ok: true, form: r.body.form as CompForm, booked: Number(r.body.booked) || 0, started: !!r.body.started, certified: !!r.body.certified }
}

/** Stage c1, M11: a competition changed — or refused, each booking that could not be kept named with why. */
export async function changeCompetition(clubId: string, code: string, form: CompForm): Promise<{ ok: true; moved: number } | { ok: false; error: string; problems?: { name: string; why: string }[] }> {
  const r = await askCompetition({ action: 'change', clubId, code, form })
  if (r.status === 200) return { ok: true, moved: Number(r.body.moved) || 0 }
  return { ok: false, error: errorOf(r.body), ...(Array.isArray(r.body.problems) ? { problems: r.body.problems as { name: string; why: string }[] } : {}) }
}

// ─── Stage c2, M12–M16: a calendar imported ───

export type ImportPreviewRow = import('@/lib/calendarImport').PreviewRow
export type ImportRowOutcome = import('@/lib/calendarImport').RowOutcome
type SentRow = { line: number; cells: Record<string, string> }

/** The prompt and the blank template, written live from the club. */
export async function calendarPromptOf(clubId: string, year: number): Promise<{ ok: true; prompt: string; template: string; ready: boolean } | { ok: false; error: string }> {
  const r = await askCompetition({ action: 'import.prompt', clubId, year })
  if (r.status !== 200) return { ok: false, error: errorOf(r.body) }
  return { ok: true, prompt: String(r.body.prompt ?? ''), template: String(r.body.template ?? ''), ready: r.body.ready === true }
}

/** Every row read and matched against the club — nothing saved. */
export async function previewCalendar(clubId: string, rows: SentRow[]): Promise<{ ok: true; rows: ImportPreviewRow[]; notInFile: { name: string; date: string; type: string }[] } | { ok: false; error: string }> {
  const r = await askCompetition({ action: 'import.preview', clubId, rows })
  if (r.status !== 200) return { ok: false, error: errorOf(r.body) }
  return { ok: true, rows: (r.body.rows ?? []) as ImportPreviewRow[], notInFile: (r.body.notInFile ?? []) as { name: string; date: string; type: string }[] }
}

/** A few rows imported under the import's one batch id. */
export async function importCalendarRows(clubId: string, batch: string, rows: SentRow[], confirmed: number[]): Promise<{ ok: true; done: ImportRowOutcome[] } | { ok: false; error: string }> {
  const r = await askCompetition({ action: 'import.rows', clubId, batch, rows, confirmed })
  if (r.status !== 200) return { ok: false, error: errorOf(r.body) }
  return { ok: true, done: (r.body.done ?? []) as ImportRowOutcome[] }
}

/**
 * A competition's tee sheet kept from the Clubhouse (Ross, 17 Nov 2026 —
 * never through the members app): `sheet`, `names`, `book`, `move`,
 * `withdraw` on /api/club/booking's office side. Never throws.
 */
export async function askCompOffice<T = Record<string, unknown>>(action: 'sheet' | 'names' | 'book' | 'move' | 'withdraw', code: string, body: Record<string, unknown> = {}):
  Promise<({ ok: true } & T) | { ok: false; error: string; anyway?: boolean }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.' }
  const r = await askServer(token, { ...body, code, action: `office.${action}` }, '/api/club/booking')
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach, anyway: r.body.anyway === true }
  return { ok: true, ...(r.body as T) }
}
