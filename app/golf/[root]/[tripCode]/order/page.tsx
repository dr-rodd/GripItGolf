import { notFound } from 'next/navigation'
import OrganiserLock from '@/app/components/OrganiserLock'
import { isEvent } from '@/lib/eventHub'
import { eventReader } from '@/lib/eventReader'
import { currentPlayer } from '@/lib/currentPlayer'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { teeSheetAccess } from '@/lib/eventPermissions'
import { overallOf, sessionBoardFor, sessionSlotCount } from '@/lib/sessions'
import { eventTags } from '@/lib/tagBoards'
import TripHeader from '@/app/components/TripHeader'
import OrderOfPlayList from './OrderOfPlayList'
import { readSessionCards, readSessionMatchRows } from '../session/sessionMatches'
import { buildMatchSheets, readSessionTimes } from '../session/matchSheets'
import { tripHomeAt } from '@/lib/tripPaths'
import { isLocked } from '@/lib/passcode'

export const dynamic = 'force-dynamic'

/**
 * The order of play (Ross, 9 Nov 2026, D41): a Matches session's matches
 * without tee times — the same rows as its tee sheet would be, numbered
 * "Match 1, Match 2…" in place of times. One sheet a Matches session, in
 * running order, one open at a time (`?round=` opens that one), each with
 * − and + for how many matches it holds. lib/sessions.ts has the rules.
 */
export default async function OrderOfPlayPage({ params, searchParams }: {
  params: Promise<{ root: string; tripCode: string }>
  searchParams: Promise<{ round?: string }>
}) {
  const { root, tripCode } = await params
  const db = eventReader(tripCode)
  const { round: onlyRound } = await searchParams
  const tripHome = tripHomeAt(root, tripCode)

  const { data: trip } = await db.from('trips').select('*').eq('trip_code', tripCode).single()
  if (!trip) notFound()
  const boards = boardsForTrip(trip)
  const overall = overallOf(boards)

  const [roundsRes, playersRes, teamsRes, membersRes] = await Promise.all([
    db.from('rounds').select('id, round_number').eq('trip_id', trip.id).order('round_number'),
    db.from('players').select('id, name, handicap, claimed, gender').eq('trip_id', trip.id).eq('is_composite', false).order('name'),
    db.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id).order('created_at'),
    db.from('team_members').select('team_id, team_set, player_id').eq('trip_id', trip.id),
  ])
  const rounds = (roundsRes.data ?? []) as { id: string; round_number: number }[]
  const players = (playersRes.data ?? []) as { id: string; name: string; handicap: number | null; claimed: boolean | null; gender: string }[]
  const teams = (teamsRes.data ?? []) as { id: string; name: string; color: string; team_set: string | null }[]
  const memberships = (membersRes.data ?? []) as { team_id: string; team_set: string; player_id: string }[]
  const tags = eventTags(teams)
  const tagOfPlayer = Object.fromEntries(memberships.filter(m => m.team_set === 'main').map(m => [m.player_id, m.team_id]))
  const me = await currentPlayer(tripCode, players)

  const rows = await readSessionMatchRows(db, trip.id)
  const { results } = await readSessionCards(db, trip, boards, players, { teams, memberships }, rows)
  const access = teeSheetAccess((trip as { event_permissions?: unknown }).event_permissions)
  // A session whose round has tee times shows them on its rows; every
  // session shows its matches either way (session/matchSheets.ts).
  const times = await readSessionTimes(db, trip.id, rid => `${tripHome}/teesheet/${rid}/setup?from=order`,
    rid => sessionSlotCount(overall?.overall, sessionBoardFor(boards, rid), rid, results, players.length))
  const { sheets, initialOpen } = buildMatchSheets({
    boards, rounds, results, times, onlyRound, fieldSize: players.length,
    common: {
      tripId: trip.id,
      tripCode,
      players,
      tags,
      tagOfPlayer,
      myId: me?.id ?? null,
      pinSet: isLocked((trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null),
      playersPick: access.playersPick,
      isTrip: !isEvent((trip as { kind?: unknown }).kind),
    },
  })

  // The organiser's lock, at the header's right edge (OrganiserLock).
  const organiserLock = <OrganiserLock tripCode={tripCode} pinSet={isLocked((trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null)} isTrip={!isEvent((trip as { kind?: unknown }).kind)} />

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={tripHome} action={organiserLock} />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <h1 className="t-h1 text-ink mb-1">Order of play</h1>
        <p className="text-ink/65 text-sm mb-6 leading-snug">
          Each row is one match{tags.length === 2 ? `: ${tags[0].name} on the left, ${tags[1].name} on the right` : ''}.
        </p>
        {sheets.length === 0 ? (
          <p className={`text-ink/65 text-sm`}>No session plays matches yet. The organiser sets each session&apos;s format.</p>
        ) : (
          <OrderOfPlayList initialOpen={initialOpen} sheets={sheets} />
        )}
      </div>
    </main>
  )
}
