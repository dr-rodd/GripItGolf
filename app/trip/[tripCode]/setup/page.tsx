import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { parseFormats } from '@/lib/formats'
import { parseTeamScoring } from '@/lib/teamScoring'
import TripSetupClient from './TripSetupClient'
import PasscodeGate from './PasscodeGate'
import { isLocked } from '@/lib/passcode'

export const dynamic = 'force-dynamic'

export default async function TripSetupPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('TripSetupPage trip query failed:', tripError)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a1a0e] px-6">
        <p className="font-[family-name:var(--font-playfair)] text-2xl text-white mb-3">Trip not found</p>
        <p className="text-white/40 text-sm mb-8">Check the code and try again.</p>
        <Link href="/" className="text-[#C9A84C] text-sm tracking-wide hover:text-[#d4b35a] transition-colors">
          ← Back to home
        </Link>
      </main>
    )
  }

  const [teamsResult, playersResult, roundsResult] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, color')
      .eq('trip_id', trip.id)
      .order('created_at'),
    supabase
      .from('players')
      .select('id, name, handicap, gender, team_id, is_lead')
      .eq('trip_id', trip.id)
      .order('created_at'),
    supabase
      .from('rounds')
      .select('id, round_number, course_id')
      .eq('trip_id', trip.id)
      .order('round_number'),
  ])

  if (teamsResult.error) console.error('TripSetupPage teams query failed:', teamsResult.error)
  if (playersResult.error) console.error('TripSetupPage players query failed:', playersResult.error)
  if (roundsResult.error) console.error('TripSetupPage rounds query failed:', roundsResult.error)

  const rounds = roundsResult.data ?? []
  const courseIds = rounds.map(r => r.course_id).filter(Boolean)
  const { data: courses, error: coursesError } = courseIds.length > 0
    ? await supabase.from('courses').select('id, name').in('id', courseIds)
    : { data: [], error: null }

  if (coursesError) console.error('TripSetupPage courses query failed:', coursesError)

  const courseMap = Object.fromEntries((courses ?? []).map(c => [c.id, c.name]))

  const settings = (
    <TripSetupClient
      trip={{
        id: trip.id,
        trip_code: tripCode,
        name: trip.name,
        start_date: trip.start_date ?? null,
        end_date: trip.end_date ?? null,
        formats: parseFormats(trip.formats),
        team_scoring: parseTeamScoring(trip.team_scoring),
        setup_status: trip.setup_status ?? 'live',
        edit_permission: trip.edit_permission ?? 'everyone',
      }}
      teams={teamsResult.data ?? []}
      players={playersResult.data ?? []}
      rounds={rounds.map(r => ({
        id: r.id,
        round_number: r.round_number,
        courseName: courseMap[r.course_id] ?? `Round ${r.round_number}`,
      }))}
    />
  )

  // Locked at creation and never afterwards, so a trip cannot be locked out
  // from under whoever runs it
  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
      >
        {settings}
      </PasscodeGate>
    )
  }

  return settings
}
