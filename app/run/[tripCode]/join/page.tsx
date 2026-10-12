import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import { currentPlayer } from '@/lib/currentPlayer'
import { todayString } from '@/lib/tripStatus'
import { isRunChallenge, challengeFinished, joinChoices } from '@/lib/runChallenge'
import { fetchRunChallenge, rosterOf } from '../data'
import RunJoinClient from './RunJoinClient'

export const dynamic = 'force-dynamic'

/**
 * Joining a run challenge: who you are, then which team.
 *
 * Reached from the challenge's home. The server works out what is on offer
 * — claiming a name the organiser added, adding your own (`join_self`),
 * starting a team (`create_teams`), or nothing because the challenge has
 * finished — through `joinChoices`, the one copy of that decision, and the
 * screen only renders it.
 *
 * The cookie says who this phone is already, if anyone; joining again as
 * someone else simply switches it. It personalises, never authorises
 * (lib/currentPlayer.ts).
 */
export default async function RunJoinPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  const challenge = await fetchRunChallenge(tripCode)

  if (!challenge) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
          Challenge not found
        </p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}/players`)

  const roster = rosterOf(challenge)
  const viewer = await currentPlayer(challenge.code, roster)
  const choices = joinChoices(
    challenge.perms,
    roster,
    challenge.endDate ? challengeFinished(challenge.endDate, todayString(new Date())) : false,
  )

  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <TripHeader backTo={`/run/${challenge.code}`} />
      <div className="max-w-lg mx-auto px-4 pt-8 pb-16 page-enter">
        <RunJoinClient
          tripId={challenge.id}
          code={challenge.code}
          name={challenge.name}
          roster={roster}
          teams={challenge.teams.map(t => ({
            id: t.id, name: t.name, color: t.color, count: t.members.length,
          }))}
          choices={choices}
          viewerId={viewer?.id ?? null}
        />
      </div>
    </main>
  )
}
