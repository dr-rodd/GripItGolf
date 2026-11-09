import { notFound } from 'next/navigation'
import { isEvent } from '@/lib/eventHub'
import { supabase } from '@/lib/supabase'
import { currentPlayer } from '@/lib/currentPlayer'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { teeSheetAccess } from '@/lib/eventPermissions'
import { overallOf, sessionBoardFor, sessionName } from '@/lib/sessions'
import { eventTags } from '@/lib/tagBoards'
import TripHeader from '@/app/components/TripHeader'
import MatchesSheet from '../session/MatchesSheet'
import { readSessionCards, readSessionMatchRows } from '../session/sessionMatches'
import { tripHomeAt } from '@/lib/tripPaths'

export const dynamic = 'force-dynamic'

/**
 * The order of play (Ross, 9 Nov 2026, D41): a Matches session's matches
 * without tee times — the same rows as its tee sheet would be, numbered
 * "Match 1, Match 2…" in place of times. One sheet a Matches session, in
 * running order. lib/sessions.ts has the rules.
 */
export default async function OrderOfPlayPage({ params, searchParams }: {
  params: Promise<{ root: string; tripCode: string }>
  searchParams: Promise<{ round?: string }>
}) {
  const { root, tripCode } = await params
  const { round: onlyRound } = await searchParams
  const tripHome = tripHomeAt(root, tripCode)

  const { data: trip } = await supabase.from('trips').select('*').eq('trip_code', tripCode).single()
  if (!trip) notFound()
  const boards = boardsForTrip(trip)
  const overall = overallOf(boards)

  const [roundsRes, playersRes, teamsRes, membersRes] = await Promise.all([
    supabase.from('rounds').select('id, round_number').eq('trip_id', trip.id).order('round_number'),
    supabase.from('players').select('id, name, handicap, claimed, gender').eq('trip_id', trip.id).eq('is_composite', false).order('name'),
    supabase.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id).order('created_at'),
    supabase.from('team_members').select('team_id, team_set, player_id').eq('trip_id', trip.id),
  ])
  const rounds = (roundsRes.data ?? []) as { id: string; round_number: number }[]
  const players = (playersRes.data ?? []) as { id: string; name: string; handicap: number | null; claimed: boolean | null; gender: string }[]
  const teams = (teamsRes.data ?? []) as { id: string; name: string; color: string; team_set: string | null }[]
  const memberships = (membersRes.data ?? []) as { team_id: string; team_set: string; player_id: string }[]
  const tags = eventTags(teams)
  const tagOfPlayer = Object.fromEntries(memberships.filter(m => m.team_set === 'main').map(m => [m.player_id, m.team_id]))
  const me = await currentPlayer(tripCode, players)

  const sessions = rounds
    .map(r => ({ round: r, board: sessionBoardFor(boards, r.id) }))
    .filter(s => s.board?.competition === 'matches' && (!onlyRound || s.round.id === onlyRound))

  const rows = await readSessionMatchRows(trip.id)
  const { results } = await readSessionCards(trip, boards, players, { teams, memberships }, rows)
  const access = teeSheetAccess((trip as { event_permissions?: unknown }).event_permissions)

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={tripHome} />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <h1 className="t-h1 text-ink mb-1">Order of play</h1>
        <p className="text-ink/65 text-sm mb-6 leading-snug">
          Each row is one match{tags.length === 2 ? `: ${tags[0].name} on the left, ${tags[1].name} on the right` : ''}.
        </p>
        {!overall || sessions.length === 0 ? (
          <p className={`text-ink/65 text-sm`}>No session plays matches yet. The organiser sets each session&apos;s format.</p>
        ) : sessions.map(({ round, board }) => (
          <MatchesSheet
            key={round.id}
            tripId={trip.id}
            tripCode={tripCode}
            roundId={round.id}
            title={sessionName(overall.overall, round.id, round.round_number)}
            format={board!.matchFormat!}
            matches={results.filter(m => m.roundId === round.id)}
            players={players}
            tags={tags}
            tagOfPlayer={tagOfPlayer}
            myId={me?.id ?? null}
            passcodeHash={(trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null}
            playersPick={access.playersPick}
            isTrip={!isEvent((trip as { kind?: unknown }).kind)}
            slots={overall.overall?.slots?.[round.id] ?? 0}
          />
        ))}
      </div>
    </main>
  )
}
