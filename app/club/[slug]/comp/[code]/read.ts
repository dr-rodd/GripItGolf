import { cache } from 'react'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { entryCookie } from '@/lib/publicPin'
import { entryAllowed } from '@/lib/pinHash'
import { opensAt, slotGroupSizes, teeClocks } from '@/lib/teeSheet'
import { sunDay } from '@/lib/sun'
import { describeTime } from '@/lib/itinerary'
import { compPhase } from '@/lib/compPhase'
import { teeInstant } from '@/lib/clubComp'
import { compHome } from '@/lib/clubBar'
import { readCompSheet, readCompetition } from '@/app/api/club/bookingStore'
import { readFace } from '../../face'
import { readMatchPlayComp } from '@/app/api/club/matchPlayStore'
import type { CompSlot } from './CompTeeSheet'

/**
 * What a competition's four pages read (D186): the club's face, the
 * competition, and — only through its door (D164) — the sheet, the phase and
 * the tee times. One read per request (`cache`), shared by the shell and the
 * page. Never in the layout, which Next does not draw again between the
 * Summary and its sections, so a phase there would go stale.
 *
 * **Members only** is the public PIN door with a PIN nobody holds: without
 * the door's cookie nothing of the competition is read past its name.
 */
import { readPlaces } from '@/app/api/club/locationsStore'
import { logTiming, startTimer } from '@/lib/timing'
export const readCompPage = cache(async (slug: string, rawCode: string) => {
  const code = rawCode.trim().toUpperCase()
  const took = startTimer()
  const db = createAdminClient()
  const [face, comp, jar] = await Promise.all([readFace(slug, { events: false }), readCompetition(db, code), cookies()])
  if (!face) notFound()
  const { id: _id, ...clubFace } = face
  const here = compHome(slug, code)

  // A club match play has no round (Ross, 17 Nov 2026): its own Summary, behind the same door.
  if (!comp) {
    const mp = await readMatchPlayComp(db, code)
    if (!mp || mp.clubId !== face.id) notFound()
    const mpBase = { slug, code, clubFace, here, kind: 'matchplay' as const, mp }
    if (!entryAllowed(mp.publicHash, jar.get(entryCookie(code))?.value, code)) return { ...mpBase, door: true as const }
    return { ...mpBase, door: false as const }
  }
  if (comp.clubId !== face.id) notFound()
  const base = { slug, code, clubFace, comp, here, kind: 'stroke' as const }

  // The members-only door: nothing of the competition without it.
  if (!entryAllowed(comp.publicHash, jar.get(entryCookie(code))?.value, code)) {
    return { ...base, door: true as const }
  }

  // The sun on the day (Ross, 17 Nov 2026: sunrise at the head of the sheet, sunset at its foot).
  const [sheet, place, places] = await Promise.all([
    readCompSheet(db, comp),
    db.from('courses').select('latitude, longitude').eq('id', comp.courseId).maybeSingle().then(r => r.data as { latitude: number | null; longitude: number | null } | null),
    // M8 (D278): a one-course club's header never names its course.
    readPlaces(db, comp.clubId, [comp.courseId]).catch(() => null),
  ])
  const sun = sunDay(comp.date, place ? { lat: place.latitude ?? NaN, lng: place.longitude ?? NaN } : null)
  const sizes = slotGroupSizes(comp.rules)
  const clocks = teeClocks(comp.rules)
  const now = Date.now()
  const firstTeeAt = clocks[0] ? teeInstant(comp.date, clocks[0]) : null
  const bookingOpensAt = opensAt(comp.rules, comp.date)?.getTime() ?? null
  const booked = new Set(sheet.seats.map(s => s.playerId))
  const phase = compPhase({
    bookingOpensAt, firstTeeAt, booked: booked.size,
    // Scoring closes when every booked player is accounted for: a card final —
    // approved and marked (d3) — or a No return (d4).
    finished: new Set([...sheet.final, ...sheet.noReturns].filter(id => booked.has(id))).size,
    cardsStarted: sheet.onCourse.length + sheet.signed.length > 0,
    certifiedAt: sheet.certifiedAt,
  }, now)

  const slots: CompSlot[] = clocks.map((clock, index) => {
    const at = teeInstant(comp.date, clock)
    return {
      index, clock: describeTime(clock), size: sizes[index] ?? comp.rules.groupSize,
      gone: at !== null && now >= at,
      seats: sheet.seats.filter(s => s.slot === index)
        .map(s => ({ rowId: s.rowId, playerId: s.playerId, name: s.name, handicap: s.handicap, bookedBy: s.bookedBy })),
    }
  })

  logTiming('comp-page', 'read', took(), 200)
  return {
    ...base, door: false as const,
    sheet, phase, slots, firstTeeAt, bookingOpensAt, oneCourse: !!places && places.courses.length <= 1,
    sun: { sunrise: sun.sunrise ? describeTime(sun.sunrise) : null, sunset: sun.sunset ? describeTime(sun.sunset) : null },
    firstTee: clocks[0] ? describeTime(clocks[0]) : null,
  }
})

export type CompPage = Awaited<ReturnType<typeof readCompPage>>
export type OpenCompPage = Extract<CompPage, { door: false; kind: 'stroke' }>
export type MatchPlayPage = Extract<CompPage, { door: false; kind: 'matchplay' }>
