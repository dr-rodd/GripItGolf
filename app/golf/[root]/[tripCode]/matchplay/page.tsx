import { intoClub } from '@/app/golf/[root]/[tripCode]/kind'
import OrganiserLock from '@/app/components/OrganiserLock'
import { isEvent } from '@/lib/eventHub'
import BackButton from '@/app/components/BackButton'
import SupportLink from '@/app/components/SupportLink'
import TripHeader from '@/app/components/TripHeader'
import { tripHomeAt } from '@/lib/tripPaths'
import { BracketContent, readBracketPage } from './bracketPage'

export const dynamic = 'force-dynamic'

/**
 * The matchplay draw, on its own route.
 *
 * Kept separate from the leaderboard on purpose — the leaderboard links here
 * rather than rendering any of this, so none of the bracket display code is
 * bundled into the leaderboard's page load. What it reads and draws is
 * `bracketPage.tsx`, shared with a club match play's Bracket tab.
 */
export default async function MatchplayPage({
  params,
}: {
  params: Promise<{ root: string; tripCode: string }>
}) {
  const { root, tripCode } = await params
  // D284: a club competition's screens live inside its club.
  await intoClub(root, tripCode, 'matchplay')
  const tripHome = tripHomeAt(root, tripCode)
  const page = await readBracketPage(tripCode, tripHome)
  const { knockout, lock, setupRow } = page

  // The organiser's lock, at the header's right edge (OrganiserLock).
  const organiserLock = <OrganiserLock tripCode={tripCode} pinSet={!!lock} isTrip={!isEvent(setupRow?.kind)} />

  return (
    <div className="min-h-dvh paper has-tabbar page-enter text-ink">
      <TripHeader backTo={tripHome} action={organiserLock} />
      <div className="paper border-b border-line">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          {knockout ? <div className="w-11" /> : <BackButton href={`${tripHome}/leaderboard`} />}
          <h1 className="t-h2 text-ink truncate px-2">
            Knockout
          </h1>
          <div className="w-11" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <BracketContent page={page} empty="event" />
      </div>
      {/* Rendered once here rather than inside EmptyState, so a drawn bracket
          keeps the tab bar and the footer exactly like every other screen —
          before this, both vanished the moment there was a bracket to show. */}
      <SupportLink className="px-4 pb-12" />
    </div>
  )
}
