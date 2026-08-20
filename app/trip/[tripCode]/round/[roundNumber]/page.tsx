import { Fragment, Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { primary } from '@/lib/leaderboards'
import { boardsForTrip, isLegacy } from '@/lib/leaderboardsCompat'
import { parseLeaderboards } from '@/lib/leaderboards'
import { parseTeamScoring } from '@/lib/teamScoring'
import { currentPlayer } from '@/lib/currentPlayer'
import { fetchRoundRows } from '@/lib/hubStanding'
import { podium, type PodiumPlace } from '@/lib/standing'
import { courseCard, hasCard } from '@/lib/courseCard'
import { mapsUrl } from '@/lib/places'
import { describeGroups } from '@/lib/upNext'
import { describeDay, describeTime } from '@/lib/itinerary'
import { ordinal } from '@/lib/playerSummary'
import type { RowHole, BoardRow } from '@/lib/boardRows'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import SupportLink from '@/app/components/SupportLink'
import { IconMapPin, IconClipboardList, IconTrophy } from '@/app/components/icons'
import RoundCard from './RoundCard'
import CasualToggle from './CasualToggle'
import CourseWeather from '@/app/components/CourseWeather'
import { isEvent } from '@/lib/eventHub'
import { fetchTripKind } from '../../kind'

export const dynamic = 'force-dynamic'

type TeeRow = {
  name: string
  gender: string
  par: number
  course_rating: number
  slope: number
}

export default async function RoundSummaryPage({
  params,
}: {
  params: Promise<{ tripCode: string; roundNumber: string }>
}) {
  const { tripCode, roundNumber } = await params
  const roundNum = parseInt(roundNumber, 10)
  if (!Number.isFinite(roundNum)) notFound()

  // The kind alongside, not inside: a named `kind` would fail this select
  // on an un-migrated database — the note on fetchTripKind.
  const [kind, { data: trip, error: tripError }] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      .select('id, name, start_date, formats, leaderboards, team_scoring, track_stats')
      .eq('trip_code', tripCode)
      .single(),
  ])
  const event = isEvent(kind)

  if (tripError) console.error('RoundSummary trip query failed:', tripError)
  if (!trip) notFound()

  // `*` rather than a column list: the casual flags arrive with migration
  // 031, which is run by hand, and naming them would break this page on a
  // database that has not run it yet. Undefined reads as counting.
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('*')
    .eq('trip_id', trip.id)
    .eq('round_number', roundNum)
    .single()

  if (roundError) console.error('RoundSummary round query failed:', roundError)
  if (!round) notFound()

  // ── The podium: started here, waited for at the bottom of the page ──
  //
  // Which board this round is scored on is a property of the trip, and the
  // trip is already in hand — so it can be settled above the batch, and the
  // question can go out with it.
  const boards = boardsForTrip(trip)
  const lead = primary(boards)

  // **Started, deliberately not awaited.** `fetchRoundRows` needs `trip.id`
  // and `round.id` and nothing else, both known by now — but it is not one
  // query: it goes through `fetchTripContext`, which is a rounds lookup and
  // then a Promise.all of nine, and it re-fetches the players, holes and tees
  // the batch below is already asking for. It used to be awaited on its own,
  // after all of that, which put two more serial round trips in front of a
  // page that had otherwise finished.
  //
  // Calling it here sends it with the batch; awaiting it under a `<Suspense>`
  // instead of inline means the rest of the page — the card, the tees, the
  // weather, the way into scoring — is sent as soon as those five come back,
  // rather than waiting on ten queries feeding a section at the bottom.
  //
  // `.catch` because a promise nobody is awaiting yet is an unhandled
  // rejection if it throws before the boundary gets to it. The shape it
  // resolves to is the shape the helper already returns on failure, so the
  // section renders its error line exactly as it would have.
  const podiumPromise = fetchRoundRows(
    trip.id,
    round.id,
    lead,
    isLegacy(parseLeaderboards(trip.leaderboards))
      ? parseTeamScoring(trip.team_scoring)
      : null,
  ).catch((e: unknown) => {
    console.error('RoundSummary podium query failed:', e)
    return { rows: [], error: 'Could not work out the result.' }
  })

  // Everything the page reads about the course, the day and the field. The
  // itinerary item is where the tee time lives — the date is on the round,
  // and `itinerary_item_id` is the only thing tying the two together.
  const [courseRes, holesRes, teesRes, itemRes, playersRes] = await Promise.all([
    supabase.from('courses').select('name, location, latitude, longitude').eq('id', round.course_id).single(),
    supabase
      .from('holes')
      .select('id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies')
      .eq('course_id', round.course_id)
      .order('hole_number'),
    supabase
      .from('tees')
      .select('name, gender, par, course_rating, slope')
      .eq('course_id', round.course_id)
      // Hardest first, by slope — the same order `teesForPlayer` hands the
      // picker, so the table a player reads after the round lists the tees in
      // the order they were offered before it. It was by course rating, which
      // usually agrees and is not the same thing; an unrated tee sorts last
      // rather than to the top, which is where a bare DESC would put a null.
      .order('slope', { ascending: false, nullsFirst: false })
      .order('name'),
    round.itinerary_item_id
      ? supabase
          .from('itinerary_items')
          .select('day_index, tee_time, tee_count')
          .eq('id', round.itinerary_item_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('players')
      .select('id, name, gender')
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .order('name'),
  ])

  const problems: string[] = []
  if (courseRes.error) { console.error('RoundSummary course query failed:', courseRes.error); problems.push('the course') }
  if (holesRes.error)  { console.error('RoundSummary holes query failed:', holesRes.error);   problems.push('the scorecard') }
  if (teesRes.error)   { console.error('RoundSummary tees query failed:', teesRes.error);     problems.push('the tee ratings') }
  if (itemRes.error)   { console.error('RoundSummary itinerary query failed:', itemRes.error); problems.push('the tee time') }
  if (playersRes.error){ console.error('RoundSummary players query failed:', playersRes.error); problems.push('the players') }

  const course  = courseRes.data
  const holes   = (holesRes.data ?? []) as unknown as RowHole[]
  const tees    = (teesRes.data ?? []) as unknown as TeeRow[]
  const item    = itemRes.data as { day_index: number; tee_time: string | null; tee_count: number | null } | null
  const players = playersRes.data ?? []

  // Whose card to print. A visitor this device does not recognise gets the
  // men's, which is what the course prints by default.
  const me = await currentPlayer(tripCode, players)
  const card = hasCard(holes) ? courseCard(holes, me?.gender ?? 'M') : null


  // The first tee as an instant, for the forecast. Local clock time on the
  // round's date — the same construction `momentOf` in lib/upNext.ts uses, so
  // a tee time never means two different moments in one app. Null when the
  // round has no time recorded, which leaves the block showing "right now".
  const teeAtIso = round.scheduled_date && item?.tee_time
    ? new Date(`${round.scheduled_date}T${item.tee_time}`).toISOString()
    : null

  const day = describeDay(round.scheduled_date, item?.day_index ?? 0)
  const groups = describeGroups(item?.tee_count ?? null, describeTime(item?.tee_time))
  const directions = mapsUrl([course?.name, course?.location].filter(Boolean).join(', '))

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      {/* The way back, top left, where a phone puts one.
          This page is opened from the itinerary to read one thing — a tee
          time, the card, who won — and then left again. The mark in the
          header goes to the hub and the tab bar is always there, but neither
          reads as "back", and a page reached by tapping a round should be
          leavable without hunting for how. */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <BackButton href={`/trip/${tripCode}`} label="Trip" />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-6 flex flex-col gap-8">

        {problems.length > 0 && (
          <p className="text-rust-deep text-sm leading-snug text-center">
            Could not load {problems.join(', ')}. Refresh the page.
          </p>
        )}

        {/* ── The course, the day ── */}
        <header className="text-center">
          <p className="t-cap uppercase tracking-[0.18em] text-ink/50">
            Round {round.round_number}{round.casual === true ? ' · casual' : ''}
          </p>
          <h1 className="t-h1 text-ink text-balance mt-1.5" style={{ fontSize: 'clamp(24px, 7vw, 30px)' }}>
            {course?.name ?? 'Course'}
          </h1>
          {course?.location && (
            <p className="t-cap text-ink/65 mt-1.5">{course.location}</p>
          )}

          {/* The same phrasing Up next uses on the hub, from the same
              functions — a tee time should not read two ways in one app. */}
          <p className="t-cap text-ink/80 mt-3">
            {[day, groups].filter(Boolean).join(' · ')}
          </p>

          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl border border-bark/12 bg-surface text-ink/80 hover:text-accent-deep hover:border-bark/25 transition-colors duration-150"
            >
              <IconMapPin size={15} />
              <span className="t-cap uppercase tracking-[0.15em]">Directions</span>
            </a>
          )}
        </header>

        {/* ── Weather ──
            The two slots this section was shipped empty for. The tee time is
            the round's own — the same one printed above it, from the same
            itinerary item, so the block and the heading cannot disagree about
            when the group goes out. */}
        <section>
          <h2 className="t-h2 text-ink mb-3">Weather</h2>
          <CourseWeather
            courseId={round.course_id}
            teeAt={teeAtIso}
            variant="block"
            lat={course?.latitude == null ? null : Number(course.latitude)}
            lon={course?.longitude == null ? null : Number(course.longitude)}
          />
        </section>

        {/* ── The card ── */}
        {card && (
          <section>
            <h2 className="t-h2 text-ink mb-3">Scorecard</h2>
            <RoundCard card={card} />
          </section>
        )}

        {/* ── Tee ratings ──
            Absent, not empty, where the course has none. Three of the
            platform's courses carry no tee rows at all, and a heading over
            nothing is a promise the data cannot keep. */}
        {tees.length > 0 && (
          <section>
            <h2 className="t-h2 text-ink mb-3">Tees</h2>
            {/* One grid for the whole table, not one per row.
                Each row was its own grid before, so every column sized itself
                against that row's own contents — which meant the headings and
                the figures under them lined up with nothing. One grid, and
                the columns are columns.

                The three numeric columns size to their own content rather
                than to a figure picked by hand. They were 3rem / 3.5rem /
                3.5rem, and "Slope" does not fit 3.5rem once the cell's own
                padding is taken off it — the heading overflowed its column
                and drifted past the right-hand edge of the card. A hand-set
                width is a guess about how wide a word renders, and it is
                wrong the moment the word, the size or the face changes.
                `auto` is the same decision made by something that can
                measure. The name column stays `minmax(0,1fr)` so it takes
                what is left and truncates. */}
            <div className="rounded-xl border border-bark/12 bg-surface overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto]">

                <Cell head>Tee</Cell>
                <Cell head right>Par</Cell>
                <Cell head right>CR</Cell>
                <Cell head right>Slope</Cell>

                {tees.map((t, i) => {
                  const rule = i < tees.length - 1
                  return (
                    <Fragment key={`${t.name}-${t.gender}`}>
                      <Cell rule={rule}>
                        <span className="text-ink truncate block">
                          {t.name}
                          <span className="text-ink/50"> · {t.gender === 'F' ? 'Ladies' : 'Men'}</span>
                        </span>
                      </Cell>
                      <Cell right rule={rule}>{t.par}</Cell>
                      <Cell right rule={rule}>{t.course_rating}</Cell>
                      <Cell right rule={rule}>{t.slope}</Cell>
                    </Fragment>
                  )
                })}

              </div>
            </div>
          </section>
        )}

        {/* ── The podium ──
            Behind a boundary, with nothing for a fallback. Everything above
            this line is sent as soon as the page's own five queries come
            back; the result slots in when its ten do.

            **No skeleton, and that is the same rule `loading.tsx` follows.**
            A round nobody has played has no section here at all — no
            heading, no placeholder — so a skeleton would draw a Result
            block, hold it, and then take it away again on exactly the
            rounds that have no result. Promising a shape and being wrong
            about it is worse than promising nothing. */}
        <Suspense fallback={null}>
          <RoundPodium promise={podiumPromise} tripCode={tripCode} />
        </Suspense>

        {/* ── Whether it counts ──
            On the round's own page because this is where the decision gets
            made after the fact — a subgroup's extra game that should not
            move the trip standings. The same question the golf sheet asks
            when a round is added. A trip's question: on an event the rounds
            are the competition, and anything modifiable lives behind the
            organiser PIN. */}
        {!event && (
          <CasualToggle
            roundId={round.id}
            casual={round.casual === true}
            casualStats={round.casual_stats === true}
            trackStats={trip.track_stats === true}
          />
        )}

        {/* ── Into the card ── */}
        <Link
          href={`/trip/${tripCode}/scoring/${round.round_number}`}
          className="w-full py-[18px] border-2 border-accent text-accent rounded-xl text-sm tracking-[0.25em] uppercase text-center hover:bg-accent/10 transition-colors flex items-center justify-center gap-2.5"
        >
          <IconClipboardList size={16} />
          Live Scoring
        </Link>
      </div>

      <SupportLink className="px-6 pb-8" />
    </main>
  )
}

