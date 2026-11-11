import { eventReader } from '@/lib/eventReader'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { parseLeaderboards } from '@/lib/leaderboards'
import BackButton from '@/app/components/BackButton'
import PasscodeGate from '../../setup/PasscodeGate'
import SessionsClient from './SessionsClient'
import { tripHomeAt } from '@/lib/tripPaths'

export const dynamic = 'force-dynamic'

/**
 * Session formats — the Dynamic Overall Leaderboard after creation (Ross,
 * 9 Nov 2026; lib/sessions.ts): each session's format (or TBC), its name,
 * how it feeds the Overall and what the Overall ranks, and turning the
 * Overall on or off. Behind the organiser PIN on an event, the Trip Setup
 * passcode on a trip (stage 8 — trips follow events, D47); reached on a trip
 * at /setup/sessions, which is this page.
 */
export default async function SessionsPage({ params }: {
  params: Promise<{ root: string; tripCode: string }>
}) {
  const { root, tripCode } = await params
  const db = eventReader(tripCode)
  const tripHome = tripHomeAt(root, tripCode)

  const { data: trip, error } = await db
    .from('trips')
    .select('id, trip_code, name, kind, settings_passcode_hash, leaderboards')
    .eq('trip_code', tripCode)
    .single()
  if (error) console.error('SessionsPage trip query failed:', error)

  if (!trip) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center paper px-6 text-center">
        <p className="t-h2 text-ink mb-3">Not found</p>
        <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }
  const event = isEvent(trip.kind)

  const [roundsRes, playersRes, tagsRes] = await Promise.all([
    db.from('rounds').select('id, round_number, courses(name)').eq('trip_id', trip.id).order('round_number'),
    db.from('players').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id).eq('is_composite', false),
    db.from('teams').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id).eq('team_set', 'main'),
  ])
  if (roundsRes.error) console.error('SessionsPage rounds query failed:', roundsRes.error)

  type RoundRow = { id: string; round_number: number; courses: { name: string } | { name: string }[] | null }
  const rounds = ((roundsRes.data ?? []) as unknown as RoundRow[]).map(r => {
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
    return { id: r.id, roundNumber: r.round_number, courseName: course?.name ?? null }
  })

  const content = (
    <SessionsClient
      tripId={trip.id}
      tripCode={tripCode}
      rounds={rounds}
      initialBoards={parseLeaderboards(trip.leaderboards)}
      playerCount={playersRes.count ?? 0}
      tagCount={tagsRes.count ?? 0}
      isTrip={!event}
    />
  )

  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        title="Session formats"
        hint={event ? `Enter the organiser PIN for ${trip.name}.` : `Enter the passcode for ${trip.name}.`}
      >
        {content}
      </PasscodeGate>
    )
  }
  return content
}
