import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { MAIN_SET } from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import { pickerSheets, type PickerMember } from '@/lib/teamPicker'
import { readAllRows } from '@/lib/allRows'
import BackButton from '@/app/components/BackButton'
import TripTeamsClient from './TripTeamsClient'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'
import PasscodeGate from '../setup/PasscodeGate'
import TagJoinClient from './TagJoinClient'
import TeamsClient from './TeamsClient'
import { isLocked } from '@/lib/passcode'
import { isEvent } from '@/lib/eventHub'
import { parseEventPermissions } from '@/lib/eventPermissions'
import { eventTags } from '@/lib/tagBoards'
import { fetchTripKind } from '../kind'
import { linkedPlayerId } from '@/lib/currentPlayer'

export const dynamic = 'force-dynamic'

/**
 * The teams page — every leaderboard's teams, picked through the team
 * picker (Ross, 27 Oct 2026: teams and partnerships made one way, for the
 * organiser and, where the field picks its own, for players). Open to look
 * at for everybody; who may change what is the browser's call
 * (lib/teamPicker.ts), because the organiser's PIN unlock lives in
 * sessionStorage.
 *
 * `?view=drag` is the organiser's drag-and-drop editor, kept while the
 * picker proves itself — quicker for a small event, no use for a large one
 * (Ross). It apportions teams to boards and is the one place a team is
 * renamed; on an event it stands behind the PIN, as it always has.
 */
export default async function TripTeamsPage({
  params, searchParams,
}: {
  params: Promise<{ tripCode: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const [{ tripCode }, { view }] = await Promise.all([params, searchParams])

  // The kind alongside, not inside: a named `kind` would fail this select
  // on an un-migrated database — the note on fetchTripKind.
  const [kind, { data: trip, error: tripError }] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      .select('id, trip_code, name, formats, leaderboards, team_scoring, settings_passcode_hash')
      .eq('trip_code', tripCode)
      .single(),
  ])
  const event = isEvent(kind)

  if (tripError) console.error('TripTeamsPage trip query failed:', tripError)
  if (!trip) notFound()

  const boards = boardsForTrip(trip)

  const [teamsRes, playersRes, memberships, viewerPlayerId, permsRes, addedRes, roundsRes] = await Promise.all([
    supabase.from('teams')
      .select('id, name, color, team_set').eq('trip_id', trip.id).order('created_at'),
    supabase
      .from('players')
      .select('id, name, handicap, gender')
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .order('name'),
    fetchMemberships(trip.id),
    // Who this device claims to be — the picker's identity. A stranger is
    // an ordinary answer, pointed at the players screen.
    linkedPlayerId(tripCode),
    // Its own query, never the main select: pre-049 the column does not
    // exist, this errors, and self-assign simply reads at its default off.
    supabase
      .from('trips')
      .select('event_permissions')
      .eq('id', trip.id)
      .single(),
    // Who added whom (migration 066), on its own and fail-soft — before it,
    // players put only themselves in a team.
    readAllRows<{ team_set: string; player_id: string; added_by: string | null }>(
      () => supabase
        .from('team_members')
        .select('team_set, player_id, added_by', { count: 'exact' })
        .eq('trip_id', trip.id)
        .order('team_set').order('player_id'),
      m => `${m.team_set}|${m.player_id}`,
    ),
    // The rounds, so each list can say whether its teams go out together.
    supabase.from('rounds').select('id').eq('trip_id', trip.id),
  ])

  if (teamsRes.error) console.error('TripTeamsPage teams query failed:', teamsRes.error)
  if (playersRes.error) console.error('TripTeamsPage players query failed:', playersRes.error)

  const teams = (teamsRes.data ?? []).map(t => ({
    id: t.id as string,
    name: t.name as string,
    color: t.color as string,
    team_set: (t.team_set as string | null) ?? MAIN_SET,
  }))
  const players = (playersRes.data ?? []) as {
    id: string; name: string; handicap: number | null; gender: string
  }[]

  // ── The drag-and-drop editor ──
  if (view === 'drag') {
    const screen = (
      <div className="min-h-dvh paper has-tabbar page-enter text-ink">
        <TripHeader backTo={`/trip/${tripCode}`} />
        <div className="paper border-b border-line">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <BackButton href={`/trip/${tripCode}/teams`} />
            <div className="min-w-0 text-center">
              <h1 className="t-card text-ink">
                Teams
              </h1>
            </div>
            <div className="w-[60px]" />
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6">
          <TripTeamsClient
            tripId={trip.id}
            tripCode={tripCode}
            boards={boards}
            teams={teams}
            players={players}
            memberships={memberships}
          />
        </div>
        <SupportLink className="px-4 pb-12" />
      </div>
    )
    // On a trip, teams are the group's to argue over — no gate. On an
    // event the drag editor is the organiser's, behind the PIN.
    if (event && isLocked(trip.settings_passcode_hash as string | null)) {
      return (
        <PasscodeGate
          tripCode={tripCode}
          tripName={trip.name}
          passcodeHash={trip.settings_passcode_hash as string}
          title="Organisers only"
          hint={`Enter the organiser PIN for ${trip.name}.`}
        >
          {screen}
        </PasscodeGate>
      )
    }
    return screen
  }

  // ── The teams page, through the picker ──
  const addedBy = new Map(((addedRes.data ?? []) as { team_set: string; player_id: string; added_by: string | null }[])
    .map(m => [`${m.team_set}|${m.player_id}`, m.added_by]))
  const pickerMembers: PickerMember[] = memberships
    .map(m => ({ ...m, added_by: addedBy.get(`${m.team_set}|${m.player_id}`) ?? null }))
  const largestOn = (sheet: string) => {
    const counts = new Map<string, number>()
    for (const m of memberships) {
      if (m.team_set === sheet) counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1)
    }
    return Math.max(0, ...counts.values())
  }
  const sheets = pickerSheets(boards, ((roundsRes.data ?? []) as { id: string }[]).map(r => r.id), largestOn)
  const meId = viewerPlayerId && players.some(p => p.id === viewerPlayerId) ? viewerPlayerId : null

  // A claimed player joining one of the organiser's tags — a different verb
  // from forming a team (lib/tagBoards.ts), and on its own card above them.
  const tags = eventTags(teams)
  const mayPickTag = event
    && tags.length > 0
    && parseEventPermissions(
      (permsRes.data as { event_permissions?: unknown } | null)?.event_permissions
    ).assign_tag

  return (
    <div className="min-h-dvh paper has-tabbar page-enter text-ink">
      <TripHeader backTo={`/trip/${tripCode}`} />
      <div className="paper border-b border-line">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <BackButton href={event ? `/trip/${tripCode}` : `/trip/${tripCode}/setup`} />
          <div className="min-w-0 text-center">
            <h1 className="t-card text-ink">
              Teams
            </h1>
          </div>
          <div className="w-[60px]" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-10">
        {mayPickTag && (
          <TagJoinClient
            tripId={trip.id}
            tripCode={tripCode}
            tags={tags}
            players={players}
            memberships={memberships}
            viewerPlayerId={meId}
          />
        )}
        <TeamsClient
          tripId={trip.id}
          tripCode={tripCode}
          isTrip={!event}
          passcodeHash={(trip.settings_passcode_hash as string | null) ?? null}
          sheets={sheets}
          teams={teams}
          memberships={pickerMembers}
          players={players.map(p => ({ id: p.id, name: p.name }))}
          meId={meId}
          addedRecorded={!addedRes.error}
        />
      </div>
      <SupportLink className="px-4 pb-12" />
    </div>
  )
}
