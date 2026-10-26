import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { currentPlayer } from '@/lib/currentPlayer'
import { isConfirmed } from '@/lib/roster'
import { ownColoursOffered } from '@/lib/playerColours'
import { SITE } from '@/config/site'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import { PreferencesPanel } from '@/app/components/PlayerSettings'
import { SectionTitle, cardClass } from '@/app/components/ui'
import { fetchTripKind } from '../kind'

export const dynamic = 'force-dynamic'

const LINK = 'text-accent-deep underline underline-offset-2 hover:text-accent transition-colors'

/**
 * An event's Settings tab — the player's own, with the door to the
 * organiser's. The bottom-right tab, where a trip keeps Trip Setup (Ross,
 * 26 Oct 2026); the tee sheet that stood there is a home screen module now.
 *
 * Who this phone is (and switching it), this phone's preferences — the same
 * panel a trip's hub opens from its gear (`PreferencesPanel`), so an event's
 * hub carries no gear — the organiser area for whoever holds the PIN, and
 * help & privacy. Green Dot Run's Settings is the model: the PIN asks at
 * the organiser's door, not at this tab, so a player opening Settings is
 * never met by a lock. While the event has no sides, the preferences carry
 * the player's own colour too (lib/playerColours.ts).
 *
 * Events only. A trip's settings are Trip Setup, so a trip landing here is
 * sent there.
 */
export default async function EventSettingsPage({ params }: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  // The kind alongside, never inside the select — the kind.ts rule. The
  // field rides in as an embed, one hop rather than two.
  const [kind, { data: trip, error }] = await Promise.all([
    fetchTripKind(tripCode),
    supabase
      .from('trips')
      .select('id, name, players(id, name, claimed, is_composite)')
      .eq('trip_code', tripCode)
      .single(),
  ])
  if (error) console.error('EventSettingsPage trip query failed:', error)

  if (!trip) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center paper px-6">
        <p className="t-h2 text-ink mb-3">Event not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  if (!isEvent(kind)) redirect(`/trip/${tripCode}/setup`)

  type Row = { id: string; name: string; claimed: boolean | null; is_composite: boolean | null }
  // A composite is a synthetic scorecard, not a person.
  const roster = ((trip.players ?? []) as Row[]).filter(p => p.is_composite !== true)
  // The teams say whether there are sides yet, which is what decides the
  // colour picker. Its own query rather than an embed — players point at
  // teams too, so `teams(...)` on trips could be read two ways — taken
  // beside the cookie read.
  const [me, { data: teams, error: teamsError }] = await Promise.all([
    currentPlayer(tripCode, roster),
    supabase.from('teams').select('id, name, team_set').eq('trip_id', trip.id),
  ])
  if (teamsError) console.error('EventSettingsPage teams query failed:', teamsError)
  const claimed = me && isConfirmed(me) ? me : null
  // A failed read offers nothing rather than guessing there are no sides.
  const colourPicker = !teamsError && ownColoursOffered(true, teams ?? [])

  return (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={`/trip/${tripCode}`} title="settings" />
      <div className="max-w-lg mx-auto px-4 pt-6 pb-16 page-enter space-y-8">

        <section>
          <SectionTitle className="mb-3">You</SectionTitle>
          <div className={`p-4 ${cardClass()}`}>
            {claimed ? (
              <>
                <p className="text-ink text-sm font-medium">{claimed.name}</p>
                <p className="text-ink/65 text-[13px] mt-0.5">Playing in {trip.name}</p>
                <Link
                  href={`/trip/${tripCode}/players`}
                  className="inline-block t-cap text-accent-deep hover:text-accent transition-colors mt-3"
                >
                  Not you? Switch name
                </Link>
              </>
            ) : (
              <>
                <p className="text-ink/80 text-sm">This phone has not claimed a name in the event.</p>
                <Link
                  href={`/trip/${tripCode}/players`}
                  className="inline-block t-cap text-accent-deep hover:text-accent transition-colors mt-3"
                >
                  Claim your spot →
                </Link>
              </>
            )}
          </div>
        </section>

        <section>
          <SectionTitle className="mb-3">This phone</SectionTitle>
          <div className={`p-4 ${cardClass()}`}>
            <PreferencesPanel tripId={trip.id} playerId={claimed?.id ?? null} colourPicker={colourPicker} />
          </div>
        </section>

        <section>
          <SectionTitle className="mb-3">Organiser</SectionTitle>
          <Link
            href={`/trip/${tripCode}/organiser`}
            className={`flex items-center justify-between gap-4 p-4 ${cardClass('raised', true)}`}
          >
            <span className="min-w-0">
              <span className="block text-ink text-sm font-medium">Organiser area</span>
              <span className="block text-ink/65 text-[13px] mt-0.5 leading-snug">
                Notices, starts, the home screen, permissions and the formats. Asks for the organiser PIN.
              </span>
            </span>
            <span className="text-accent-deep flex-shrink-0" aria-hidden="true">→</span>
          </Link>
        </section>

        <section>
          <SectionTitle className="mb-3">Help &amp; privacy</SectionTitle>
          <div className={`p-4 ${cardClass()}`}>
            <p className="text-ink/80 text-[13px] leading-snug">
              Questions, or anything about your data: write to{' '}
              <a href={`mailto:${SITE.supportEmail}`} className={LINK}>{SITE.supportEmail}</a>.
            </p>
            <p className="text-[13px] mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/privacy" className={LINK}>Privacy notice</Link>
              <Link href="/terms" className={LINK}>Terms</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
