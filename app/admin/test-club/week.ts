// Loading a week file (D312, M5): the week's competitions made and their
// players booked, each played, signed, co-signed and certified once its day
// has come, their statuses, comments and dots posted, and the casual tee
// times booked — every step through the club's own routes, as the
// characters, with the clock at each moment (./play.ts, ./banter.ts,
// ./casual.ts). A competition on a day still to come is made and booked now
// and played when the week is loaded again from its day on; one the club
// already has (same day, same name) is resolved, never doubled.
//
// **Loading twice changes nothing.** Every step looks before it writes, and a
// step done is recorded in `test_week_loads` against a hash of what it was —
// changed in the file, it is done again; unchanged, skipped without a read.
// A week naming anybody but a character is refused whole (D314: a real
// friend is never booked, scored or signed for — `readWeek`).
// Server only.

import type { createAdminClient } from '@/lib/supabase-admin'
import { TEST_CLUB_NOT_READY, weekSteps, type Character, type WeekFile } from '@/lib/testClub'
import { bookCasual } from './casual'
import { postBanter } from './banter'
import { playCompetition } from './play'
import { readRoster } from './roster'
import { befriend, makeGroups, postNotice, postOwn, talkOnResult } from './social'

type Db = ReturnType<typeof createAdminClient>

export interface WeekLoad { done: boolean; lines: string[] }

export async function loadWeek(o: {
  db: Db
  club: { id: string; slug: string; name: string }
  cast: readonly Character[]
  week: WeekFile
  today: string
  deadline: number
}): Promise<WeekLoad> {
  const { db, club, cast, week, today } = o
  const lines: string[] = []
  const late = () => Date.now() > o.deadline

  const { data: clubRow } = await db.from('clubs').select('home_course_id').eq('id', club.id).maybeSingle()
  const homeCourseId = (clubRow as { home_course_id?: string | null } | null)?.home_course_id ?? null
  if (!homeCourseId) return { done: true, lines: [`${club.name} has no home course — set it in the Clubhouse (Club settings) first.`] }
  const roster = await readRoster(db, club.id)
  const missing = cast.filter(c => !roster.rowOf.has(c.key) || !roster.userOf.has(c.key))
  if (missing.length) return { done: true, lines: [`${missing.map(c => c.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not on the club’s list yet — press Reseed without wiping first.`] }

  // What is done already.
  const { data: rec, error } = await db.from('test_week_loads').select('step, detail').eq('club_id', club.id).eq('week', week.week)
  if (error) return { done: true, lines: [error.code === '42P01' || error.code === 'PGRST205' ? TEST_CLUB_NOT_READY : 'Could not read what is loaded — try again.'] }
  const recorded = new Map(((rec ?? []) as { step: string; detail: { hash?: string } | null }[]).map(r => [r.step, r.detail?.hash ?? '']))
  const steps = new Map(weekSteps(week).map(s => [s.id, s]))
  const isDone = (id: string) => !!steps.get(id) && recorded.get(id) === steps.get(id)!.hash
  const record = async (id: string) => {
    const s = steps.get(id)
    if (!s) return
    const { error: e } = await db.from('test_week_loads').upsert({ club_id: club.id, week: week.week, step: id, detail: { hash: s.hash }, done_at: new Date().toISOString() }, { onConflict: 'club_id,week,step' })
    if (e) lines.push(`${s.label}: done, but not recorded — ${e.message}`)
    else recorded.set(id, s.hash)
  }

  // ── The competitions ──
  for (const spec of week.competitions) {
    if (late()) return { done: false, lines }
    let played = isDone(`comp:${spec.key}`)
    if (!played) {
      const r = await playCompetition({ db, club: { id: club.id, slug: club.slug, homeCourseId }, cast, rowOf: roster.rowOf, cats: roster.cats, deadline: o.deadline, today }, spec)
      lines.push(...r.lines)
      if (!r.done) return { done: false, lines }
      played = !!r.played
      if (r.complete) await record(`comp:${spec.key}`)
    }
    const banterId = `banter:${spec.key}`
    if (played && steps.has(banterId) && !isDone(banterId)) {
      const b = await postBanter({ db, club, cast, rowOf: roster.rowOf, userOf: roster.userOf, spec, banter: spec, deadline: o.deadline })
      lines.push(...b.lines)
      if (!b.done) return { done: false, lines }
      if (b.posted) lines.push(`${spec.name}: ${b.posted} statuses, comments and dots posted.`)
      // Recorded only once the competition is wholly done: a card signed this
      // afternoon is posted on, and certified tonight, in one more load.
      if (isDone(`comp:${spec.key}`)) await record(banterId)
    }
  }

  // ── Streams v2 (D333): friendships, the club's notices, statuses, talk under results ──
  const ctx = { db, club, cast, rowOf: roster.rowOf, userOf: roster.userOf }
  if (week.friends?.length && !isDone('friends')) {
    const f = await befriend(ctx, week.friends)
    lines.push(...f.lines)
    if (f.made) lines.push(`${f.made} friendships made.`)
    if (f.lines.length === 0) await record('friends')
  }
  // D343: the week's stream groups, made each load (finding the ones already made) so statuses have somewhere to go.
  const made = await makeGroups(ctx, week.groups ?? [])
  lines.push(...made.lines)
  for (const g of week.groups ?? []) if (made.ids.has(g.key) && !isDone(`group:${g.key}`)) { lines.push(`The ${g.name} group made.`); await record(`group:${g.key}`) }
  for (const p of week.posts ?? []) {
    if (late()) return { done: false, lines }
    const id = `post:${p.key}`
    if (p.day > today || isDone(id)) continue
    const r = await postNotice(ctx, p)
    lines.push(...r.lines)
    if (r.posted) lines.push(`${p.title ?? 'A notice'}: posted to club.stream${r.posted > 1 ? `, with ${r.posted - 1} comments` : ''}.`)
    if (r.lines.length === 0) await record(id)
  }
  for (const s of week.own ?? []) {
    if (late()) return { done: false, lines }
    const id = `own:${s.key}`
    if (s.day > today || isDone(id)) continue
    const r = await postOwn(ctx, s, made.ids.get(s.group) ?? null)
    lines.push(...r.lines)
    if (r.posted) lines.push(`A status by ${cast.find(c => c.key === s.by)?.name ?? s.by}: ${r.posted} posted.`)
    if (r.lines.length === 0) await record(id)
  }
  for (const x of week.results ?? []) {
    if (late()) return { done: false, lines }
    const id = `result:${x.key}`
    if (isDone(id)) continue
    const r = await talkOnResult(ctx, x)
    lines.push(...r.lines)
    if (r.posted) lines.push(`${r.posted} comments under ${cast.find(c => c.key === x.winner)?.name ?? x.winner}’s result.`)
    if (r.lines.length === 0) await record(id)
  }

  // ── The casual tee times ──
  const wishes = week.casual.filter(c => c.day >= today)
  const casual = await bookCasual({ db, club, cast, rowOf: roster.rowOf, wishes, late })
  lines.push(...casual.lines)
  if (casual.booked) lines.push(`${casual.booked} casual tee times booked.`)
  if (!casual.done) return { done: false, lines }
  for (const c of week.casual) {
    const id = `casual:${c.day}@${c.time}:${c.who.join('+')}`
    // A day gone by cannot be booked: it is done with, never waited for.
    if ((c.day < today || casual.placed.has(`${c.day}@${c.time}:${c.who.join('+')}`)) && steps.has(id) && !isDone(id)) await record(id)
  }
  return { done: true, lines }
}
