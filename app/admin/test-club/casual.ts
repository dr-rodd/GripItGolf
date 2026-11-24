// Casual tee times the characters book (D311, D312), through the club's own
// route as the first named — and, where booking has not opened or the time is
// under a competition, as the office books it. Shared by the reseed's coming
// week and a week file's casual list. Each one looks first (a booking by
// somebody in it that day is left as it is), so booking again changes nothing.
// Server only.

import type { createAdminClient } from '@/lib/supabase-admin'
import { testEmail, type Character } from '@/lib/testClub'
import { POST as teeTimesRoute } from '@/app/api/club/tee-times/route'
import { callAs, characterToken } from './characterCalls'

type Db = ReturnType<typeof createAdminClient>

export interface CasualWish { day: string; time: string; who: string[] }

export async function bookCasual(o: {
  db: Db
  club: { id: string; slug: string }
  cast: readonly Character[]
  rowOf: ReadonlyMap<string, string>
  wishes: readonly CasualWish[]
  late: () => boolean
}): Promise<{ done: boolean; booked: number; lines: string[]; /** Wishes that are in the sheet now (booked now or before). */ placed: Set<string> }> {
  const { db, club, cast, rowOf } = o
  const byKey = new Map(cast.map(c => [c.key, c]))
  const office = cast.find(c => c.clubhouse)
  const lines: string[] = []
  const placed = new Set<string>()
  let booked = 0
  for (const w of o.wishes) {
    if (o.late()) return { done: false, booked, lines, placed }
    const wanted = w.who.map(k => rowOf.get(k)).filter((x): x is string => !!x)
    const first = byKey.get(w.who[0])
    if (!first || wanted.length < 2) continue
    const id = `${w.day}@${w.time}:${w.who.join('+')}`
    // Booked by an earlier press: nobody signs in to find that out.
    const { data: have } = await db.from('club_tee_bookings').select('id').eq('club_id', club.id).eq('play_on', w.day).in('member_id', wanted).limit(1)
    if ((have ?? []).length > 0) { placed.add(id); continue }
    const token = await characterToken(testEmail(first.username, club.slug))
    const day = await callAs(teeTimesRoute, '/api/club/tee-times', token, { action: 'day', clubId: club.id, date: w.day })
    if (day.status !== 200) { lines.push(`Tee times on ${w.day} not read: ${String(day.body.error ?? day.status)}`); continue }
    const d = day.body as unknown as { times: string[]; bookings: { time: string; memberId: string | null }[]; settings: { groupSize: number } }
    const taken = (t: string) => d.bookings.filter(b => b.time === t).length
    const time = d.times.find(t => t >= w.time && taken(t) + wanted.length <= Math.min(4, d.settings.groupSize))
    if (!time) continue
    const people = wanted.map(memberId => ({ memberId }))
    let r = await callAs(teeTimesRoute, '/api/club/tee-times', token, { action: 'book', clubId: club.id, date: w.day, time, people })
    // Booking not open yet, or a time under a competition: the office books it, as a club's office would.
    if (r.status !== 200 && office) {
      const officeToken = await characterToken(testEmail(office.username, club.slug))
      r = await callAs(teeTimesRoute, '/api/club/tee-times', officeToken, { action: 'office.book', clubId: club.id, date: w.day, time, people })
    }
    if (r.status === 200) { booked++; placed.add(id) }
    else lines.push(`${w.who.join(', ')} on ${w.day}: ${String(r.body.error ?? r.status)}`)
  }
  return { done: true, booked, lines, placed }
}
