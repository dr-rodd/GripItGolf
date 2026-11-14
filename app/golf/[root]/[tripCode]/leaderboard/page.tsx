import { notFound, redirect } from 'next/navigation'
import { isLegacy } from '@/lib/leaderboardsCompat'
import { parseLeaderboards } from '@/lib/leaderboards'
import { parseTeamScoring } from '@/lib/teamScoring'
import { liveRoundPresence, type OpenCard } from '@/lib/rowContext'
import { isEvent } from '@/lib/eventHub'
import { isPeriodLeague } from '@/lib/leagueSetup'
import Poller from '@/app/components/Poller'
import TripLeaderboardClient from './TripLeaderboardClient'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'
import { picksFrom, playerColourOf } from '@/lib/playerColours'
import { tripHomeAt } from '@/lib/tripPaths'
import { boardCopy } from './boardCopy'

export const dynamic = 'force-dynamic'

export default async function TripLeaderboardPage({
  params,
}: {
  params: Promise<{ root: string; tripCode: string }>
}) {
  const { root, tripCode } = await params
  const tripHome = tripHomeAt(root, tripCode)

  // Everything the board reads, from the event's shared server copy — at
  // most GOLF_BOARD_SECONDS old, or read fresh for this look (boardCopy.ts).
  // Nothing about who is looking is in it; anything per-viewer this page
  // ever needs is read here, beside it.
  const copy = await boardCopy(tripCode)
  if (!copy) notFound()

  // A match play event's leaderboard is its bracket, unless the organiser
  // has added a board beside the draw (boardCopy.ts, opensBracket).
  if (copy.bracket) redirect(`${tripHome}/matchplay`)

  const { trip, rounds, leagueSetup, boards, teams, players, memberships } = copy
  const stored = parseLeaderboards(trip.leaderboards)
  const teamScoring = parseTeamScoring(trip.team_scoring)

  // How an event's days relate on the board, and whether this is an event
  // at all. Both ride in on the `*` of the trips read rather than being
  // named, so a database that has not run migrations 046/047 simply has
  // neither and reads as the trip it has always been.
  const event = isEvent((trip as { kind?: unknown }).kind)
  const dayBoards = leagueSetup?.dayBoards

  // Each player's colour, for the dot beside their name on an individual
  // board — their side's, or their own pick where the event has no sides
  // (lib/playerColours.ts). Events only: a trip's individual boards are
  // as they were.
  const playerColours: Record<string, string> = {}
  if (event) {
    const colourOf = playerColourOf(teams, memberships, picksFrom(copy.picks))
    for (const p of players) {
      const c = colourOf(p.id)
      if (c) playerColours[p.id] = c
    }
  }
  // A league of rounds reads its board overall or one round at a time.
  const series = leagueSetup?.schedule === 'series'

  // Derived through the one copy of the rule: a vacant card — open, nobody
  // locked on — puts nothing in play. See liveRoundPresence in rowContext.
  const { activeRoundIds, livePlayerIds } =
    liveRoundPresence(copy.open as unknown as OpenCard[])
  const hasActiveRound =
    activeRoundIds.length > 0 || rounds.some(r => r.status === 'active')

  return (
    <div className="min-h-dvh paper has-tabbar page-enter text-ink">
      {/* The trip's own name used to sit in a band under this, which cost a
          fixed slice of the screen on the one page that is all table. The
          header names the page, and you arrived here from the trip. */}
      <TripHeader backTo={tripHome} title="leaderboard" />

      <Poller isActive={hasActiveRound} />

      <TripLeaderboardClient
        tripCode={tripCode}
        boards={boards}
        activeRoundIds={activeRoundIds}
        livePlayerIds={livePlayerIds}
        legacyTeamScoring={isLegacy(stored) ? teamScoring : null}
        rounds={rounds}
        teams={teams}
        memberships={memberships}
        players={players}
        nicknames={copy.nicknames}
        holes={copy.holes}
        scores={copy.scores}
        liveScores={copy.liveScores}
        roundHandicaps={copy.hcps}
        tees={copy.tees}
        isEvent={event}
        playerColours={playerColours}
        dayBoards={dayBoards}
        series={series}
        periods={isPeriodLeague(leagueSetup) ? leagueSetup.periods : undefined}
        periodRule={isPeriodLeague(leagueSetup) ? leagueSetup.periodRule : undefined}
        cardsOff={leagueSetup?.cardsOff}
        roundCards={copy.roundCards}
        linkedIds={copy.giLinked}
        sessionMatches={copy.sessionMatches}
      />

      {/* Below the board, after everything worth reading */}
      <SupportLink className="px-4 pb-12" />
    </div>
  )
}
