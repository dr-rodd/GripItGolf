import { redirect } from 'next/navigation'
import BackButton from '@/app/components/BackButton'
import PasscodeGate from '@/app/trip/[tripCode]/setup/PasscodeGate'
import { describeRange } from '@/lib/confirmationEmail'
import { todayString } from '@/lib/tripStatus'
import { isLocked } from '@/lib/passcode'
import { isRunChallenge, describeProgress } from '@/lib/runChallenge'
import { fetchRunChallenge } from '../data'
import RunOrganiserClient from './RunOrganiserClient'

export const dynamic = 'force-dynamic'

/**
 * A run challenge's organiser area — the admin link in the confirmation
 * email, behind the organiser PIN.
 *
 * The same PasscodeGate golf's organiser area and Trip Setup stand behind,
 * checking the same hash and writing the same session memory: one PIN, and
 * anyone the organiser shares it with is an admin too. The same honesty
 * applies — a soft lock, not a security boundary (lib/passcode.ts).
 *
 * The overview, the dates (extend until final), the participant
 * permissions (saved on the spot), the team editor — add, rename and remove
 * teams; add, rename, move and remove runners — and the points rules.
 */
export default async function RunOrganiserPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  const challenge = await fetchRunChallenge(tripCode)

  if (!challenge) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center paper px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
          Challenge not found
        </p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }
  if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}/organiser`)

  const client = (
    <RunOrganiserClient
      challenge={challenge}
      dates={describeRange(challenge.startDate, challenge.endDate)}
      progress={describeProgress(challenge.startDate, challenge.endDate, todayString(new Date()))}
    />
  )

  if (!isLocked(challenge.passcodeHash)) return client

  return (
    <PasscodeGate
      tripCode={challenge.code}
      tripName={challenge.name}
      passcodeHash={challenge.passcodeHash as string}
      title="Organiser area"
      hint={`Enter the PIN set when ${challenge.name} was created.`}
    >
      {client}
    </PasscodeGate>
  )
}