/**
 * One cell of the tee table.
 *
 * Every cell is a direct child of the one grid, which is what makes a column
 * a column — the heading and the figures beneath it share a track rather than
 * each row negotiating its own widths.
 */
function Cell({
  children, head = false, right = false, rule = true,
}: {
  children: React.ReactNode
  head?: boolean
  right?: boolean
  /** The rule under a row. Off on the last one, and under the headings. */
  rule?: boolean
}) {
  return (
    <span
      className={`px-3 py-2.5 text-sm tabular-nums min-w-0 ${
        right ? 'text-right' : ''
      } ${rule ? 'border-b border-bark/[0.08]' : ''} ${
        // Never wrapped. A heading that breaks in two is the other way a
        // column too narrow for its own label goes wrong, and an auto-sized
        // column only reads the label's width correctly if it is one line.
        head ? 't-cap uppercase tracking-wider text-ink/50 whitespace-nowrap' : 'text-ink/80'
      }`}
    >
      {children}
    </span>
  )
}

/**
 * A slot waiting for a forecast.
 *
 * Deliberately obvious about being empty. The alternative — a dash, or a
 * plausible-looking blank — invites somebody to read it as "no wind" rather
 * than "nobody asked".
 */
/**
 * The result, once the cards have been read.
 *
 * Its own component only so it can sit behind a `<Suspense>` — the page
 * starts the fetch and this awaits it, so ten queries feeding the bottom of
 * the screen stop holding up the top of it. Everything it decides was
 * decided inline before and is unchanged: the podium comes from `podium`,
 * the ordering from the one comparator there is, and no round anybody has
 * played gets a section.
 */
