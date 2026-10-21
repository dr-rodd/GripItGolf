import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { liveRoundPresence, type OpenCard } from '@/lib/rowContext'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'
import { roundTone, ROUND_TILE, ROUND_NOTE, ROUND_NOTE_TONE } from '@/lib/roundState'
import { isEvent } from '@/lib/eventHub'
import { fetchTripKind } from '../kind'
import AddRound from './AddRound'
import { readRoundCards } from '@/lib/golfIrelandCards'
import { isKnockoutEvent } from '@/lib/bracketSetup'
import { linkedPlayerId } from '@/lib/currentPlayer'
import { readKnockout } from '../knockout'
import { KnockoutPortal } from '../KnockoutViews'
import { AddLeagueRound, RoundSettings, TbcRoundTile, type LeagueDoor } from '../LeagueRounds'
import { parseLeagueSetup, leagueRounds, nextRoundNumber, revealedLeagueRounds } from '@/lib/leagueSetup'
import { todayString } from '@/lib/tripStatus'
import { allowsParticipant } from '@/lib/eventPermissions'
import { describeShortDate } from '@/lib/itinerary'
import CourseName from '@/app/components/CourseName'
import { IconChevronRight } from '@/app/components/icons'

export const dynamic = 'force-dynamic'

export default async function TripCoursePortalPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  // The trip and its rounds in one request rather than two, one after the
  // other. Every trip page starts by looking a trip up by its code and then
  // wants something scoped by `trip.id`, and PostgREST will do that join —
  // the leaderboard already asks this way. On a bad connection the wait it
  // removes is a whole round trip, which is the expensive unit here.
  //
  // Three more things used to load alongside, for the Add round sheet: the
  // platform course catalogue, the whole itinerary and every player's
  // handicap. All three were on the critical path of a tab a group opens over
  // and over on a course, serialised into its HTML, for a sheet most visits
  // never open. They load inside `AddRound` on the tap now — see the note
  // there and in `usePlatformCourses`; it is the same rule three times.
  // The kind rides alongside rather than inside the select: a named `kind`
  // column would fail this whole query on an un-migrated database — the
  // note on fetchTripKind — and alongside it costs no round trip. The
  // league setup and the permissions ride alongside for the same reason
  // (migrations 047 and 049): a league's Add round door needs both, and
  // either failing costs that door and nothing else.
  const [kind, { data: trip, error: tripError }, setupRes, permsRes] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      // One string, not two joined: supabase-js reads the select as a literal
      // type to work out the row shape, and a `+` between two halves leaves it
      // with nothing to read — every field on `trip` then fails to typecheck.
      // `*` on the rounds so the casual flag rides along without being named:
      // a column migration 031 adds would fail the whole tab where it has
      // not run, and a league's tile and gear both read it.
      .select('id, name, start_date, end_date, track_stats, leaderboards, formats, team_scoring, rounds(*, courses(name, location))')
      .eq('trip_code', tripCode)
      .order('round_number', { referencedTable: 'rounds' })
      .single(),
    supabase
      .from('trips')
      .select('bracket_setup, settings_passcode_hash')
      .eq('trip_code', tripCode)
      .maybeSingle(),
    supabase
      .from('trips')
      .select('event_permissions')
      .eq('trip_code', tripCode)
      .maybeSingle(),
  ])
  const event = isEvent(kind)

  if (tripError) console.error('TripCoursePortal trip query failed:', tripError)
  if (!trip) notFound()

  const rounds = (trip.rounds ?? []) as unknown as {
    id: string; round_number: number; status: string
    scheduled_date: string | null; course_id: string | null; itinerary_item_id: string | null
    /** Migration 031 — absent before it, which reads as counting. */
    casual?: boolean | null
    courses: { name: string; location: string | null } | null
  }[]

  // A league with dates grows from here: its rounds are added as they are
  // played, and a round left TBC waits here for its venue
  // (docs/event-use-cases.md). A series made before series carried dates
  // has no first round to count from, and keeps the organiser's running
  // order as its only door.
  const setupRow = setupRes.data as { bracket_setup?: unknown; settings_passcode_hash?: string | null } | null
  const leagueSetup = event ? parseLeagueSetup(setupRow?.bracket_setup) : null
  const series = leagueSetup?.schedule === 'series' && !!trip.start_date
  // A match play event's Scoring tab is the bracket's portal: its rounds,
  // each opening its matches, this player's own on top (story 2).
  const knockout = event && isKnockoutEvent(setupRow?.bracket_setup)
  const permsRaw = (permsRes.data as { event_permissions?: unknown } | null)?.event_permissions


  // What has actually happened on each round, rather than what `rounds.status`
  // claims: the status column is set by hand and drifts, and the tile is the
  // one place someone checks before walking to the first tee.
  //
  // **Counted, never fetched.** This asked for `scores.round_id` and
  // `live_scores.round_id` across every round of the trip and built a Set of
  // at most half a dozen ids out of the answer — a week's golf for sixteen
  // players is some seventeen hundred rows, scanned, serialised and parsed on
  // the critical path of the Scoring tab, to answer one yes-or-no per tile.
  // `head: true` returns the count in a header and no body at all, so the
  // reply is bytes. One request per round rather than one for the lot, but
  // they go together over the one connection and each is a rounding error;
  // on a bad radio, small and many beats large and few every time.
  const roundIds = (rounds ?? []).map(r => r.id)

  // The locks ride along because they are half the question: a vacant card —
  // open, nobody on it — does not make a round "In play", or one stray tap
  // on "start a scorecard" keeps a finished round green until the nightly
  // job closes it. The rule is liveRoundPresence's, in lib/rowContext.ts.
  //
  // A league's golf items go out in the same breath — five narrow columns,
  // and only for a league, which draws a round still TBC from its item
  // because no round exists for it yet. Every other trip's itinerary stays
  // where the AddRound sheet fetches it, on the tap.
  //
  // So do its Golf Ireland cards, each placed on the round it was played
  // as — nothing asked unless the league reads them (lib/golfIrelandCards.ts).
  const [{ data: openData, error: openErr }, itemsRes, roundCards, knockoutView] = await Promise.all([
    roundIds.length > 0
      ? supabase.from('live_rounds').select('round_id, live_player_locks(player_id)')
          .eq('status', 'active').in('round_id', roundIds)
      : Promise.resolve({ data: [], error: null }),
    series
      ? supabase.from('itinerary_items').select('id, day_index, position, kind, course_id')
          .eq('trip_id', trip.id)
      : Promise.resolve({ data: [], error: null }),
    series ? readRoundCards(trip.id, leagueSetup, rounds) : Promise.resolve([]),
    // The draw from this phone's side — who it is, the names, the matches.
    knockout
      ? Promise.all([
          supabase.from('players').select('id, name').eq('trip_id', trip.id).eq('is_composite', false),
          linkedPlayerId(tripCode),
        ]).then(([playersRes, meId]) => {
          const roster = (playersRes.data ?? []) as { id: string; name: string }[]
          const me = roster.some(p => p.id === meId) ? meId : null
          return readKnockout(trip, setupRow?.bracket_setup, me, roster)
        }).catch(e => { console.error('TripCoursePortal knockout read failed:', e); return null })
      : Promise.resolve(null),
  ])
  if (openErr) console.error('TripCoursePortal live rounds query failed:', openErr)
  if (itemsRes.error) console.error('TripCoursePortal league items query failed:', itemsRes.error)
  const items = (itemsRes.data ?? []) as {
    id: string; day_index: number; position: number; kind: string; course_id: string | null
  }[]

  // Every round in date order, TBC ones included, each with its number —
  // lib/leagueSetup.ts is the one copy of how a TBC round is numbered.
  const league = series ? leagueRounds(
    items.map(i => ({ id: i.id, dayIndex: i.day_index, kind: i.kind, courseId: i.course_id })),
    rounds.map(r => ({
      id: r.id, roundNumber: r.round_number, itineraryItemId: r.itinerary_item_id,
      courseId: r.course_id, scheduledDate: r.scheduled_date,
    })),
    trip.start_date ?? null,
  ) : []
  const lastVenueId = [...league].reverse().find(r => r.courseId)?.courseId ?? null
  // What the field sees: the league's history newest first, with the next
  // round on top — and only once the round before it has been played
  // (`revealedLeagueRounds`). Adding a round still reads the whole plan.
  const revealed = revealedLeagueRounds(league, todayString(new Date()))
  const door: LeagueDoor | null = series && trip.start_date ? {
    tripId: trip.id,
    tripCode,
    startDate: trip.start_date,
    passcodeHash: setupRow?.settings_passcode_hash ?? null,
    fieldMayAddCourses: allowsParticipant(kind, permsRaw, 'add_courses'),
  } : null
  const positionsByDay: Record<number, number> = {}
  for (const i of items) positionsByDay[i.day_index] = (positionsByDay[i.day_index] ?? 0) + 1

  // Real rounds by id, so the league's list can draw each one's own tile.
  const roundById = new Map(rounds.map(r => [r.id, r]))

  const openRounds = new Set(
    liveRoundPresence((openData ?? []) as unknown as OpenCard[]).activeRoundIds,
  )

  const anyRows = async (table: 'scores' | 'live_scores', roundId: string) => {
    const { count, error } = await supabase
      .from(table)
      .select('round_id', { count: 'exact', head: true })
      .eq('round_id', roundId)
      .limit(1)
    if (error) console.error(`TripCoursePortal ${table} count failed:`, error)
    return (count ?? 0) > 0
  }

  // A round counts as played once anything has been committed to it, or once
  // there are uncommitted scores against a card that is **still open**.
  //
  // That second clause used to be "uncommitted scores, full stop", which is
  // the phantom: `live_scores` has no foreign key to `live_rounds`, so a card
  // half-entered and abandoned leaves its holes behind for good and the tile
  // read "Scores in" on a round nobody finished. The same rule the board
  // applies — see the note on `buildRowContext` in lib/rowContext.ts.
  //
  // Which is also why `live_scores` is only asked about for a round that is
  // open: on every other round the answer could not change the tile, so the
  // request would be one nobody could read the result of.
  const played = await Promise.all(
    roundIds.map(async id => {
      const [committed, live] = await Promise.all([
        anyRows('scores', id),
        openRounds.has(id) ? anyRows('live_scores', id) : Promise.resolve(false),
      ])
      return { id, scored: committed || live }
    }),
  )
  // A Golf Ireland card in a round is a score in it, as much as a live one.
  const scoredRounds = new Set([
    ...played.filter(r => r.scored).map(r => r.id),
    ...roundCards.map(c => c.roundId),
  ])

  return (
    <div className="min-h-dvh paper has-tabbar page-enter text-ink">

      <TripHeader backTo={`/trip/${tripCode}`} title="scoring" />

      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <p className="t-label text-ink/65">
            Choose a round
          </p>
          {/* The door for the impromptu game — the same golf form the
              itinerary uses, in a sheet, without a trip through Trip Setup.
              A trip's door: on an event the field plays the rounds the
              organiser set, and anything modifiable lives behind the PIN —
              the organiser adds golf through the setup screen's running
              order. */}
          {!event && (
            <AddRound
              tripId={trip.id}
              startDate={trip.start_date ?? null}
              endDate={trip.end_date ?? null}
              trackStats={trip.track_stats === true}
            />
          )}
          {/* A league's own door — the next round, on the day it is played.
              The organiser's with the PIN, the field's when they allow it. */}
          {door && (
            <AddLeagueRound
              door={door}
              endDate={trip.end_date ?? null}
              roundDates={league.flatMap(r => (r.date ? [r.date] : []))}
              number={nextRoundNumber(league)}
              positionsByDay={positionsByDay}
              lastVenueId={lastVenueId}
              fieldMayAdd={allowsParticipant(kind, permsRaw, 'add_rounds')}
            />
          )}
        </div>

        {knockoutView && (
          <div className="mb-8">
            <KnockoutPortal tripCode={tripCode} view={knockoutView} today={todayString(new Date())} />
          </div>
        )}

        {!knockoutView && (series ? league.length === 0 : (rounds ?? []).length === 0) && (
          <p className="text-ink/65 text-sm py-8 text-center">
            {series
              ? 'No rounds yet — add the first one above.'
              : `No rounds set up for this ${event ? 'event' : 'trip'} yet.`}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {/* A league lists its rounds as its history — newest first, the
              next one on top, a TBC one in its place and paler; anything
              else lists its rounds as it always has. */}
          {(series
            ? revealed.shown.map(lr => lr.roundId ? roundById.get(lr.roundId)! : lr)
            : (rounds ?? [])
          ).map(entry => {
            if (!('round_number' in entry)) {
              return door && entry.date ? (
                <TbcRoundTile
                  key={entry.itemId}
                  door={door}
                  itemId={entry.itemId}
                  date={entry.date}
                  number={entry.number}
                  lastVenueId={lastVenueId}
                  fieldMaySetVenue={allowsParticipant(kind, permsRaw, 'set_venues')}
                />
              ) : null
            }
            const round = entry
            const course = round.courses as unknown as { name: string; location: string | null } | null
            const tone = roundTone(scoredRounds.has(round.id), openRounds.has(round.id))
            // A league round switched off still plays and keeps its scores;
            // the tile says it is off the overall.
            const offLeague = series && round.casual === true
            const tile = (
              <Link
                key={round.id}
                href={`/trip/${tripCode}/scoring/${round.round_number}`}
                className={`flex items-center justify-between ${series ? 'flex-1 min-w-0' : 'w-full'} px-5 py-4 rounded-card press ${ROUND_TILE[tone]}`}
              >
                <div className="min-w-0">
                  <p className="t-label text-ink/65 mb-1">
                    {series && round.scheduled_date
                      ? `Round ${round.round_number} · ${describeShortDate(round.scheduled_date)}`
                      : `Round ${round.round_number}`}
                  </p>
                  <p className="t-card text-ink truncate">
                    <CourseName name={course?.name ?? `Round ${round.round_number}`} />
                  </p>
                  <p className={`t-cap mt-1 truncate ${ROUND_NOTE_TONE[tone]}`}>
                    {course?.location ? `${course.location} · ` : ''}{ROUND_NOTE[tone]}
                    {offLeague ? ' · Doesn’t count' : ''}
                  </p>
                </div>
                {/* The whole tile is the link, so "Open →" was a label for
                    something already obvious — and it was taking the width a
                    long course name needs. The live dot stays: it says
                    something the tile does not. */}
                {tone === 'live' && (
                  <span
                    className="flex-shrink-0 ml-4 w-1.5 h-1.5 rounded-full bg-accent dot-live"
                    aria-hidden="true"
                  />
                )}
                {tone === 'played' && (
                  <span className="flex-shrink-0 ml-4 text-ink/50" aria-hidden="true">
                    <IconChevronRight size={20} />
                  </span>
                )}
              </Link>
            )
            // A league round carries its own gear beside it — outside the
            // link, because a button inside an anchor is two taps in one.
            return series && door ? (
              <div key={round.id} className="flex items-center gap-2">
                {tile}
                <RoundSettings
                  door={door}
                  roundId={round.id}
                  number={round.round_number}
                  casual={round.casual === true}
                  golfIrelandCards={roundCards.filter(c => c.roundId === round.id)}
                />
              </div>
            ) : tile
          })}
        </div>
        {series && revealed.hidden > 0 && (
          <p className="t-cap text-ink/65 text-center mt-4">
            {revealed.hidden === 1 ? 'One more round' : `${revealed.hidden} more rounds`} to
            come — the next appears the day after this one is played.
          </p>
        )}
      </div>
      <SupportLink className="px-4 pb-12" />
    </div>
  )
}
