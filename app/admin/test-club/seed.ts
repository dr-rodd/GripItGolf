// The reseed (D309–D311, D315), stage s1a: the club's memberships and
// labels, a Green Dot account for every character (email confirmed, the
// `.invalid` domain, the shared password), their place on the list, their
// handicap, the keep-list's memberships, and casual tee times for the next
// seven days booked by the characters themselves through the real route.
//
// Every step looks first and writes only what is missing, so running it
// again changes nothing, and a run cut short by the deadline carries on
// when pressed again. Server only, service role; the shapes it writes are
// the club's own (lib/testClub.ts holds the cast and the plan).

import type { createAdminClient } from '@/lib/supabase-admin'
import {
  DEFAULT_MEMBERSHIP, MEMBERSHIPS, TEST_LABELS, casualPlan, memberNumber, seasonPlan, testEmail, type Banter, type Character,
} from '@/lib/testClub'
import { storedRole } from '@/lib/clubMay'
import { irishToday } from '@/lib/clubs'
import { setIndex } from '@/app/api/handicaps/handicaps'
import { handicapStore } from '@/app/api/handicaps/store'
import { saveLabel } from '@/app/api/club/labelsStore'
import { POST as awardsRoute } from '@/app/api/club/awards/route'
import { alreadyPlayed, playCompetition } from './play'
import { postBanter } from './banter'
import { playMatchPlay } from './matchplay'
import { bookCasual } from './casual'
import { findAccount } from '../accounts'
import { callAs, characterToken, testPassword } from './characterCalls'

type Db = ReturnType<typeof createAdminClient>

export interface SeedProgress { done: boolean; lines: string[] }

