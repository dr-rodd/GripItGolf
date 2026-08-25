import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { MAIN_SET } from '@/lib/teamSets'
import { fetchMemberships } from '@/lib/teamMembers'
import { parseEventPermissions } from '@/lib/eventPermissions'
import BackButton from '@/app/components/BackButton'
import PasscodeGate from '../../setup/PasscodeGate'
import TagPortalClient from './TagPortalClient'

export const dynamic = 'force-dynamic'

/**
 * The tags portal — where an event's tags are made and players are given
 * theirs, behind the same PIN as the rest of the organiser area.
 *
 * A tag is a team row on the main sheet (lib/tagBoards.ts has the whole
 * reasoning), so this page fetches the same three things the teams screen
 * does — teams, players, memberships — and hands them to a deliberately
 * lighter client: lists and taps, not the drag-and-drop editor. Events
 * only, exactly like the organiser page it hangs off.
 */
export default async function TagsPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, trip_code, name, kind, settings_passcode_hash')
    .eq('trip_code', tripCode)
    .single()
  if (error) console.error('TagsPage trip query failed:', error)

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
          Tags belong to events. A trip&apos;s teams are picked in Trip
          Setup, on the tab bar below.
        </p>
        <BackButton href={`/trip/${tripCode}`} label="Trip" />
      </main>
    )
  }

  // The permissions ride in their own query for the usual fail-soft reason:
  // pre-049 the column does not exist, this errors, and the self-assign
  // toggle simply shows its default.
  const [teamsRes, playersRes, memberships, permsRes] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, color, team_set')
      .eq('trip_id', trip.id)
      .order('created_at'),
    supabase
      .from('players')
      .select('id, name')
      .eq('trip_id', trip.id)
      .eq('is_composite', false)
      .order('name'),
    fetchMemberships(trip.id),
    supabase
      .from('trips')
      .select('event_permissions')
      .eq('id', trip.id)
      .single(),
  ])

  if (teamsRes.error) console.error('TagsPage teams query failed:', teamsRes.error)
  if (playersRes.error) console.error('TagsPage players query failed:', playersRes.error)

  const teams = (teamsRes.data ?? []).map(t => ({
    id: t.id as string,
    name: t.name as string,
    color: t.color as string,
    team_set: (t.team_set as string | null) ?? MAIN_SET,
  }))

  const permissions = parseEventPermissions(
    (permsRes.data as { event_permissions?: unknown } | null)?.event_permissions
  )

  const content = (
    <TagPortalClient
      tripId={trip.id}
      tripCode={tripCode}
      initialTeams={teams}
      players={(playersRes.data ?? []) as { id: string; name: string }[]}
      initialMemberships={memberships}
      initialPermissions={permissions}
    />
  )

  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        title="Tags"
        hint={`Enter the organiser PIN for ${trip.name}.`}
      >
        {content}
      </PasscodeGate>
    )
  }

  return content
}
