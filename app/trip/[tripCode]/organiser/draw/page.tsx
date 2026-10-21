import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { isKnockoutEvent, parseBracketSetup, rawDrawPlan } from '@/lib/bracketSetup'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { needsPairings } from '@/lib/leaderboards'
import { MAIN_SET, setOf } from '@/lib/teamSets'
import { MAX_BRACKET } from '@/lib/matchplay'
import { fetchEntrants } from '@/lib/matchplayStore'
import { readDrawState } from '@/lib/drawStore'
import BackButton from '@/app/components/BackButton'
import TripHeader from '@/app/components/TripHeader'
import PasscodeGate from '../../setup/PasscodeGate'
import DrawClient from './DrawClient'

export const dynamic = 'force-dynamic'

/**
 * The draw (docs/event-use-cases.md, story 2, "The draw") — made here at
 * random, seeded or by hand from the field as it stands, or planned for a
 * date and made overnight. Behind the organiser PIN, like the rest of the
 * organiser area. Once the draw is in play it is not redrawn from here.
 */
export default async function DrawPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params
  const [{ data: trip }, setupRes] = await Promise.all([
    supabase.from('trips').select('id, name, kind, settings_passcode_hash, leaderboards, formats, team_scoring')
      .eq('trip_code', tripCode).single(),
    supabase.from('trips').select('bracket_setup').eq('trip_code', tripCode).maybeSingle(),
  ])
  const raw = (setupRes.data as { bracket_setup?: unknown } | null)?.bracket_setup ?? null

  if (!trip || !isEvent(trip.kind) || !isKnockoutEvent(raw)) {
    return (
      <main className="min-h-dvh paper has-tabbar flex flex-col items-center justify-center px-6 text-center">
        <p className="t-h2 text-ink mb-3">No draw to make</p>
        <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">The draw belongs to a match play event.</p>
        <BackButton href={`/trip/${tripCode}`} label="Event" />
      </main>
    )
  }

  const boards = boardsForTrip(trip)
  const board = boards.find(lb => lb.competition === 'matchplay')
  const kind = needsPairings(boards) ? 'pair' as const : 'player' as const
  const [entrants, state] = await Promise.all([
    fetchEntrants(trip.id, kind, board ? setOf(board) : MAIN_SET).catch(() => []),
    readDrawState(supabase, trip.id).catch(() => ({ drawn: false, inPlay: false })),
  ])

  const content = (
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={`/trip/${tripCode}`} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <BackButton href={`/trip/${tripCode}/organiser`} label="Organiser area" />
      </div>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-12">
        <h1 className="t-h1 text-ink mb-1">The draw</h1>
        <p className="text-ink/65 text-sm mb-6 leading-snug">{trip.name}</p>
        <DrawClient
          tripId={trip.id}
          tripCode={tripCode}
          kind={kind}
          entrants={entrants.map(e => ({ id: e.id, name: e.name, handicap: e.handicap }))}
          ceiling={parseBracketSetup(raw)?.size ?? MAX_BRACKET}
          state={state}
          plan={rawDrawPlan(raw)}
        />
      </div>
    </main>
  )

  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        title="The draw"
        hint={`Enter the organiser PIN for ${trip.name}.`}
      >
        {content}
      </PasscodeGate>
    )
  }
  return content
}
