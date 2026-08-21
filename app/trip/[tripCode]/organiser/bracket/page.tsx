import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { parseBracketSetup } from '@/lib/bracketSetup'
import BackButton from '@/app/components/BackButton'
import PasscodeGate from '../../setup/PasscodeGate'
import BracketSetupForm from './BracketSetupForm'

export const dynamic = 'force-dynamic'

/**
 * The bracket setup form — the organiser's seven answers, behind the same
 * PIN as the rest of the organiser area. Events only, exactly like the
 * organiser page it hangs off: a trip has no organiser and no bracket to
 * set up.
 *
 * The saved setup is fetched in its own query rather than named in the main
 * select, the same fail-soft the `kind` read keeps: on a database that has
 * not run migration 047 the column does not exist, that query errors, the
 * error is swallowed, and the form simply starts from the top. Only the
 * save needs the column, and it says so calmly when it is missing.
 */
export default async function BracketSetupPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  const [tripResult, setupResult] = await Promise.all([
    supabase
      .from('trips')
      .select('id, trip_code, name, kind, settings_passcode_hash')
      .eq('trip_code', tripCode)
      .single(),
    supabase
      .from('trips')
      .select('bracket_setup')
      .eq('trip_code', tripCode)
      .single(),
  ])

  const trip = tripResult.data
  if (tripResult.error) console.error('BracketSetupPage trip query failed:', tripResult.error)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">Event not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  if (!isEvent(trip.kind)) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center bg-cream px-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
          This is a trip
        </p>
        <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">
          Bracket setup belongs to events. A trip&apos;s knockout is set up in
          Trip Setup, on the tab bar below.
        </p>
        <BackButton href={`/trip/${tripCode}`} label="Trip" />
      </main>
    )
  }

  // Dropped rather than repaired if it is not a complete setup — the form
  // would rather start again than trust half an answer.
  const initialSetup = parseBracketSetup(
    (setupResult.data as { bracket_setup?: unknown } | null)?.bracket_setup
  )

  const content = (
    <BracketSetupForm
      tripId={trip.id}
      tripCode={tripCode}
      initialSetup={initialSetup}
    />
  )

  // The same gate as the organiser page, checking the same hash — and the
  // same fail-open when a row has no hash, rather than locking the
  // organiser out of their own event.
  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        title="Bracket setup"
        hint={`Enter the organiser PIN for ${trip.name}.`}
      >
        {content}
      </PasscodeGate>
    )
  }

  return content
}
