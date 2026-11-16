import { cache } from 'react'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { entryCookie } from '@/lib/publicPin'
import { entryAllowed } from '@/lib/pinHash'
import { opensAt, teeClocks } from '@/lib/teeSheet'
import { describeTime } from '@/lib/itinerary'
import { compPhase } from '@/lib/compPhase'
import { teeInstant } from '@/lib/clubComp'
import { compHome } from '@/lib/clubBar'
import { readCompSheet, readCompetition } from '@/app/api/club/bookingStore'
import { readFace } from '../../face'
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
export const readCompPage = cache(async (slug: string, rawCode: string) => {
  const code = rawCode.trim().toUpperCase()
  const db = createAdminClient()
  const [face, comp, jar] = await Promise.all([readFace(slug, { events: false }), readCompetition(db, code), cookies()])
  if (!face || !comp || comp.clubId !== face.id) notFound()
  const { id: _id, ...clubFace } = face
  const here = compHome(slug, code)
  const base = { slug, code, clubFace, comp, here }

  // The members-only door: nothing of the competition without it.
  if (!entryAllowed(comp.publicHash, jar.get(entryCookie(code))?.value, code)) {
    return { ...base, door: true as const }
  }

  const sheet = await readCompSheet(db, comp)
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
      index, clock: describeTime(clock),
      gone: at !== null && now >= at,
      seats: sheet.seats.filter(s => s.slot === index)
        .map(s => ({ rowId: s.rowId, playerId: s.playerId, name: s.name, handicap: s.handicap, bookedBy: s.bookedBy })),
    }
  })

  return {
    ...base, door: false as const,
    sheet, phase, slots, firstTeeAt, bookingOpensAt,
    firstTee: clocks[0] ? describeTime(clocks[0]) : null,
  }
})

export type CompPage = Awaited<ReturnType<typeof readCompPage>>
export type OpenCompPage = Extract<CompPage, { door: false }>
