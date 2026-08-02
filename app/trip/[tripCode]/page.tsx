import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { hasMatchplay, needsPairings, boardTitle } from '@/lib/leaderboards'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { isLocked } from '@/lib/passcode'
import { playerCookieName, readPlayerId } from '@/lib/playerCookie'
import {
  standings, standingFor, matchRecord, describePosition, formatRelative,
  type SummaryScore, type SummaryMatch,
} from '@/lib/playerSummary'
import TripCountdown from './TripCountdown'
import WelcomeBack from './WelcomeBack'
import TripHeader from '@/app/components/TripHeader'
import Itinerary from './Itinerary'
import { type ItineraryItem, dayCount } from '@/lib/itinerary'
import BackButton from '@/app/components/BackButton'
import SupportLink from '@/app/components/SupportLink'
import TabBar from '@/app/components/TabBar'
import { Badge } from '@/app/components/ui'

export const dynamic = 'force-dynamic'

/** "Friday 17 April" — the day matters as much as the date on a golf trip. */
function formatDay(d: string | null | undefined) {
  if (!d) return null
  // Parsed as a plain date, not a moment in time: a round on the 17th is on
  // the 17th wherever you happen to be reading this.
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return null
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Marks a trip whose settings need a passcode. */
function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" className="flex-shrink-0 opacity-70" aria-label="Passcode required">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}

export default async function TripPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('trip_code', tripCode)
    .single()

  if (tripError) console.error('TripPage trip query failed:', tripError)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">Trip not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  const [roundsResult, playersResult, itineraryResult] = await Promise.all([
    supabase
      .from('rounds')
      .select('round_number, course_id, scheduled_date')
      .eq('trip_id', trip.id)
      .order('round_number'),
    supabase
      .from('players')
      .select('id, name, handicap, claimed, team_id')
      .eq('trip_id', trip.id)
      .order('name'),
    supabase
      .from('itinerary_items')
      .select('id, day_index, position, kind, course_id, tee_time, tee_count, ' +
              'stay_name, travel_mode, from_place, to_place, duration_mins')
      .eq('trip_id', trip.id)
      .order('day_index')
      .order('position'),
  ])

  if (roundsResult.error) console.error('TripPage rounds query failed:', roundsResult.error)
  if (itineraryResult.error) console.error('TripPage itinerary query failed:', itineraryResult.error)
  if (playersResult.error) console.error('TripPage players query failed:', playersResult.error)

  const rounds  = roundsResult.data ?? []
  const players = playersResult.data ?? []

  type ItinRow = {
    id: string; day_index: number; position: number; kind: 'golf' | 'stay' | 'travel'
    course_id: string | null; tee_time: string | null; tee_count: number | null
    stay_name: string | null; travel_mode: 'car' | 'flight' | 'train' | null
    from_place: string | null; to_place: string | null; duration_mins: number | null
  }
  const itinerary: ItineraryItem[] = ((itineraryResult.data ?? []) as unknown as ItinRow[])
    .map(r => ({
      id: r.id, dayIndex: r.day_index, position: r.position, kind: r.kind,
      courseId: r.course_id, teeTime: r.tee_time, teeCount: r.tee_count,
      stayName: r.stay_name, travelMode: r.travel_mode,
      fromPlace: r.from_place, toPlace: r.to_place, durationMins: r.duration_mins,
    }))

  // Courses for both the rounds list and the itinerary's golf tiles
  const courseIds = [
    ...rounds.map(r => r.course_id),
    ...itinerary.map(i => i.courseId),
  ].filter(Boolean)
  const { data: courses, error: coursesError } = courseIds.length > 0
    ? await supabase.from('courses').select('id, name').in('id', courseIds)
    : { data: [], error: null }

  if (coursesError) console.error('TripPage courses query failed:', coursesError)

  const courseMap = Object.fromEntries((courses ?? []).map(c => [c.id, c.name]))

  // Grouped by the day they are played, so a two-round day reads as one day
  // with two courses rather than as two unrelated entries.
  const days: { key: string; label: string | null; courses: string[] }[] = []
  for (const r of rounds) {
    const name = courseMap[r.course_id]
    if (!name) continue
    const key = r.scheduled_date ?? `round-${r.round_number}`
    const existing = days.find(d => d.key === key)
    if (existing) existing.courses.push(name)
    else days.push({ key, label: formatDay(r.scheduled_date), courses: [name] })
  }

  const dateRange  = [formatDate(trip.start_date), formatDate(trip.end_date)].filter(Boolean).join(' – ')

  // Trips created before the lifecycle migration have no setup_status — treat as live
  // A player is confirmed once a real person has claimed that slot;
  // organiser-created placeholders stay pending until someone does.
  const confirmedCount = players.filter(p => p.claimed === true).length
  const pendingCount   = players.length - confirmedCount

  const everyoneIn = players.length > 0 && pendingCount === 0
  const settingsLocked = isLocked(trip.settings_passcode_hash)
  const isDraft = (trip.setup_status ?? 'live') === 'draft'
  // What the trip plays for, read off its boards. The hub used to name the
  // old flags, which no longer describe a trip set up in this model.
  const boards = boardsForTrip(trip)
  const formatLine = boards.map(boardTitle).join(' · ')

  // ── Do we know who this is? ──
  //
  // A cookie left on this device when they joined. Nothing is fetched for it
  // until it turns out to name somebody real, so a first-time visitor pays
  // nothing for a greeting they will not see.
  const jar = await cookies()
  const knownId = readPlayerId(jar.get(playerCookieName(tripCode))?.value)
  // The id has to belong to *this* trip. A cookie is per-trip already, but
  // checking against the roster means a stale or copied one finds nobody
  // rather than greeting a stranger from someone else's trip.
  const me = knownId ? players.find(p => p.id === knownId) ?? null : null

  const summaryLines: { label: string; value: string; strong?: boolean }[] = []

  if (me) {
    const [scoresResult, matchesResult] = await Promise.all([
      supabase
        .from('scores')
        .select('player_id, round_id, stableford_points')
        .eq('trip_id', trip.id),
      hasMatchplay(boards)
        ? supabase
            .from('matchplay_matches')
            .select('player_a_id, player_b_id, winner_player_id, ' +
                    'team_a_id, team_b_id, winner_team_id, ' +
                    'player_a_is_bye, player_b_is_bye, entrant_type')
            .eq('trip_id', trip.id)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (scoresResult.error) console.error('TripPage scores query failed:', scoresResult.error)
    if (matchesResult.error) console.error('TripPage matchplay query failed:', matchesResult.error)

    type MatchRow = {
      player_a_id: string | null; player_b_id: string | null; winner_player_id: string | null
      team_a_id: string | null;   team_b_id: string | null;   winner_team_id: string | null
      player_a_is_bye: boolean;   player_b_is_bye: boolean
    }
    const matchRows = (matchesResult.data ?? []) as unknown as MatchRow[]

    // The same totals the leaderboard shows, under the same discard rule
    const scored: SummaryScore[] = (scoresResult.data ?? []).map(s => ({
      playerId: s.player_id,
      roundId: s.round_id,
      points: s.stableford_points ?? 0,
    }))
    // Under the trip's own discard rule, so the hub and the leaderboard
    // cannot disagree. Discard is per-board now, so it is the leading
    // Stableford board's rule — the one the greeting is quoting a total from.
    const headline = boards.find(b =>
      b.competition === 'league' && b.scoring === 'stableford')
    const board = standings(scored, headline?.discardWorst ?? 0)
    const mine  = standingFor(me.id, board)

    if (mine) {
      summaryLines.push({ label: 'Points', value: String(mine.total), strong: true })
      summaryLines.push({ label: 'Level', value: formatRelative(mine.relative) })
      summaryLines.push({ label: 'Position', value: describePosition(mine, board.length) })
      summaryLines.push({
        label: 'Rounds',
        value: `${mine.rounds} of ${rounds.length || mine.rounds}`,
      })
    }

    // In a pairs draw the entrant is their pairing, not them
    const entrantId = needsPairings(boards) ? me.team_id ?? null : me.id
    if (entrantId && matchRows.length > 0) {
      const pairs = needsPairings(boards)
      const asSides: SummaryMatch[] = matchRows.map(m => ({
        sideA:  pairs ? m.team_a_id : m.player_a_id,
        sideB:  pairs ? m.team_b_id : m.player_b_id,
        winner: pairs ? m.winner_team_id : m.winner_player_id,
        isBye:  m.player_a_is_bye || m.player_b_is_bye,
      }))
      const record = matchRecord(entrantId, asSides)
      if (record.played > 0) {
        summaryLines.push({ label: 'Matches', value: `${record.won} of ${record.played}` })
      } else if (record.stillIn) {
        summaryLines.push({ label: 'Matchplay', value: 'In the draw' })
      }
    }
  }

  const lockedButton = (label: string) => (
    <div className="w-full py-[18px] border-2 border-bark/12 rounded-xl flex items-center justify-center gap-3">
      <span className="text-ink/50 text-sm tracking-[0.25em] uppercase">{label}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink/50" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    </div>
  )

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">

      {/* Settled from the first pixel. The collapse lives on the landing
          page now: this screen is opened to be read, and the brand
          performing on the way in only delays it. */}
      <TripHeader backTo={`/trip/${tripCode}`} />

      {/* ── Hero ── */}
      <section className="flex flex-col items-center px-6 pt-6 pb-12">
        <div className="w-full max-w-sm flex flex-col items-center text-center">

          {/* Only for somebody this device already knows. A stranger sees the
              page exactly as it was before this feature existed. */}
          {me && (
            <div className="w-full mb-5">
              <WelcomeBack
                tripCode={tripCode}
                name={me.name.split(' ')[0]}
                lines={summaryLines}
              />
            </div>
          )}

          {/* Trip name — the reason you opened the page, so it leads.
              Scales with the viewport and wraps rather than shrinking to fit.
              The green dot closes it the way it closes the wordmark. */}
          <h1 className="t-h1 text-ink text-balance" style={{ fontSize: 'clamp(26px, 8vw, 34px)' }}>
            {trip.name}<span className="t-title-dot" aria-hidden="true" />
          </h1>

          {/* Dates */}
          {dateRange && (
            <p className="t-cap uppercase tracking-[0.18em] text-ink/65 mt-3">{dateRange}</p>
          )}

          {/* The running order, dimming as the trip happens. Falls back to
              the plain list of rounds for trips made before the itinerary. */}
          {itinerary.length > 0 ? (
            <div className="w-full mt-7 text-left">
              <Itinerary
                items={itinerary}
                startDate={trip.start_date ?? null}
                courseNames={courseMap}
                days={dayCount(trip.start_date ?? null, trip.end_date ?? null)}
              />
            </div>
          ) : days.length > 0 && (
            <div className="w-full mt-7">
              <ul className="flex flex-col gap-2">
                {days.map((d, i) => (
                  <li
                    key={d.key}
                    className="rounded-xl border border-bark/12 bg-surface px-4 py-3"
                  >
                    <p className="t-cap uppercase tracking-[0.18em] text-ink/65">
                      {d.label ?? `Round ${i + 1}`}
                    </p>
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {d.courses.map((name, j) => (
                        <p
                          key={j}
                          className="t-card text-ink"
                        >
                          {name}
                        </p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Format line */}
          {formatLine && (
            <p className="t-cap uppercase tracking-[0.18em] text-ink/65 mt-6">{formatLine}</p>
          )}

          {/* Setup badge */}
          {isDraft && (
            <div className="mt-6">
              <Badge>In setup</Badge>
            </div>
          )}

          {/* Countdown wrapping nav */}
          <TripCountdown target={trip.start_date ?? null}>
            <nav className="flex flex-col gap-3 w-full max-w-xs mx-auto">

              {/* Join Trip. Gold while someone is still expected; once the
                  whole field is in there is nothing left to prompt, so it
                  settles back to a plain button. */}
              <Link
                href={`/trip/${tripCode}/players`}
                className={`w-full py-[18px] border-2 rounded-xl text-sm tracking-[0.25em] uppercase text-center transition-colors ${
                  everyoneIn
                    ? 'border-bark/12 text-ink/65 hover:border-bark/25 hover:text-ink/80'
                    : 'border-accent text-accent hover:bg-accent/10'
                }`}
              >
                {everyoneIn ? 'Players' : 'Join Trip'}
              </Link>

              {isDraft ? (
                <>
                  {/* Trip Setup — the organiser's home while drafting */}
                  <Link
                    href={`/trip/${tripCode}/setup`}
                    className="w-full py-[18px] bg-accent-deep text-white rounded-xl text-sm font-bold tracking-[0.25em] uppercase text-center hover:bg-accent transition-colors inline-flex items-center justify-center gap-2"
                  >
                    Trip Setup
                    {settingsLocked && <LockIcon />}
                  </Link>

                  {lockedButton('Live Scoring')}
                  {lockedButton('Leaderboard')}
                  <p className="text-ink/50 text-[13px] mt-1">
                    Scoring opens when the trip is finalised
                  </p>
                </>
              ) : (
                <>
                  {/* Live Scoring — links to round 1 */}
                  {rounds.length > 0 ? (
                    <Link
                      href={`/trip/${tripCode}/course`}
                      className="w-full py-[18px] border-2 border-bark/25 text-ink/80 rounded-xl text-sm tracking-[0.25em] uppercase text-center hover:border-bark/25 hover:text-ink/80 transition-colors"
                    >
                      Live Scoring
                    </Link>
                  ) : (
                    lockedButton('Live Scoring')
                  )}

                  {/* Leaderboard */}
                  <Link
                    href={`/trip/${tripCode}/leaderboard`}
                    className="w-full py-[18px] border-2 border-bark/25 text-ink/80 rounded-xl text-sm tracking-[0.25em] uppercase text-center hover:border-bark/25 hover:text-ink/80 transition-colors"
                  >
                    Leaderboard
                  </Link>

                  {/* Settings — leads to setup page with unlock option */}
                  <Link
                    href={`/trip/${tripCode}/setup`}
                    className="text-ink/50 text-[13px] tracking-wide hover:text-ink/65 transition-colors mt-1 inline-flex items-center justify-center gap-1.5"
                  >
                    Trip settings
                    {settingsLocked && <LockIcon />}
                  </Link>
                </>
              )}

            </nav>
          </TripCountdown>

        </div>
      </section>

      {/* ── Players ── */}
      {players.length > 0 && (
        <section className="px-6 pb-16">
          <div className="max-w-xs mx-auto">

            <div className="flex items-baseline justify-between mb-3">
              <p className="text-ink/65 text-[13px] tracking-[0.2em] uppercase">Players</p>
              <p className="text-ink/50 text-[13px] tabular-nums">
                {confirmedCount} of {players.length} in
              </p>
            </div>

            {/* Legend — makes the colours mean something at a glance */}
            <div className="flex items-center gap-4 mb-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent " />
                <span className="text-ink/65 text-[12px] tracking-wider uppercase">Confirmed</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-ink/65 text-[12px] tracking-wider uppercase">Pending</span>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {players.map(p => {
                const confirmed = p.claimed === true
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 border rounded-xl transition-colors ${
                      confirmed
                        ? 'border-accent/50 bg-accent/[0.06] '
                        : 'border-accent/45 bg-accent/[0.06]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        confirmed
                          ? 'bg-accent '
                          : 'bg-accent'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-ink text-sm truncate">{p.name}</span>
                      <span
                        className={`block text-[12px] tracking-wider uppercase mt-0.5 ${
                          confirmed ? 'text-accent/70' : 'text-accent/70'
                        }`}
                      >
                        {confirmed ? 'Confirmed' : 'Pending'}
                      </span>
                    </span>
                    {p.handicap != null && (
                      <span className="font-[family-name:var(--font-display)] text-accent text-base leading-none flex-shrink-0">
                        {p.handicap}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {pendingCount > 0 && (
              <p className="text-ink/50 text-[13px] mt-4 leading-relaxed">
                {pendingCount === 1 ? 'One player has' : `${pendingCount} players have`} still
                to join. Share the code <span className="text-accent">{tripCode}</span> and
                they can claim their spot.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <SupportLink className="px-6 pb-8" />

      <div className="px-6 pb-10 flex justify-center">
        <BackButton href="/" label="All trips" />
      </div>

      <TabBar tripCode={tripCode} />

    </main>
  )
}
