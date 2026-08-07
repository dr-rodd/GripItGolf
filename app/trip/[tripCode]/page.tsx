import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { hasMatchplay, needsPairings, primary } from '@/lib/leaderboards'
import { boardsForTrip, isLegacy } from '@/lib/leaderboardsCompat'
import { parseLeaderboards } from '@/lib/leaderboards'
import { parseTeamScoring } from '@/lib/teamScoring'
import { MAIN_SET, setOf, teamFor } from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import { currentPlayer } from '@/lib/currentPlayer'
import { isConfirmed, confirmedCount as countConfirmed } from '@/lib/roster'
import { ROUND_TILE } from '@/lib/roundState'
import { fetchPlacing } from '@/lib/hubStanding'
import { describePlacing } from '@/lib/standing'
import { nextMatch, describeNextMatch, type DrawMatch } from '@/lib/nextMatch'
import { SectionStack } from '@/app/components/Section'
import TripCountdown from './TripCountdown'
import StatusBlock from './StatusBlock'
import TravelStays from './TravelStays'
import TripHeader from '@/app/components/TripHeader'
import Itinerary from './Itinerary'
import { type ItineraryItem, dayCount } from '@/lib/itinerary'
import BackButton from '@/app/components/BackButton'
import SupportLink from '@/app/components/SupportLink'
import TabBar from '@/app/components/TabBar'

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
    // `itinerary_item_id` is the join that makes a countdown possible: the
    // date lives here and the tee time lives on the itinerary item, and this
    // is the only column tying the two together.
    supabase
      .from('rounds')
      .select('round_number, course_id, scheduled_date, itinerary_item_id')
      .eq('trip_id', trip.id)
      .order('round_number'),
    supabase
      .from('players')
      .select('id, name, handicap, claimed, team_id')
      .eq('trip_id', trip.id)
      // A composite is a synthetic scorecard, not a person.
      .eq('is_composite', false)
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

  // Which round each golf item became, so the up-next card can put the
  // round's date beside the item's tee time.
  const roundDates: [string, string | null][] = rounds
    .filter(r => r.itinerary_item_id)
    .map(r => [r.itinerary_item_id as string, r.scheduled_date as string | null])

  // And which round *number*, so a golf item opens its own summary page.
  // Only golf items appear here — a stay or a journey has no page and is not
  // tappable, which is the difference the itinerary reads off this map.
  const roundNumbers: Record<string, number> = Object.fromEntries(
    rounds
      .filter(r => r.itinerary_item_id)
      .map(r => [r.itinerary_item_id as string, r.round_number as number]),
  )

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
  // with two courses rather than as two unrelated entries. Only reached by a
  // trip made before the itinerary existed.
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

  // A player is confirmed once a real person has claimed that slot;
  // organiser-created placeholders stay pending until someone does.
  const confirmedCount = countConfirmed(players)
  const pendingCount   = players.length - confirmedCount

  // What the trip plays for, read off its boards. `primary` is the first one
  // — the board the trip is about, and the one the standing line quotes. The
  // titles are no longer printed as a line under the dates; what is left of
  // this is the lead board, which the standing depends on.
  const boards = boardsForTrip(trip)
  const lead = primary(boards)

  // ── Do we know who this is? ──
  //
  // A cookie left on this device when they joined, matched against this
  // trip's own roster so a stale or copied one finds nobody rather than
  // greeting a stranger. Nothing below is fetched until it turns out to name
  // somebody real, so a first-time visitor pays nothing for a personalised
  // page they will not see.
  const me = await currentPlayer(tripCode, players)

  let placingLine = ''
  let nextMatchLine = ''
  let standingError: string | null = null

  if (me) {
    const [placingResult, draw] = await Promise.all([
      // Gated exactly as the leaderboard page gates it. A trip that has
      // chosen real boards must not be scored on the old trip-wide options,
      // or this screen and that one disagree about who is where.
      fetchPlacing(
        trip.id, lead, me.id,
        isLegacy(parseLeaderboards(trip.leaderboards))
          ? parseTeamScoring(trip.team_scoring)
          : null,
      ),
      hasMatchplay(boards)
        ? supabase
            .from('matchplay_matches')
            .select('round_number, round_name, player_a_id, player_b_id, ' +
                    'player_a_is_bye, player_b_is_bye, ' +
                    'team_a_id, team_b_id, winner_player_id, winner_team_id, entrant_type')
            .eq('trip_id', trip.id)
            .order('round_number')
        : Promise.resolve({ data: [], error: null }),
    ])

    placingLine = describePlacing(placingResult.placing)
    standingError = placingResult.error

    if (draw.error) {
      console.error('TripPage matchplay query failed:', draw.error)
      standingError = standingError ?? 'Could not read the matchplay draw.'
    }

    // The board leading decides what the standing line is. A knockout has no
    // table, so it shows the next match alone; anything else shows the
    // position, and the next match underneath when a draw is also running.
    const drawBoard = boards.find(b => b.competition === 'matchplay')
    if (drawBoard) {
      type Row = {
        round_number: number; round_name: string
        player_a_id: string | null; player_b_id: string | null
        player_a_is_bye: boolean;   player_b_is_bye: boolean
        team_a_id: string | null;   team_b_id: string | null
        winner_player_id: string | null; winner_team_id: string | null
      }
      const rows = (draw.data ?? []) as unknown as Row[]

      // In a pairs draw the entrant is the PAIRING, not the player — and the
      // pairing is their place on that draw's sheet, which need not be the
      // team they play the league in.
      const pairs = needsPairings(boards)
      const memberships = pairs ? await fetchMemberships(trip.id) : []
      const entrantId = pairs
        ? teamFor(memberships, me.id, drawBoard ? setOf(drawBoard) : MAIN_SET)
        : me.id

      const asDraw: DrawMatch[] = rows.map(m => ({
        roundNumber: m.round_number,
        roundName: m.round_name,
        sideA: pairs ? m.team_a_id : m.player_a_id,
        sideB: pairs ? m.team_b_id : m.player_b_id,
        aIsBye: m.player_a_is_bye,
        bIsBye: m.player_b_is_bye,
        winner: pairs ? m.winner_team_id : m.winner_player_id,
      }))

      // Naming the opponent: a player on a singles draw, a pairing on a
      // pairs one. Teams are only fetched when there is a draw to name.
      let nameOf: (id: string) => string | null = id =>
        players.find(p => p.id === id)?.name ?? null
      if (pairs) {
        const { data: teams } = await supabase
          .from('teams').select('id, name').eq('trip_id', trip.id)
        const byId = new Map((teams ?? []).map(t => [t.id as string, t.name as string]))
        nameOf = id => byId.get(id) ?? null
      }

      nextMatchLine = describeNextMatch(nextMatch(entrantId, asDraw), nameOf)
    }

    // A knockout is the whole story when it leads. No stroke position beside
    // it — there may not even be a board with one.
    if (lead?.competition === 'matchplay') placingLine = ''
  }

  // ── The itinerary, or the list of rounds a pre-itinerary trip has ──
  const itinerarySection = itinerary.length > 0 ? (
    <Itinerary
      items={itinerary}
      startDate={trip.start_date ?? null}
      courseNames={courseMap}
      days={dayCount(trip.start_date ?? null, trip.end_date ?? null)}
      tripCode={tripCode}
      roundNumbers={roundNumbers}
    />
  ) : days.length > 0 ? (
    <ul className="flex flex-col gap-2">
      {days.map((d, i) => (
        <li key={d.key} className="rounded-xl border border-bark/12 bg-surface px-4 py-3">
          <p className="t-cap uppercase tracking-[0.18em] text-ink/65">
            {d.label ?? `Round ${i + 1}`}
          </p>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {d.courses.map((name, j) => (
              <p key={j} className="t-card text-ink">{name}</p>
            ))}
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="t-cap text-ink/65 text-center py-2">
      Nothing on the itinerary yet.
    </p>
  )

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">

      {/* Settled from the first pixel. The collapse lives on the landing
          page: this screen is opened to be read, and the brand performing on
          the way in only delays it. The mark goes to the start of the site,
          not to this page — this IS the trip hub. */}
      <TripHeader backTo="/" />

      {/* No gear here. The tab bar already carries Settings, on every screen
          in the trip, and a second door to the same room in the corner of one
          of them is a control to explain rather than one to use. */}

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">

        {/* ── Trip name, dates, and what it is played for ── */}
        <div className="flex flex-col items-center text-center pt-2 pb-7">
          <h1 className="t-h1 text-ink text-balance" style={{ fontSize: 'clamp(26px, 8vw, 34px)' }}>
            {trip.name}<span className="t-title-dot" aria-hidden="true" />
          </h1>
          {/* When it runs, in the display face at reading size rather than
              as a caption. It was 13px UI type at 65% ink, which is the
              treatment this app gives to notes and asides — and a trip's
              dates are the second thing anybody wants off this screen after
              its name. */}
          {dateRange && (
            <p className="t-card text-ink mt-2.5">{dateRange}</p>
          )}

          {/* And how long until it. Inside the title rather than below it:
              the name, the dates and the countdown are three lines of one
              heading, all answering what this trip is and when. */}
          <TripCountdown target={trip.start_date ?? null} />
        </div>

        {/* What the trip plays for used to print here, under the dates —
            every board's title joined by a dot. It is settings written on
            the hub: a reader either already knows the format or is about to
            be shown it by the leaderboard, which names its own boards. */}

        {/* ── Who this device is, and what happens next ── */}
        <StatusBlock
          tripCode={tripCode}
          player={me ? {
            firstName: me.name.split(' ')[0],
            placing: placingLine,
            nextMatch: nextMatchLine,
          } : null}
          items={itinerary}
          startDate={trip.start_date ?? null}
          roundDates={roundDates}
          roundNumbers={roundNumbers}
          courseNames={courseMap}
        />

        {standingError && (
          <p className="text-rust-deep text-sm text-center mt-3 leading-snug">{standingError}</p>
        )}

        {/* Three large buttons — Live Scoring, Leaderboard, Players — used to
            sit here, and two of them were the tab bar written out a second
            time. A screen offering the same journey twice in two different
            shapes makes the reader work out whether they are the same
            journey, and they were: the bar carries Leaderboard and Scoring on
            every screen in the trip, this one included.

            Players was not a duplicate — no tab claims it — so its door moved
            into the roster below rather than closing. Claiming is prompted by
            the status block above anyway, in the one state that needs it: a
            phone that is nobody yet gets "Claim your spot" as the loudest
            thing on the screen. */}

        {/* ── The rest, one heading at a time ──
            The margin is here rather than inside `SectionStack`, because it
            is a relationship between the status card and the stack — a fact
            about this page, not about the component. Without it the first
            section's own `border-t` butts straight up against the card
            above, and the rule reads as the card's own bottom edge rather
            than as the start of something new. */}
        <div className="mt-6">
        <SectionStack
          initial="itinerary"
          sections={[
            {
              key: 'itinerary',
              title: 'Itinerary',
              content: itinerarySection,
            },
            {
              key: 'travel',
              title: 'Travel & accommodation',
              content: <TravelStays items={itinerary} startDate={trip.start_date ?? null} />,
            },
            {
              key: 'players',
              title: 'Players',
              meta: players.length > 0 ? `${confirmedCount} of ${players.length} in` : undefined,
              content: <PlayersPanel
                players={players}
                pendingCount={pendingCount}
                tripCode={tripCode}
              />,
            },
          ]}
        />
        </div>

      </div>

      <SupportLink className="px-6 pb-8" />

      <div className="px-6 pb-10 flex justify-center">
        <BackButton href="/" label="All trips" />
      </div>

      <TabBar tripCode={tripCode} />

    </main>
  )
}

/**
 * The roster, as the hub shows it.
 *
 * Confirmed carries the hard brown edge a finished round carries and pending
 * the barely-there outline of one nothing has happened on — the same two
 * treatments, from the same file, as the join list. Both states were drawn
 * identically before Phase 1, with the ternaries still in place claiming
 * otherwise.
 */
function PlayersPanel({
  players, pendingCount, tripCode,
}: {
  players: { id: string; name: string; handicap: number | null; claimed?: boolean | null }[]
  pendingCount: number
  tripCode: string
}) {
  if (players.length === 0) {
    return (
      <p className="t-cap text-ink/65 text-center py-2">
        Nobody has joined this trip yet.
      </p>
    )
  }

  return (
    <div className="max-w-xs mx-auto">
      {/* Legend — and it has to be telling the truth. */}
      <div className="flex items-center gap-4 mb-4">
        <span className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-sm ${ROUND_TILE.played}`} aria-hidden="true" />
          <span className="text-ink/65 text-[13px] tracking-wider uppercase">Confirmed</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-sm ${ROUND_TILE.empty}`} aria-hidden="true" />
          <span className="text-ink/65 text-[13px] tracking-wider uppercase">Pending</span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {players.map(p => {
          const confirmed = isConfirmed(p)
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                confirmed ? ROUND_TILE.played : ROUND_TILE.empty
              }`}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-ink text-sm truncate">{p.name}</span>
                <span
                  className={`block text-[13px] tracking-wider uppercase mt-0.5 ${
                    confirmed ? 'text-ink/80' : 'text-ink/50'
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

      {/* The way to the join list, and now the only one on this screen for a
          phone that has already claimed. It used to be a button up beside
          Leaderboard and Live Scoring; it belongs with the roster, which is
          what a reader is looking at when the question occurs to them. No tab
          carries Players, so without this the route would be reachable only
          by a device that is nobody yet. */}
      <Link
        href={`/trip/${tripCode}/players`}
        className="block text-center mt-5 t-cap uppercase tracking-[0.18em] text-accent-deep hover:text-accent transition-colors"
      >
        Claim a spot
      </Link>
    </div>
  )
}
