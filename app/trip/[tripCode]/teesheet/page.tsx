import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { fetchTripKind } from '../kind'
import { parseLeaderboards } from '@/lib/leaderboards'
import { allowsParticipant } from '@/lib/eventPermissions'
import { parseInterval, parseGroupSize } from '@/lib/teeSheet'
import BackButton from '@/app/components/BackButton'
import TeeSheetClient from './TeeSheetClient'

export const dynamic = 'force-dynamic'

/**
 * The tee sheet — who goes off when, one screen per event.
 *
 * Events only, like the organiser area: a trip's field sorts its own
 * fourballs on the first tee and has no tab pointing here. Everything the
 * sheet needs comes down in one batch; the two tee-sheet columns and the
 * assignments table ride in their own fail-soft queries (migration 050),
 * so an un-migrated database shows a read-only sheet at its defaults
 * rather than no page.
 *
 * Who may edit is decided on the client, deliberately: the field's right
 * comes from the `edit_tee_sheet` permission (read here), the organiser's
 * from the PIN unlock this device already holds — which lives in
 * sessionStorage and only the browser can see.
 */
export default async function TeeSheetPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const [kind, { data: trip, error }] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      .select('id, trip_code, name, leaderboards, settings_passcode_hash')
      .eq('trip_code', tripCode)
      .single(),
  ])
  if (error) console.error('TeeSheetPage trip query failed:', error)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">Event not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  if (!isEvent(kind)) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center bg-cream px-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
          This is a trip
        </p>
        <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">
          Tee sheets belong to events — a trip&apos;s groups sort themselves
          on the first tee.
        </p>
        <BackButton href={`/trip/${tripCode}`} label="Trip" />
      </main>
    )
  }

  // The one team board an event runs, if any — its sheet is whose teams
  // the slots group by, and its tee-teams answer is how partners meet the
  // sheet (adding-as-one lands with that answer's machinery).
  const boards = parseLeaderboards(trip.leaderboards)
  const teamBoard = boards.find(b => b.audience === 'team') ?? null
  const teamSet = teamBoard?.teamSet ?? 'main'

  const [
    roundsResult, itemsResult, playersResult, settingsResult,
    assignmentsResult, permsResult, teamsResult, membersResult,
  ] = await Promise.all([
    supabase
      .from('rounds')
      .select('id, round_number, itinerary_item_id, courses(name)')
      .eq('trip_id', trip.id)
      .order('round_number'),
    supabase
      .from('itinerary_items')
      .select('id, tee_time')
      .eq('trip_id', trip.id)
      .eq('kind', 'golf'),
    supabase
      .from('players')
      .select('id, name')
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .order('name'),
    // The two settings columns, fail-soft — pre-050 this errors and every
    // round reads at its defaults (10 minutes, fours).
    supabase
      .from('rounds')
      .select('id, tee_interval_mins, tee_group_size')
      .eq('trip_id', trip.id),
    // The assignments, fail-soft the same way — pre-050 the sheet is empty
    // and the first write says calmly what is missing.
    supabase
      .from('tee_assignments')
      .select('round_id, player_id, slot_index, created_at')
      .eq('trip_id', trip.id)
      .order('created_at'),
    supabase
      .from('trips')
      .select('event_permissions')
      .eq('id', trip.id)
      .single(),
    teamBoard
      ? supabase.from('teams').select('id, name, team_set').eq('trip_id', trip.id)
      : Promise.resolve({ data: null, error: null }),
    teamBoard
      ? supabase.from('team_members').select('team_id, team_set, player_id').eq('trip_id', trip.id)
      : Promise.resolve({ data: null, error: null }),
  ])

  if (roundsResult.error) console.error('TeeSheetPage rounds query failed:', roundsResult.error)
  if (playersResult.error) console.error('TeeSheetPage players query failed:', playersResult.error)
  if (assignmentsResult.error) {
    console.error('TeeSheetPage assignments query failed:', assignmentsResult.error)
  }

  const teeTimes = new Map(
    (itemsResult.data ?? []).map(i => [i.id as string, i.tee_time as string | null]),
  )
  const settings = new Map(
    ((settingsResult.data ?? []) as {
      id: string; tee_interval_mins?: unknown; tee_group_size?: unknown
    }[]).map(r => [r.id, r]),
  )

  type RoundRow = {
    id: string; round_number: number; itinerary_item_id: string | null
    courses: { name: string } | { name: string }[] | null
  }
  const rounds = ((roundsResult.data ?? []) as unknown as RoundRow[]).map(r => {
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
    const s = settings.get(r.id)
    return {
      id: r.id,
      roundNumber: r.round_number,
      courseName: course?.name ?? null,
      startTime: r.itinerary_item_id ? teeTimes.get(r.itinerary_item_id) ?? null : null,
      intervalMins: parseInterval(s?.tee_interval_mins),
      groupSize: parseGroupSize(s?.tee_group_size),
    }
  })

  // Which team each player stands in, on the board's own sheet — for the
  // grouping the slots draw. A record rather than a Map: this crosses the
  // server/client line.
  const teamNames = new Map(
    ((teamsResult.data ?? []) as { id: string; name: string; team_set: string | null }[])
      .filter(t => (t.team_set ?? 'main') === teamSet)
      .map(t => [t.id, t.name]),
  )
  const teamOf: Record<string, { teamId: string; teamName: string }> = {}
  for (const m of (membersResult.data ?? []) as {
    team_id: string; team_set: string; player_id: string
  }[]) {
    if (m.team_set !== teamSet) continue
    const name = teamNames.get(m.team_id)
    if (name) teamOf[m.player_id] = { teamId: m.team_id, teamName: name }
  }

  return (
    <TeeSheetClient
      tripId={trip.id}
      tripCode={tripCode}
      rounds={rounds}
      players={(playersResult.data ?? []) as { id: string; name: string }[]}
      initialAssignments={
        ((assignmentsResult.data ?? []) as {
          round_id: string; player_id: string; slot_index: number
        }[]).map(a => ({
          round_id: a.round_id, player_id: a.player_id, slot_index: a.slot_index,
        }))
      }
      teamOf={teamOf}
      // Whether the sheet has anywhere to save. The assignments read is
      // fail-soft, so a missing table (pre-050) shows an empty sheet that
      // looks perfectly normal until a name is added and the write bounces
      // — a name appearing for a moment and vanishing, with the reason
      // rendered somewhere off the bottom of a long sheet. Said plainly at
      // the top instead.
      storageReady={!assignmentsResult.error}
      hasTeamBoard={teamBoard !== null}
      teeTeamsSeparate={teamBoard?.teeTeams === 'separate'}
      fieldMayEdit={allowsParticipant(
        kind,
        (permsResult.data as { event_permissions?: unknown } | null)?.event_permissions,
        'edit_tee_sheet',
      )}
      passcodeHash={(trip.settings_passcode_hash as string | null) ?? null}
    />
  )
}
