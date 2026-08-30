import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseFormats } from '@/lib/formats'
import { parseLeaderboards, boardTitle, boardRules } from '@/lib/leaderboards'
import { tripBoards, isLegacy } from '@/lib/leaderboardsCompat'
import { parseTeamScoring } from '@/lib/teamScoring'
import { fetchMemberships } from '@/lib/teamMembers'
import { buildRowContext } from '@/lib/rowContext'
import { buildRows } from '@/lib/boardRows'
import {
  dayCount, dateForDay, describeDay, describeItem, itemsForDay,
} from '@/lib/itinerary'
import { fromItemRow, type ItemRow } from '@/lib/itinerarySync'
import TripHeader from '@/app/components/TripHeader'
import TripExportClient, {
  type ExportBoard, type ExportDay, type ExportPlayer,
  type ExportRound, type ExportTeam,
} from './TripExportClient'

export const dynamic = 'force-dynamic'

/**
 * The trip on paper — everything committed, nothing live.
 *
 * This page exists for the trip that is over: save it as a PDF, keep the
 * record, and the database row stops being the only copy of a real trip. It
 * reads exactly what the leaderboard reads and builds the same rows through
 * `buildRowContext` + `buildRows` — no second scoring path — with one
 * deliberate difference: `activeRoundIds` is passed empty, so in-progress
 * scores are left out. A document is a record of signed cards, and a card
 * still open on a course has no place on one.
 *
 * What goes in is the reader's choice, made in the client component: the
 * sections are all assembled here and shown or hidden there, because a
 * checkbox should not cost a round trip.
 */
export default async function TripExportPage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip } = await supabase
    .from('trips')
    .select('*, rounds(*, courses(id, name))')
    .eq('trip_code', tripCode)
    .order('round_number', { referencedTable: 'rounds' })
    .single()
  if (!trip) notFound()

  type TripRound = {
    id: string
    round_number: number
    scheduled_date?: string | null
    casual?: boolean
    itinerary_item_id?: string | null
    courses: { id: string; name: string } | null
  }
  const rounds = (trip.rounds ?? []) as TripRound[]

  const roundIds = rounds.map(r => r.id)
  const courseIds = rounds.map(r => r.courses?.id).filter(Boolean)
  const nilId = '00000000-0000-0000-0000-000000000000'

  const [teamsRes, playersRes, holesRes, scoresRes, hcpsRes, teesRes, itineraryRes,
         memberships] =
    await Promise.all([
      supabase.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id).order('created_at'),
      supabase.from('players')
        .select('id, name, handicap, gender, is_composite')
        .eq('trip_id', trip.id).eq('is_composite', false).order('name'),
      supabase.from('holes')
        .select('id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId])
        .order('hole_number'),
      supabase.from('scores')
        .select('player_id, hole_id, gross_score, stableford_points, no_return, round_id')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      supabase.from('round_handicaps')
        .select('round_id, player_id, playing_handicap, tee_id')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      supabase.from('tees')
        .select('id, slope, course_rating, par')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId]),
      supabase.from('itinerary_items')
        .select('id, day_index, position, kind, course_id, tee_time, tee_count, ' +
                'stay_name, travel_mode, from_place, to_place, duration_mins, ' +
                'activity_name, activity_time')
        .eq('trip_id', trip.id)
        .order('day_index')
        .order('position'),
      fetchMemberships(trip.id),
    ])

  const stored = parseLeaderboards(trip.leaderboards)
  const teamScoring = parseTeamScoring(trip.team_scoring)
  const boards = tripBoards(stored, parseFormats(trip.formats), teamScoring)

  // Signed cards only — no open sessions, no live rows. See the note above.
  const ctx = buildRowContext({
    players: playersRes.data ?? [],
    teams: teamsRes.data ?? [],
    memberships,
    holes: holesRes.data ?? [],
    rounds,
    courseByRound: new Map(
      rounds.flatMap(r => (r.courses ? [[r.id, r.courses.id] as const] : []))
    ),
    scores: scoresRes.data ?? [],
    liveScores: [],
    roundHandicaps: hcpsRes.data ?? [],
    tees: teesRes.data ?? [],
    activeRoundIds: [],
    livePlayerIds: [],
    legacyTeamScoring: isLegacy(stored) ? teamScoring : null,
  })

  const exportBoards: ExportBoard[] = boards
    .filter(b => b.competition === 'league')
    .map(b => ({
      id: b.id,
      title: boardTitle(b),
      rules: boardRules(b),
      audience: b.audience,
      // Lower is the better round on a strokes board and nowhere else — the
      // round-by-round tables order each round's column by this.
      higherIsBetter: b.scoring !== 'strokes',
      rows: buildRows(b, ctx).map(row => ({
        place: row.place,
        name: row.name,
        subLabel: row.subLabel,
        total: row.total,
        totalAll: row.totalAll,
        perRound: row.perRound,
        playedRounds: row.playedRounds,
        droppedRounds: row.droppedRounds ?? [],
      })),
    }))

  const exportRounds: ExportRound[] = rounds.map(r => ({
    id: r.id,
    number: r.round_number,
    courseName: r.courses?.name ?? null,
    date: r.scheduled_date ?? null,
    casual: r.casual === true,
  }))

  const exportPlayers: ExportPlayer[] = (playersRes.data ?? []).map(p => ({
    name: p.name,
    handicap: p.handicap,
  }))

  // A team with nobody on it is a row on a form, not part of the record.
  const exportTeams: ExportTeam[] = (teamsRes.data ?? []).map(t => ({
    name: t.name,
    members: memberships
      .filter(m => m.team_id === t.id)
      .map(m => (playersRes.data ?? []).find(p => p.id === m.player_id)?.name)
      .filter((n): n is string => Boolean(n)),
  })).filter(t => t.members.length > 0)

  // The running order, told the way the hub tells it — through the one
  // description helper — with each golf line named by its course.
  const courseNameById = new Map(
    rounds.flatMap(r => (r.courses ? [[r.courses.id, r.courses.name] as const] : []))
  )
  const casualByItem = new Map(
    rounds.flatMap(r => (r.itinerary_item_id ? [[r.itinerary_item_id, r.casual === true] as const] : []))
  )
  const items = ((itineraryRes.data ?? []) as unknown as (Omit<ItemRow, 'trip_id'> & { id: string })[])
    .map(fromItemRow)
    .map(i => ({ ...i, casual: casualByItem.get(i.id) ?? false }))
  const days = dayCount(trip.start_date ?? null, trip.end_date ?? null)
  const exportDays: ExportDay[] = Array.from({ length: days }, (_, i) => ({
    label: describeDay(dateForDay(trip.start_date ?? null, i), i),
    lines: itemsForDay(items, i).map(item => {
      const said = describeItem(item, item.courseId ? courseNameById.get(item.courseId) : null)
      return { title: said.title, detail: said.detail }
    }),
  })).filter(d => d.lines.length > 0)

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      {/* The mark, not a page title — the title artworks are hand-drawn and
          this page's name is on the document itself, one line down. */}
      <div className="print:hidden">
        <TripHeader backTo={`/trip/${tripCode}`} />
      </div>

      <TripExportClient
        tripName={trip.name}
        tripCode={tripCode}
        startDate={trip.start_date ?? null}
        endDate={trip.end_date ?? null}
        days={exportDays}
        players={exportPlayers}
        teams={exportTeams}
        boards={exportBoards}
        rounds={exportRounds}
      />
    </div>
  )
}
