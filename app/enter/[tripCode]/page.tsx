import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { entryAllowed, entryCookie } from '@/lib/publicPin'
import EntryGate from './EntryGate'

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
  const [{ data }, jar] = await Promise.all([
    supabase.from('trips').select('*').eq('trip_code', tripCode).maybeSingle(),
    cookies(),
  ])
  const trip = data as { name: string; public_passcode_hash?: string | null; settings_passcode_hash?: string | null } | null
  if (!trip) notFound()
  const lock = trip.public_passcode_hash ?? null
  if (entryAllowed(lock, jar.get(entryCookie(tripCode))?.value)) redirect(`/trip/${tripCode}`)

  return (
    <EntryGate
      tripCode={tripCode}
      eventName={trip.name}
      publicHash={lock as string}
      adminHash={trip.settings_passcode_hash ?? null}
    />
  )
}
