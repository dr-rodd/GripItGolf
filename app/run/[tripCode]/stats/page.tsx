import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { isRunChallenge } from '@/lib/runChallenge'
import { fetchRunChallenge } from '../data'
import { ChallengeNotFound } from '../RunPieces'

export const dynamic = 'force-dynamic'

/**
 * The Stats tab — named now, built later, and saying so, the way golf's
 * Personal usage card does: nobody taps into a dead end that pretends.
 */
export default async function RunStatsPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  const challenge = await fetchRunChallenge(tripCode)
  if (!challenge) return <ChallengeNotFound />
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}/stats`)

  return (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={`/run/${challenge.code}`} title="statsHub" />
      <div className="max-w-lg mx-auto px-4 pt-10 pb-16 page-enter text-center">
        <p className="t-label text-ink/80 mb-3">Coming soon</p>
        <p className="t-h2 text-ink mb-2">
          Your running, in numbers
        </p>
        <p className="text-ink/65 text-sm leading-relaxed max-w-[22rem] mx-auto">
          Distance by week, your pace, and how your team is tracking.
        </p>
      </div>
    </main>
  )
}