async function RoundPodium({
  promise, tripCode,
}: {
  promise: Promise<{ rows: BoardRow[]; error: string | null }>
  tripCode: string
}) {
  const { rows, error } = await promise
  const top = podium(rows, 3)
  // Nobody has played it. Not an empty state — the section simply is not there.
  const played = rows.length > 0

  if (error) {
    return <p className="text-rust-deep text-sm text-center leading-snug">{error}</p>
  }
  if (!played) return null

  return (
    <section>
      <h2 className="t-h2 text-ink mb-3">Result</h2>
      <div className="flex flex-col gap-2">
        {top.map(place => <PodiumRow key={place.id} place={place} />)}
      </div>
      <Link
        href={`/trip/${tripCode}/leaderboard`}
        className="mt-3 inline-flex items-center gap-1.5 t-cap uppercase tracking-[0.15em] text-ink/65 hover:text-accent-deep transition-colors duration-150"
      >
        <IconTrophy size={14} />
        Full leaderboard
      </Link>
    </section>
  )
}

/** One place on the podium. Name, score, and where that puts them. */
function PodiumRow({ place }: { place: PodiumPlace }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-bark/12 bg-surface">
      <span className="w-8 flex-shrink-0 t-cap text-ink/50 tabular-nums">
        {ordinal(place.position)}
      </span>
      <span className="flex-1 min-w-0 text-ink text-sm truncate">{place.name}</span>
      <span className="font-[family-name:var(--font-display)] text-accent-deep text-base leading-none tabular-nums flex-shrink-0">
        {place.total}
      </span>
    </div>
  )
}
