import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { parseLeaderboards } from '@/lib/leaderboards'
import { parseLeagueSetup } from '@/lib/leagueSetup'
import BackButton from '@/app/components/BackButton'
import PasscodeGate from '../../setup/PasscodeGate'
import DayBoardsClient from './DayBoardsClient'

export const dynamic = 'force-dynamic'

/**
 * A format for each day.
 *
 * The overall rules are chosen when the event is created; this is where a
 * single day gets its own — Day 1 singles Stableford, Day 2 fourball better
 * ball — as a board scoped to that day's round (`Leaderboard.roundIds`).
 * The overall board is scoped to nothing and goes on counting the lot.
 *
 * Behind the same PIN as the rest of the organiser area, and events only,
 * exactly like the pages beside it.
 */
export default async function DayBoardsPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, trip_code, name, kind, settings_passcode_hash, leaderboards')
    .eq('trip_code', tripCode)
    .single()
  if (error) console.error('DayBoardsPage trip query failed:', error)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">Event not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  if (!isEvent(trip.kind)) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center bg-cream px-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
          This is a trip
        </p>
        <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">
          Per-day formats belong to events. A trip&apos;s leaderboards are
          set in Trip Setup, on the tab bar below.
        </p>
        <BackButton href={`/trip/${tripCode}`} label="Trip" />
      </main>
    )
  }

  const [roundsRes, playersRes, teamsRes, setupRes] = await Promise.all([
    supabase
      .from('rounds')
      .select('id, round_number, courses(name)')
      .eq('trip_id', trip.id)
      .order('round_number'),
    supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('is_composite', false),
    supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip.id),
    // Its own query, fail-soft: pre-047 the column does not exist and the
    // days simply read as one running total, which is what they were.
    supabase
      .from('trips')
      .select('bracket_setup')
      .eq('id', trip.id)
      .single(),
  ])

  if (roundsRes.error) console.error('DayBoardsPage rounds query failed:', roundsRes.error)

  type RoundRow = {
    id: string
    round_number: number
    courses: { name: string } | { name: string }[] | null
  }
  const rounds = ((roundsRes.data ?? []) as unknown as RoundRow[]).map(r => {
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
    return {
      id: r.id,
      roundNumber: r.round_number,
      courseName: course?.name ?? null,
    }
  })

  const content = (
    <DayBoardsClient
      tripId={trip.id}
      tripCode={tripCode}
      rounds={rounds}
      initialBoards={parseLeaderboards(trip.leaderboards)}
      playerCount={playersRes.count ?? 0}
      teamCount={teamsRes.count ?? 0}
      dayBoards={parseLeagueSetup(
        (setupRes.data as { bracket_setup?: unknown } | null)?.bracket_setup
      )?.dayBoards}
    />
  )

  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        title="Formats by day"
        hint={`Enter the organiser PIN for ${trip.name}.`}
      >
        {content}
      </PasscodeGate>
    )
  }

  return content
}
