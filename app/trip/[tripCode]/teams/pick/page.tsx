import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { pickerSheets, roundPickerSheet, openTeamOnTime, type PickerMember, type PickerSheet, type TeeTimePick } from '@/lib/teamPicker'
import { MAX_PARTNERSHIP } from '@/lib/partnerships'
import { tagsInPlay } from '@/lib/leaderboards'
import { TAG_SET, untaggedIds } from '@/lib/tagBoards'
import { teeSheetAccess } from '@/lib/eventPermissions'
import { roundSheet, sheetClock, sheetGroupSize } from '@/lib/teeSheet'
import { readSheetSettings } from '../../teesheet/sheets'
import { linkedPlayerId } from '@/lib/currentPlayer'
import { readAllRows } from '@/lib/allRows'
import BackButton from '@/app/components/BackButton'
import TripHeader from '@/app/components/TripHeader'
import { fetchTripKind } from '../../kind'
import TeamPickerWizard from './TeamPickerWizard'

export const dynamic = 'force-dynamic'

/**
 * The team picker (Ross, 27 Oct 2026) — teams and partnerships made one
 * way: who is in the team, then a check of how it will read and whether it
 * plays together. `?sheet=` names the list, `?team=` the team being
 * changed (none for a new one), and `?back=` where to go when it is saved
 * — the teams page unless the caller says otherwise.
 *
 * From the tee sheet it is `?round=&slot=` instead (stage 4): the team is
 * for that tee time — the round's partnerships, whichever sheet they are
 * on, those already on the time read fresh here, and back to the sheet
 * with the team to place on it.
 *
 * Who may change what is decided in the browser (lib/teamPicker.ts): the
 * organiser's PIN unlock lives in sessionStorage, which only it can see.
 */
export default async function TeamPickPage({ params, searchParams }: {
  params: Promise<{ tripCode: string }>
  searchParams: Promise<{ sheet?: string; team?: string; back?: string; round?: string; slot?: string }>
}) {
  const [{ tripCode }, query] = await Promise.all([params, searchParams])
  const teamsHref = `/trip/${tripCode}/teams`
  // Only ever back into this trip — a link is a suggestion, never a redirect elsewhere.
  const slotIndex = query.slot !== undefined && /^\d{1,3}$/.test(query.slot) ? Number(query.slot) : null
  const teeRoundId = query.round && slotIndex !== null ? query.round : null
  const sheetHref = teeRoundId ? `/trip/${tripCode}/teesheet?round=${encodeURIComponent(teeRoundId)}` : null
  const back = sheetHref
    ?? (query.back && query.back.startsWith(`/trip/${tripCode}/`) ? query.back : teamsHref)

  const [kind, { data: trip, error }] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      .select('id, trip_code, name, formats, leaderboards, team_scoring, settings_passcode_hash')
      .eq('trip_code', tripCode)
      .single(),
  ])
  if (error) console.error('TeamPickPage trip query failed:', error)

  const notHere = (title: string, body: string) => (
    <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center paper px-6 text-center">
      <p className="t-h2 text-ink mb-3">{title}</p>
      <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">{body}</p>
      <BackButton
        href={!trip ? '/' : sheetHref ?? teamsHref}
        label={!trip ? 'Home' : sheetHref ? 'Tee times' : 'Teams'}
      />
    </main>
  )
  if (!trip) return notHere('Not found', 'Check the code and try again.')

  const boards = boardsForTrip(trip)
  const [teamsRes, playersRes, membersRes, addedRes, roundsRes, viewerPlayerId, tee] = await Promise.all([
    supabase.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id).order('created_at'),
    supabase.from('players').select('id, name').eq('trip_id', trip.id).eq('is_composite', false).order('name'),
    supabase.from('team_members').select('team_id, team_set, player_id').eq('trip_id', trip.id),
    // Who added whom (migration 066), on its own and fail-soft — named in
    // the read above it would cost the whole picker before 066.
    readAllRows<{ team_set: string; player_id: string; added_by: string | null }>(
      () => supabase
        .from('team_members')
        .select('team_set, player_id, added_by', { count: 'exact' })
        .eq('trip_id', trip.id)
        .order('team_set').order('player_id'),
      m => `${m.team_set}|${m.player_id}`,
    ),
    supabase.from('rounds').select('id').eq('trip_id', trip.id),
    linkedPlayerId(tripCode),
    // From the tee sheet: the time as it stands, in the same batch.
    teeRoundId && slotIndex !== null ? readTeeTime(trip.id, teeRoundId, slotIndex) : Promise.resolve(null),
  ])

  const addedBy = new Map(((addedRes.data ?? []) as { team_set: string; player_id: string; added_by: string | null }[])
    .map(m => [`${m.team_set}|${m.player_id}`, m.added_by]))
  const memberships: PickerMember[] = ((membersRes.data ?? []) as { team_id: string; team_set: string; player_id: string }[])
    .map(m => ({ ...m, added_by: addedBy.get(`${m.team_set}|${m.player_id}`) ?? null }))

  const largestOn = (sheet: string) => {
    const counts = new Map<string, number>()
    for (const m of memberships) {
      if (m.team_set === sheet) counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1)
    }
    return Math.max(0, ...counts.values())
  }
  const players = (playersRes.data ?? []) as { id: string; name: string }[]
  // The claim cookie, only as one of this trip's own players — it
  // personalises, never authorises (lib/currentPlayer.ts).
  const meId = viewerPlayerId && players.some(p => p.id === viewerPlayerId) ? viewerPlayerId : null

  // From the tee sheet: the round's own list, and the time as it stands now.
  let sheet: PickerSheet | null = null
  let teeTime: { roundId: string; slot: number; at: TeeTimePick; playingForTags: boolean } | null = null
  // A part-filled team on the time is joined, not doubled — unless this
  // phone's player already has a team of their own here.
  let slotTeamId: string | null = null
  if (teeRoundId && slotIndex !== null) {
    if (!tee) return notHere('No such tee time', 'The tee sheet has it as it is now.')
    sheet = roundPickerSheet(boards, teeRoundId, largestOn, tee.playersBook)
    if (!sheet) return notHere('No teams on this round', 'Its players go out as they please — book a time on the tee sheet.')
    const onSheet = sheet.id
    const teamed = new Set(memberships.filter(m => m.team_set === onSheet).map(m => m.player_id))
    if (!meId || !teamed.has(meId)) {
      slotTeamId = openTeamOnTime(memberships, onSheet, tee.onSlot, sheet.cap ?? MAX_PARTNERSHIP)
    }
    const playingForTags = tagsInPlay(boards)
    const untagged = new Set(playingForTags
      ? untaggedIds(players.map(p => p.id), memberships.filter(m => m.team_set === TAG_SET))
      : [])
    teeTime = {
      roundId: teeRoundId,
      slot: slotIndex,
      playingForTags,
      at: {
        label: tee.label,
        onSlot: tee.onSlot,
        mates: tee.onSlot.filter(id => !teamed.has(id) && id !== meId),
        free: players.map(p => p.id)
          .filter(id => !tee.onRound.has(id) && !teamed.has(id) && id !== meId && !untagged.has(id)),
        vacancy: tee.vacancy,
        bookerRecorded: tee.bookerRecorded,
      },
    }
  } else {
    const sheets = pickerSheets(boards, ((roundsRes.data ?? []) as { id: string }[]).map(r => r.id), largestOn)
    sheet = sheets.find(s => s.id === query.sheet) ?? sheets[0] ?? null
  }
  if (!sheet) {
    return notHere('No teams to pick', 'None of the leaderboards plays in teams yet.')
  }

  const teams = ((teamsRes.data ?? []) as { id: string; name: string; color: string; team_set: string | null }[])
  const team = query.team
    ? teams.find(t => t.id === query.team && (t.team_set ?? 'main') === sheet.id) ?? null
    : slotTeamId ? teams.find(t => t.id === slotTeamId) ?? null : null
  if (query.team && !team) {
    return notHere('No such team', 'It may have been taken apart since — the teams page has them as they are now.')
  }

  return (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={back} />
      <TeamPickerWizard
        tripId={trip.id}
        tripCode={tripCode}
        isTrip={!isEvent(kind)}
        passcodeHash={(trip.settings_passcode_hash as string | null) ?? null}
        sheet={sheet}
        team={team}
        teamsOnSheet={teams.filter(t => (t.team_set ?? 'main') === sheet.id)}
        memberships={memberships}
        players={players}
        meId={meId}
        addedRecorded={!addedRes.error}
        backHref={back}
        teeTime={teeTime}
      />
    </main>
  )
}

