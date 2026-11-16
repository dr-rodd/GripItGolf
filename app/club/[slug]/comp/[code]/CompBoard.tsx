import { notFound } from 'next/navigation'
import { isLegacy } from '@/lib/leaderboardsCompat'
import { parseLeaderboards } from '@/lib/leaderboards'
import { parseTeamScoring } from '@/lib/teamScoring'
import { liveRoundPresence, type OpenCard } from '@/lib/rowContext'
import { tripBase } from '@/lib/tripPaths'
import Poller from '@/app/components/Poller'
import { TripBaseProvider } from '@/app/golf/[root]/[tripCode]/TripBase'
import TripLeaderboardClient from '@/app/golf/[root]/[tripCode]/leaderboard/TripLeaderboardClient'
import { boardCopy } from '@/app/golf/[root]/[tripCode]/leaderboard/boardCopy'

/**
 * A competition's leaderboard inside the club area (D167): the event's own
 * board, from its shared server copy (D91 — unchanged, one copy per event,
 * ten seconds at most), drawn by the event's own board. `provisional` until
 * certified: no gold (D171).
 */
export default async function CompBoard({ code, provisional, active }: { code: string; provisional: boolean; active: boolean }) {
  const copy = await boardCopy(code)
  // A competition is never a bracket.
  if (!copy || copy.bracket) notFound()
  const { trip, rounds, boards, teams, players, memberships } = copy
  const stored = parseLeaderboards(trip.leaderboards)
  const { activeRoundIds, livePlayerIds } = liveRoundPresence(copy.open as unknown as OpenCard[])
  return (
    <section className="mt-6 -mx-4">
      <Poller isActive={active} />
      <TripBaseProvider base={tripBase(code, 'tournament')}>
        <TripLeaderboardClient
          tripCode={code}
          boards={boards}
          activeRoundIds={activeRoundIds}
          livePlayerIds={livePlayerIds}
          legacyTeamScoring={isLegacy(stored) ? parseTeamScoring(trip.team_scoring) : null}
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
          isEvent
          provisional={provisional}
        />
      </TripBaseProvider>
    </section>
  )
}
