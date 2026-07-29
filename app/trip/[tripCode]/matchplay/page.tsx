import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { parseFormats } from '@/lib/formats'
import BackButton from '@/app/components/BackButton'
import MatchplayBracket, {
  type BracketMatchRow, type BracketPlayerRow,
} from './MatchplayBracket'

export const dynamic = 'force-dynamic'

/**
 * The matchplay draw, on its own route.
 *
 * Kept separate from the leaderboard on purpose — the leaderboard links here
 * rather than rendering any of this, so none of the bracket display code is
 * bundled into the leaderboard's page load.
 */
export default async function MatchplayPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name, formats')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('MatchplayPage trip query failed:', tripError)
  if (!trip) notFound()

  const formats = parseFormats(trip.formats)
  const enabled = formats.matchplay

  const [matchesRes, playersRes] = await Promise.all([
    supabase
      .from('matchplay_matches')
      .select(
        'id, trip_id, round_number, round_name, slot, player_a_id, player_b_id, ' +
        'player_a_is_bye, player_b_is_bye, seed_a, seed_b, ' +
        'winner_player_id, result, next_match_id, next_slot'
      )
      .eq('trip_id', trip.id)
      .order('round_number')
      .order('slot'),
    supabase
      .from('players')
      .select('id, name, handicap')
      .eq('trip_id', trip.id),
  ])

  if (matchesRes.error) console.error('MatchplayPage matches query failed:', matchesRes.error)
  if (playersRes.error) console.error('MatchplayPage players query failed:', playersRes.error)

  const matches = matchesRes.data ?? []

  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">
      <div className="sticky top-0 z-50 bg-[#0a1a0e] border-b border-[#1e3d28]">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          <BackButton href={`/trip/${tripCode}/leaderboard`} />
          <h1 className="font-[family-name:var(--font-playfair)] text-xl sm:text-2xl text-white tracking-wide truncate px-2">
            Matchplay
          </h1>
          <div className="w-11" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {!enabled ? (
          <EmptyState
            title="Matchplay isn't switched on"
            body="Turn it on in Trip Setup, then draw the bracket."
            tripCode={tripCode}
          />
        ) : matches.length === 0 ? (
          <EmptyState
            title="No bracket has been created for this trip yet"
            body="Open Trip Setup and use Create Matchplay to draw the bracket."
            tripCode={tripCode}
          />
        ) : (
          <MatchplayBracket
            matches={matches as unknown as BracketMatchRow[]}
            players={(playersRes.data ?? []) as BracketPlayerRow[]}
          />
        )}
      </div>
    </div>
  )
}

function EmptyState({
  title, body, tripCode,
}: {
  title: string
  body: string
  tripCode: string
}) {
  return (
    <div className="border border-[#1e3d28] rounded-sm px-6 py-14 text-center">
      <p className="font-[family-name:var(--font-playfair)] text-white/70 text-lg leading-snug mb-2">
        {title}
      </p>
      <p className="text-white/30 text-sm leading-relaxed mb-8 max-w-xs mx-auto">{body}</p>
      <Link
        href={`/trip/${tripCode}/setup`}
        className="inline-block px-6 py-3.5 border border-[#C9A84C]/40 text-[#C9A84C] rounded-sm text-xs tracking-[0.2em] uppercase hover:bg-[#C9A84C]/10 transition-colors"
      >
        Trip Setup
      </Link>
    </div>
  )
}
