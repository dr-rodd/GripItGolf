'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { MAX_KEEP, readKeepList, TEST_CLUB_NOT_READY } from '@/lib/testClub'
import { requireAdmin } from '../adminGate'
import { findAccount } from '../accounts'
import { isTestClubId, wipeStore } from './store'
import { previewWipe, runWipe, type WipeOutcome } from './wipe'
import type { WipePreview } from '@/lib/testClub'
import { readCharacters, readWeek, type Banter } from '@/lib/testClub'
import { irishToday } from '@/lib/clubs'
import { WEEKS } from '@/data/test-club/weeks'
import { loadWeek } from './week'
import charactersFile from '@/data/test-club/characters.json'
import banterFile from '@/data/test-club/season-banter.json'
import { runSeed, type SeedProgress } from './seed'

/**
 * The test club's actions (D311): the keep-list, and the wipe — previewed
 * first, then run once its name is typed. Each re-checks the admin session
 * (the page's gate protected the page; this is a new request) and that the
 * club is a test club. Nothing here works on a club that is not one.
 */

const SIGNED_OUT = 'Signed out — log in again.'

/** The keep-list replaced by the usernames typed — each must be a Green Dot account. */
export async function saveKeepList(clubId: string, raw: string): Promise<{ error: string | null; missing?: string[] }> {
  if (!(await requireAdmin())) return { error: SIGNED_OUT }
  const db = createAdminClient()
  if (!(await isTestClubId(db, clubId))) return { error: 'Only a test club has a keep-list.' }
  const names = readKeepList(raw)
  if (names.length > MAX_KEEP) return { error: `The keep-list holds at most ${MAX_KEEP}.` }
  try {
    const found = await Promise.all(names.map(async n => ({ n, a: n.includes('@') ? null : await findAccount(db, n) })))
    const missing = found.filter(f => !f.a).map(f => f.n)
    if (missing.length) return { error: `No Green Dot account has the username ${missing.join(', ')}. Usernames only.`, missing }
    const ids = found.map(f => f.a!.id)
    const { error: delErr } = await db.from('test_club_keep').delete().eq('club_id', clubId)
    if (delErr) return { error: delErr.code === '42P01' || delErr.code === 'PGRST205' ? TEST_CLUB_NOT_READY : 'Could not save — try again.' }
    if (ids.length) {
      const { error } = await db.from('test_club_keep').insert(ids.map(user_id => ({ club_id: clubId, user_id })))
      if (error) { console.error('keep-list not saved:', error); return { error: 'Could not save — try again.' } }
    }
    revalidatePath('/admin/test-club')
    return { error: null }
  } catch (e) {
    console.error('saveKeepList failed:', e)
    return { error: 'Could not save — try again.' }
  }
}

/** What a wipe will take, counted — read only. */
export async function previewWipeAction(clubId: string): Promise<{ error: string | null; preview?: WipePreview }> {
  if (!(await requireAdmin())) return { error: SIGNED_OUT }
  try {
    const r = await previewWipe(wipeStore(createAdminClient()), clubId)
    return r.ok ? { error: null, preview: r.preview } : { error: r.error }
  } catch (e) {
    console.error('previewWipe failed:', e)
    return { error: 'Could not count the club’s rows — try again.' }
  }
}

/** The wipe. About fifty seconds a press; pressed again, it carries on. */
export async function wipeAction(clubId: string, typed: string): Promise<WipeOutcome> {
  if (!(await requireAdmin())) return { ok: false, error: SIGNED_OUT }
  try {
    const r = await runWipe(wipeStore(createAdminClient()), clubId, typed, Date.now() + 45_000)
    revalidatePath('/admin/test-club')
    revalidatePath('/admin/trips')
    return r
  } catch (e) {
    console.error('wipe failed:', e)
    return { ok: false, error: 'The wipe stopped partway — press again to carry on.' }
  }
}

/**
 * The reseed (D311), about forty-five seconds a press: the characters, their
 * accounts and places on the list, the memberships, labels and the coming
 * week's casual tee times. Refused while the club still has events or
 * fictional accounts from before — the page wipes first. Run again, it
 * changes nothing.
 */
export async function seedAction(clubId: string): Promise<({ ok: true } & SeedProgress) | { ok: false; error: string }> {
  if (!(await requireAdmin())) return { ok: false, error: SIGNED_OUT }
  try {
    const db = createAdminClient()
    const club = await wipeStore(db).club(clubId)
    if (club === 'not_ready') return { ok: false, error: TEST_CLUB_NOT_READY }
    if (!club || !club.isTest) return { ok: false, error: 'Only a test club is seeded.' }
    // The deny-list is checked in the repo (test:test-club); here the file is read as committed.
    const cast = readCharacters(charactersFile, [])
    if (!cast.ok) return { ok: false, error: cast.error }
    const r = await runSeed(db, club, cast.cast, Date.now() + 45_000, (banterFile as { competitions: Record<string, Banter> }).competitions)
    revalidatePath('/admin/test-club')
    return { ok: true, ...r }
  } catch (e) {
    console.error('seed failed:', e)
    return { ok: false, error: e instanceof Error && e.message ? e.message : 'The reseed stopped partway — press again to carry on.' }
  }
}

/**
 * Loading a week file (D312), about forty-five seconds a press — the page
 * presses on until it says it is done. A week naming anybody who is not a
 * character is refused whole (D314). Loaded again, it changes nothing.
 */
export async function loadWeekAction(clubId: string, week: string): Promise<{ ok: true; done: boolean; lines: string[] } | { ok: false; error: string }> {
  if (!(await requireAdmin())) return { ok: false, error: SIGNED_OUT }
  try {
    const db = createAdminClient()
    const club = await wipeStore(db).club(clubId)
    if (club === 'not_ready') return { ok: false, error: TEST_CLUB_NOT_READY }
    if (!club || !club.isTest) return { ok: false, error: 'Only a test club loads a week.' }
    const raw = (WEEKS as Record<string, unknown>)[week]
    if (!raw) return { ok: false, error: `There is no week file for ${week}.` }
    const cast = readCharacters(charactersFile, [])
    if (!cast.ok) return { ok: false, error: cast.error }
    const parsed = readWeek(raw, cast.cast)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    const r = await loadWeek({ db, club, cast: cast.cast, week: parsed.week, today: irishToday(new Date()), deadline: Date.now() + 45_000 })
    revalidatePath('/admin/test-club')
    return { ok: true, ...r }
  } catch (e) {
    console.error('loadWeek failed:', e)
    return { ok: false, error: e instanceof Error && e.message ? e.message : 'The week stopped partway — press again to carry on.' }
  }
}
