import Link from 'next/link'
import { redirect } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { currentPlayer } from '@/lib/currentPlayer'
import { isRunChallenge } from '@/lib/runChallenge'
import { fetchRunChallenge, rosterOf } from '../data'
import { ChallengeNotFound, SectionTitle } from '../RunPieces'
import RunShare from '../RunShare'

export const dynamic = 'force-dynamic'

/**
 * The Settings tab — the runner's own, with the door to the organiser's.
 *
 * Three things: who this phone is (and switching it), Strava (its place,
 * ahead of the stage that connects it), and the organiser area for whoever
 * holds the PIN. The PIN asks at that door, not at this tab, so a runner
 * opening Settings is never met by a lock.
 */
export default async function RunSettingsPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  const challenge = await fetchRunChallenge(tripCode)
  if (!challenge) return <ChallengeNotFound />
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}/setup`)

  const viewer = await currentPlayer(challenge.code, rosterOf(challenge))
  const team = challenge.teams.find(t => t.id === viewer?.teamId) ?? null

  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <TripHeader backTo={`/run/${challenge.code}`} title="settings" />
      <div className="max-w-lg mx-auto px-4 pt-6 pb-16 page-enter space-y-8">

        <section>
          <SectionTitle>You</SectionTitle>
          <div className="bg-surface border border-bark/12 rounded-2xl p-4">
            {viewer ? (
              <>
                <p className="text-ink text-sm font-medium">{viewer.name}</p>
                <p className="text-ink/65 text-[13px] mt-0.5 flex items-center gap-1.5">
                  {team && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} aria-hidden="true" />
                  )}
                  {team ? `Running for ${team.name}` : 'No team yet — ask the organiser to put you on one.'}
                </p>
                <Link
                  href={`/run/${challenge.code}/join`}
                  className="inline-block t-cap text-accent-deep hover:text-accent transition-colors mt-3"
                >
                  Not you? Switch name
                </Link>
              </>
            ) : (
              <>
                <p className="text-ink/80 text-sm">This phone has not joined the challenge.</p>
                <Link
                  href={`/run/${challenge.code}/join`}
                  className="inline-block t-cap text-accent-deep hover:text-accent transition-colors mt-3"
                >
                  Join the challenge →
                </Link>
              </>
            )}
          </div>
        </section>

        <section>
          <SectionTitle>Strava</SectionTitle>
          <div className="bg-surface border border-bark/12 rounded-2xl p-4 flex items-start justify-between gap-4">
            <p className="text-ink/65 text-[13px] leading-snug min-w-0">
              Connecting Strava — and disconnecting it — will live here and on the
              Add tab. Coming in the next update.
            </p>
            <span className="t-cap uppercase tracking-[0.12em] text-ink/65 flex-shrink-0">Soon</span>
          </div>
        </section>

        <section>
          <SectionTitle>The challenge</SectionTitle>
          <RunShare code={challenge.code} name={challenge.name} />
        </section>

        <section>
          <SectionTitle>Organiser</SectionTitle>
          <Link
            href={`/run/${challenge.code}/organiser`}
            className="flex items-center justify-between gap-4 bg-surface border border-bark/12 rounded-2xl p-4 press hover:border-bark/25 transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-ink text-sm font-medium">Organiser area</span>
              <span className="block text-ink/65 text-[13px] mt-0.5 leading-snug">
                Teams, permissions and the points rules. Asks for the organiser PIN.
              </span>
            </span>
            <span className="text-accent-deep flex-shrink-0" aria-hidden="true">→</span>
          </Link>
        </section>
      </div>
    </main>
  )
}
