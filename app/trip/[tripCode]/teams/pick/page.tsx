import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { pickerSheets, type PickerMember } from '@/lib/teamPicker'
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
 * — the teams page unless the caller says otherwise (the tee sheet, next).
 *
 * Who may change what is decided in the browser (lib/teamPicker.ts): the
 * organiser's PIN unlock lives in sessionStorage, which only it can see.
 */
export default async function TeamPickPage({ params, searchParams }: {
  params: Promise<{ tripCode: string }>
  searchParams: Promise<{ sheet?: string; team?: string; back?: string }>
}) {
  const [{ tripCode }, query] = await Promise.all([params, searchParams])
  const teamsHref = `/trip/${tripCode}/teams`
  // Only ever back into this trip — a link is a suggestion, never a redirect elsewhere.
  const back = query.back && query.back.startsWith(`/trip/${tripCode}/`) ? query.back : teamsHref

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
      <BackButton href={trip ? teamsHref : '/'} label={trip ? 'Teams' : 'Home'} />
    </main>
  )
  if (!trip) return notHere('Not found', 'Check the code and try again.')

  const boards = boardsForTrip(trip)
  const [teamsRes, playersRes, membersRes, addedRes, roundsRes, viewerPlayerId] = await Promise.all([
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
  const sheets = pickerSheets(boards, ((roundsRes.data ?? []) as { id: string }[]).map(r => r.id), largestOn)
  const sheet = sheets.find(s => s.id === query.sheet) ?? sheets[0] ?? null
  if (!sheet) {
    return notHere('No teams to pick', 'None of the leaderboards plays in teams yet.')
  }

  const players = (playersRes.data ?? []) as { id: string; name: string }[]
  // The claim cookie, only as one of this trip's own players — it
  // personalises, never authorises (lib/currentPlayer.ts).
  const meId = viewerPlayerId && players.some(p => p.id === viewerPlayerId) ? viewerPlayerId : null

  const teams = ((teamsRes.data ?? []) as { id: string; name: string; color: string; team_set: string | null }[])
  const team = query.team ? teams.find(t => t.id === query.team && (t.team_set ?? 'main') === sheet.id) ?? null : null
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
      />
    </main>
  )
}
