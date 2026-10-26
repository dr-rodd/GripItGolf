import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { teeSheetAccess } from '@/lib/eventPermissions'
import { parseLeaderboards, teamBoardForRound } from '@/lib/leaderboards'
import { PAIR_SIZE } from '@/lib/teamLimits'
import { draftRules, roundSheet } from '@/lib/teeSheet'
import BackButton from '@/app/components/BackButton'
import TripHeader from '@/app/components/TripHeader'
import PasscodeGate from '../../../setup/PasscodeGate'
import { readSheetSettings } from '../../sheets'
import TeeSheetWizard from './TeeSheetWizard'

export const dynamic = 'force-dynamic'

/**
 * Making a round's tee sheet — its own wizard (Ross, 26 Oct 2026). Until a
 * round has been through here its sheet is a vacant slot on the Tee times
 * tab; saving makes it live.
 *
 * A sheet is for a round that exists in Scoring: a league round still
 * waiting on its venue has no `rounds` row, so it has nothing to make a
 * sheet for until the venue is chosen.
 *
 * Behind the organiser PIN — on a trip, the Trip Setup passcode — unless
 * the event or trip lets anyone open the sheets (`set_tee_sheets` — a
 * casual event nobody runs; `teeSheetAccess`, read alike for both). The
 * same soft lock as every other organiser screen, and one with no PIN is
 * open, as ever.
 */
export default async function TeeSheetSetupPage({ params, searchParams }: {
  params: Promise<{ tripCode: string; roundId: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const [{ tripCode, roundId }, { from }] = await Promise.all([params, searchParams])

  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, name, kind, leaderboards, settings_passcode_hash')
    .eq('trip_code', tripCode)
    .single()
  if (error) console.error('TeeSheetSetupPage trip query failed:', error)

  const sheetHref = `/trip/${tripCode}/teesheet?round=${roundId}`
  const backHref = from === 'organiser' ? `/trip/${tripCode}/organiser`
    : from === 'setup' ? `/trip/${tripCode}/setup`
    : sheetHref

  const notHere = (title: string, body: string) => (
    <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center paper px-6 text-center">
      <p className="t-h2 text-ink mb-3">{title}</p>
      <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">{body}</p>
      <BackButton href={trip ? `/trip/${tripCode}/teesheet` : '/'} label={trip ? 'Tee times' : 'Home'} />
    </main>
  )

  if (!trip) return notHere('Not found', 'Check the code and try again.')
  // An event's, or a trip's since tee times reached trips (Ross, 26 Oct 2026).
  const event = isEvent(trip.kind)

  const [roundRes, playersRes, permsRes, sheets, assignRes] = await Promise.all([
    supabase
      .from('rounds')
      .select('id, round_number, itinerary_item_id, scheduled_date, courses(name)')
      .eq('trip_id', trip.id)
      .eq('id', roundId)
      .maybeSingle(),
    supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('is_composite', false),
    supabase.from('trips').select('event_permissions').eq('id', trip.id).single(),
    readSheetSettings(trip.id),
    // Who is on this round's sheet already — fail-soft, like the sheet's own
    // read. Their highest slot is what a shorter sheet must not lose.
    supabase.from('tee_assignments').select('slot_index').eq('trip_id', trip.id).eq('round_id', roundId),
  ])

  type RoundRow = {
    id: string; round_number: number; itinerary_item_id: string | null
    scheduled_date: string | null
    courses: { name: string } | { name: string }[] | null
  }
  const round = roundRes.data as unknown as RoundRow | null
  if (!round) {
    return notHere('No such round', 'A tee sheet is made for a round in Scoring. A round still waiting on its venue gets one once the venue is chosen.')
  }

  const item = round.itinerary_item_id
    ? (await supabase
        .from('itinerary_items')
        .select('tee_time, tee_count')
        .eq('id', round.itinerary_item_id)
        .eq('trip_id', trip.id)
        .maybeSingle()).data as { tee_time: string | null; tee_count: number | null } | null
    : null

  const assigned = ((assignRes.data ?? []) as { slot_index: number }[])
  const stored = sheets.get(round.id)
  const startTime = item?.tee_time ?? null
  const sheet = roundSheet({
    rules: stored?.rules,
    startTime,
    intervalMins: stored?.intervalMins,
    groupSize: stored?.groupSize,
    hasAssignments: assigned.length > 0,
  })
  const fieldSize = playersRes.count ?? 0

  // Whole teams a tee time, where this round's teammates share one and
  // the teams have a known size: a pairs draw's pairings, or a self-picked
  // board's teams.
  const board = teamBoardForRound(parseLeaderboards(trip.leaderboards), round.id)
  const teamSize = board && board.teeTeams !== 'separate'
    ? board.competition === 'matchplay' ? PAIR_SIZE : board.teamSize ?? null
    : null

  const course = Array.isArray(round.courses) ? round.courses[0] : round.courses
  const content = (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={backHref} />
      <TeeSheetWizard
        tripId={trip.id}
        roundId={round.id}
        roundNumber={round.round_number}
        courseName={course?.name ?? null}
        roundDate={round.scheduled_date}
        itineraryItemId={round.itinerary_item_id}
        initial={draftRules(sheet, startTime, fieldSize, item?.tee_count)}
        live={sheet.state !== 'vacant'}
        fieldSize={fieldSize}
        lastAssignedSlot={assigned.reduce((m, a) => Math.max(m, a.slot_index), -1)}
        teamSize={teamSize}
        backHref={backHref}
        doneHref={sheetHref}
      />
    </main>
  )

  const openToAll = teeSheetAccess((permsRes.data as { event_permissions?: unknown } | null)?.event_permissions).anyoneOpens
  if (!openToAll && isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        title="Tee sheet"
        hint={`Enter the ${event ? 'organiser PIN' : 'Trip Setup passcode'} for ${trip.name} to open round ${round.round_number}'s tee sheet.`}
      >
        {content}
      </PasscodeGate>
    )
  }
  return content
}
