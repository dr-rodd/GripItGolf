import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { eventReader } from '@/lib/eventReader'
import { entryCookie } from '@/lib/publicPin'
import { entryAllowed } from '@/lib/pinHash'
import EntryGate from './EntryGate'
import { tripBase } from '@/lib/tripPaths'

export const dynamic = 'force-dynamic'

/**
 * The door of an event with a public PIN (lib/publicPin.ts, docs/event-use-
 * cases.md story 2, stage 5). The trip layout sends a phone here when it
 * has not entered the event; the PIN — or the admin PIN — lets it in, and
 * from then on this phone goes straight through.
 *
 * Outside `/trip/[code]` on purpose: under it, the layout would send this
 * page back to itself. `select('*')` so an un-migrated database (no column
 * at all) reads as no lock and sends the phone straight on.
 */
export default async function EnterPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params
  const db = eventReader(tripCode)
  const [{ data }, jar] = await Promise.all([
    db.from('trips').select('*').eq('trip_code', tripCode).maybeSingle(),
    cookies(),
  ])
  const trip = data as { name: string; kind?: string | null; public_passcode_hash?: string | null; settings_passcode_hash?: string | null } | null
  if (!trip) notFound()
  const lock = trip.public_passcode_hash ?? null
  const home = tripBase(tripCode, trip.kind)
  if (entryAllowed(lock, jar.get(entryCookie(tripCode))?.value, tripCode)) redirect(home)

  return (
    <EntryGate
      tripCode={tripCode}
      home={home}
      eventName={trip.name}
    />
  )
}