/**
 * One tee time as it stands, for a team being made for it: who is on it,
 * who is on the round's sheet at all, the places left, and what it is
 * called. Null when the round has no live sheet. Each new column is read on its own, fail-soft, as the sheet reads
 * them (065's `booked_by`, 049's permissions).
 */
async function readTeeTime(tripId: string, roundId: string, slot: number): Promise<{
  label: string
  onSlot: string[]
  onRound: Set<string>
  vacancy: number
  bookerRecorded: boolean
  playersBook: boolean
} | null> {
  const [roundRes, settings, assignedRes, bookerRes, permsRes] = await Promise.all([
    supabase.from('rounds').select('id, itinerary_item_id').eq('trip_id', tripId).eq('id', roundId).maybeSingle(),
    readSheetSettings(tripId),
    supabase.from('tee_assignments').select('player_id, slot_index').eq('trip_id', tripId).eq('round_id', roundId),
    supabase.from('tee_assignments').select('booked_by').eq('trip_id', tripId).limit(1),
    supabase.from('trips').select('event_permissions').eq('id', tripId).single(),
  ])
  const round = roundRes.data as { id: string; itinerary_item_id: string | null } | null
  if (!round || assignedRes.error) return null
  const item = round.itinerary_item_id
    ? await supabase.from('itinerary_items').select('tee_time').eq('trip_id', tripId).eq('id', round.itinerary_item_id).maybeSingle()
    : null
  const rows = (assignedRes.data ?? []) as { player_id: string; slot_index: number }[]
  const s = settings.get(roundId)
  const sheet = roundSheet({
    rules: s?.rules,
    startTime: (item?.data as { tee_time?: string | null } | null)?.tee_time ?? null,
    intervalMins: s?.intervalMins,
    groupSize: s?.groupSize,
    hasAssignments: rows.length > 0,
  })
  if (sheet.state === 'vacant') return null
  const onSlot = rows.filter(r => r.slot_index === slot).map(r => r.player_id)
  return {
    label: sheetClock(sheet, slot) ?? `Group ${slot + 1}`,
    onSlot,
    onRound: new Set(rows.map(r => r.player_id)),
    vacancy: Math.max(0, sheetGroupSize(sheet) - onSlot.length),
    bookerRecorded: !bookerRes.error,
    playersBook: teeSheetAccess((permsRes.data as { event_permissions?: unknown } | null)?.event_permissions).playersPick,
  }
}