const missingCol = (e: { code?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204')

/** Seeds what is missing, until done or the deadline; `lines` say what it did. */
export async function runSeed(db: Db, club: { id: string; slug: string; name: string }, cast: readonly Character[], deadline: number, banter: Record<string, Banter> = {}): Promise<SeedProgress> {
  const lines: string[] = []
  const late = () => Date.now() > deadline
  if (!testPassword()) throw new Error('Set TEST_CLUB_PASSWORD in Vercel first — every character signs in with it.')

  // ── Memberships ──
  const cats = new Map<string, string>()
  {
    const { data, error } = await db.from('club_categories').select('id, name').eq('club_id', club.id)
    if (error) throw error
    for (const r of (data ?? []) as { id: string; name: string }[]) cats.set(r.name, r.id)
    const made: string[] = []
    for (const [i, m] of MEMBERSHIPS.entries()) {
      if (cats.has(m.name)) continue
      const row = { club_id: club.id, name: m.name, code: m.code, days: m.days, position: i, junior: m.junior }
      let res = await db.from('club_categories').insert(row).select('id').single()
      if (res.error && missingCol(res.error)) {
        const { junior: _junior, ...older } = row
        void _junior
        res = await db.from('club_categories').insert(older).select('id').single()
      }
      if (res.error) throw res.error
      cats.set(m.name, (res.data as { id: string }).id)
      made.push(m.name)
    }
    if (made.length) lines.push(`Memberships made: ${made.join(', ')}.`)
  }

  // ── Accounts, and their places on the list ──
  const { data: held } = await db.from('test_accounts').select('user_id, character_key').eq('club_id', club.id)
  const userOf = new Map(((held ?? []) as { user_id: string; character_key: string }[]).map(r => [r.character_key, r.user_id]))
  const rowOf = new Map<string, string>()
  const made: string[] = []
  for (const [i, c] of cast.entries()) {
    if (late()) return { done: false, lines }
    const email = testEmail(c.username, club.slug)
    let userId = userOf.get(c.key) ?? null
    if (userId) {
      const { data } = await db.auth.admin.getUserById(userId)
      if (!data.user) userId = null
    }
    if (!userId) {
      const { data, error } = await db.auth.admin.createUser({
        email, password: testPassword()!, email_confirm: true,
        user_metadata: { test_club: club.slug, character: c.key },
      })
      if (data.user) userId = data.user.id
      else if (error && /already/i.test(error.message)) userId = (await findAccount(db, email))?.id ?? null
      if (!userId) throw new Error(`Could not make ${c.name}’s account: ${error?.message ?? 'unknown'}`)
      made.push(c.name)
    }
    const steps = await Promise.all([
      db.from('test_accounts').upsert({ user_id: userId, club_id: club.id, character_key: c.key }, { onConflict: 'user_id' }),
      db.from('account_usernames').upsert({ user_id: userId, username: c.username }, { onConflict: 'user_id' }),
      db.from('account_details').upsert({ user_id: userId, gender: c.gender, birth_date: c.birthDate, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
    ])
    for (const s of steps) if (s.error) throw new Error(`${c.name}: ${s.error.message}`)
    await setIndex(handicapStore(db), { userId }, c.handicap, userId, 'me')

    const credentials = { owner: false, playsHere: true, officer: !!c.officer, clubhouse: !!c.clubhouse }
    const row = {
      club_id: club.id, name: c.name, email, user_id: userId, member_number: memberNumber(i),
      category_id: cats.get(c.membership) ?? null, gender: c.gender, birth_date: c.birthDate,
      officer: credentials.officer, clubhouse: credentials.clubhouse, role: storedRole(credentials),
      removed_at: null, updated_at: new Date().toISOString(),
    }
    const { data: existing } = await db.from('club_members').select('id').eq('club_id', club.id).eq('user_id', userId).maybeSingle()
    const res = existing
      ? await db.from('club_members').update(row).eq('id', (existing as { id: string }).id).select('id').single()
      : await db.from('club_members').insert({ ...row, linked_at: new Date().toISOString() }).select('id').single()
    if (res.error) throw new Error(`${c.name}’s place on the list: ${res.error.message}`)
    rowOf.set(c.key, (res.data as { id: string }).id)
    userOf.set(c.key, userId)
  }
  if (made.length) lines.push(`Accounts made: ${made.join(', ')}.`)
  lines.push(`${cast.length} characters on the list.`)

  // ── The keep-list's places keep a membership ──
  {
    const { data: keep } = await db.from('test_club_keep').select('user_id').eq('club_id', club.id)
    const ids = ((keep ?? []) as { user_id: string }[]).map(k => k.user_id)
    if (ids.length) {
      const { error } = await db.from('club_members').update({ category_id: cats.get(DEFAULT_MEMBERSHIP) })
        .eq('club_id', club.id).in('user_id', ids).is('category_id', null)
      if (error) throw error
    }
  }

  // ── Labels ──
  {
    const { data, error } = await db.from('club_labels').select('name').eq('club_id', club.id)
    if (!error) {
      const have = new Set(((data ?? []) as { name: string }[]).map(r => r.name.toLowerCase()))
      const madeLabels: string[] = []
      for (const [i, l] of TEST_LABELS.entries()) {
        if (have.has(l.name.toLowerCase())) continue
        const group = {
          ...(l.genders ? { genders: l.genders } : {}),
          ...(l.memberships ? { categories: l.memberships.map(m => cats.get(m)).filter((x): x is string => !!x) } : {}),
          ...(l.maxIndex !== undefined ? { maxIndex: l.maxIndex } : {}),
        }
        await saveLabel(db, club.id, { id: '', name: l.name, colour: l.colour, groups: [group], eventType: null, position: 10 + i })
        madeLabels.push(l.name)
      }
      if (madeLabels.length) lines.push(`Labels made: ${madeLabels.join(', ')}.`)
    }
  }

  // ── Casual tee times for the next seven days ──
  const office = cast.find(c => c.clubhouse)
  const casual = await bookCasual({ db, club, cast, rowOf, wishes: casualPlan(cast, irishToday(new Date())), late })
  lines.push(...casual.lines)
  if (casual.booked) lines.push(`${casual.booked} casual tee times booked over the next seven days.`)
  if (!casual.done) return { done: false, lines }

  // ── The season so far: eight competitions, played, signed and certified ──
  const { data: clubRow } = await db.from('clubs').select('home_course_id').eq('id', club.id).maybeSingle()
  const homeCourseId = (clubRow as { home_course_id?: string | null } | null)?.home_course_id ?? null
  if (!homeCourseId) {
    lines.push(`${club.name} has no home course, so no season was played. Set it in the Clubhouse (Club settings), then press Reseed without wiping.`)
    return { done: true, lines }
  }
  const today = irishToday(new Date())
  const season = seasonPlan(cast, today)
  for (const spec of season) {
    if (late()) return { done: false, lines }
    if (await alreadyPlayed(db, club.id, spec)) continue
    const r = await playCompetition({ db, club: { id: club.id, slug: club.slug, homeCourseId }, cast, rowOf, cats, deadline }, spec)
    lines.push(...r.lines)
    if (!r.done) return { done: false, lines }
  }

  // ── The banter: statuses, comments and dots in the feed (D313) ──
  let posted = 0
  for (const spec of season) {
    if (late()) return { done: false, lines: posted ? [...lines, `${posted} statuses, comments and dots posted so far.`] : lines }
    const r = await postBanter({ db, club, cast, rowOf, userOf, spec, banter: banter[spec.key], deadline })
    posted += r.posted
    lines.push(...r.lines)
    if (!r.done) return { done: false, lines: posted ? [...lines, `${posted} statuses, comments and dots posted so far.`] : lines }
  }
  if (posted) lines.push(`${posted} statuses, comments and dots posted to the feed.`)

  // ── The club match play, part-way through its draw (s1c) ──
  {
    const r = await playMatchPlay({ db, club: { id: club.id, slug: club.slug, homeCourseId }, cast, rowOf, today, deadline })
    lines.push(...r.lines)
    if (!r.done) return { done: false, lines }
  }

  // ── Golfer of the Year, the club's own rules at their defaults ──
  if (office) {
    const token = await characterToken(testEmail(office.username, club.slug))
    const year = Number(today.slice(0, 4))
    const list = await callAs(awardsRoute, '/api/club/awards', token, { action: 'list', clubId: club.id, year })
    const awards = (list.body.awards ?? []) as { name: string }[]
    if (list.status === 200 && !awards.some(a => a.name === 'Golfer of the Year')) {
      const r = await callAs(awardsRoute, '/api/club/awards', token, { action: 'save', clubId: club.id, year, name: 'Golfer of the Year', rules: {} })
      lines.push(r.status === 200 ? `Golfer of the Year ${year} set up.` : `Golfer of the Year not set up: ${String(r.body.error ?? r.status)}`)
    } else if (list.status !== 200) lines.push(`Golfer of the Year not read: ${String(list.body.error ?? list.status)}`)
  }
  return { done: true, lines }
}
