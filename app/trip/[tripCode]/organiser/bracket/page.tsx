import { supabase } from '@/lib/supabase'
import { isEvent } from '@/lib/eventHub'
import { isLocked } from '@/lib/passcode'
import { isKnockoutEvent, parseBracketSetup, rawDrawPlan } from '@/lib/bracketSetup'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { needsPairings } from '@/lib/leaderboards'
import { MAIN_SET, setOf } from '@/lib/teamSets'
import { fetchEntrants } from '@/lib/matchplayStore'
import { readDrawState } from '@/lib/drawStore'
import { parseLeagueSetup, describeLeagueSetup } from '@/lib/leagueSetup'
import BackButton from '@/app/components/BackButton'
import TripHeader from '@/app/components/TripHeader'
import PasscodeGate from '../../setup/PasscodeGate'
import BracketFlow from './BracketFlow'
import { cardClass } from '@/app/components/ui'

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
      .select('id, trip_code, name, kind, settings_passcode_hash, start_date, leaderboards, formats, team_scoring')
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
      <main className="min-h-dvh flex flex-col items-center justify-center paper px-6">
        <p className="t-h2 text-ink mb-3">Event not found</p>
        <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
        <BackButton href="/" label="Home" />
      </main>
    )
  }

  if (!isEvent(trip.kind)) {
    return (
      <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center paper px-6 text-center">
        <p className="t-h2 text-ink mb-3">
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

  // A match play event's setup, every unanswered question at its default
  // (lib/bracketSetup.ts); a league's, its own.
  const setupRaw = (setupResult.data as { bracket_setup?: unknown } | null)?.bracket_setup
  const setup = parseBracketSetup(setupRaw)
  const leagueSetup = parseLeagueSetup(setupRaw)

  let content: React.ReactNode

  if (leagueSetup) {
    // A league event. Its structure was created whole through the league
    // door and lives in the same column, so this screen must describe it —
    // never offer the match play form, whose save would overwrite the
    // league with a bracket. Day count comes from the rounds, the one copy
    // of how many days there are.
    const { count } = await supabase
      .from('rounds')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip.id)

    content = (
      <main className="min-h-dvh paper has-tabbar page-enter">
        <TripHeader backTo={`/trip/${tripCode}/organiser`} />
        <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
          <h1 className="t-h1 text-ink mb-1">
            League
          </h1>
          <p className="text-ink/65 text-sm mb-6">
            {describeLeagueSetup(leagueSetup, count || 1)}
          </p>
          <div className={`p-4 ${cardClass()}`}>
            <p className="text-ink/65 text-[13px] leading-snug">
              Days, venues and field were set when the league was created.
            </p>
          </div>
          <div className="mt-6">
            <BackButton href={`/trip/${tripCode}/organiser`} label="Organiser" />
          </div>
        </div>
      </main>
    )
  } else if (setup && isKnockoutEvent(setupRaw)) {
    // The field, the draw made and how far it has got, and its first round
    // to open the bracket on — all scoped to this event.
    const boards = boardsForTrip(trip)
    const board = boards.find(lb => lb.competition === 'matchplay')
    const kind = needsPairings(boards) ? 'pair' as const : 'player' as const
    const [entrants, state, matchesRes] = await Promise.all([
      fetchEntrants(trip.id, kind, board ? setOf(board) : MAIN_SET).catch(() => []),
      readDrawState(supabase, trip.id).catch(() => ({ drawn: false, inPlay: false })),
      supabase.from('matchplay_matches')
        .select('round_number, slot, player_a_id, player_b_id, team_a_id, team_b_id, entrant_type, seed_a, seed_b')
        .eq('trip_id', trip.id),
    ])
    type Row = {
      round_number: number; slot: number; player_a_id: string | null; player_b_id: string | null
      team_a_id: string | null; team_b_id: string | null; entrant_type: string | null
      seed_a: number | null; seed_b: number | null
    }
    const rows = (matchesRes.data ?? []) as Row[]
    const drawnRounds = rows.reduce((n, r) => Math.max(n, r.round_number), 0)
    let existing: { slots: (string | null)[]; seeds: (number | null)[] } | null = null
    if (drawnRounds > 0) {
      const slots: (string | null)[] = Array(2 ** drawnRounds).fill(null)
      const seeds: (number | null)[] = Array(2 ** drawnRounds).fill(null)
      for (const r of rows.filter(m => m.round_number === 1)) {
        const pair = r.entrant_type === 'pair'
        slots[2 * r.slot] = (pair ? r.team_a_id : r.player_a_id) ?? null
        slots[2 * r.slot + 1] = (pair ? r.team_b_id : r.player_b_id) ?? null
        seeds[2 * r.slot] = slots[2 * r.slot] ? r.seed_a : null
        seeds[2 * r.slot + 1] = slots[2 * r.slot + 1] ? r.seed_b : null
      }
      existing = { slots, seeds }
    }
    content = (
      <BracketFlow
        tripId={trip.id}
        tripCode={tripCode}
        kind={kind}
        entrants={entrants.map(e => ({ id: e.id, name: e.name, handicap: e.handicap }))}
        drawn={state.drawn}
        inPlay={state.inPlay}
        drawnRounds={drawnRounds}
        plan={rawDrawPlan(setupRaw)}
        setup={setup}
        existing={existing}
        startDate={(trip as { start_date?: string | null }).start_date ?? null}
      />
    )
  } else {
    // Neither a knockout nor a league: nothing of a bracket's to set.
    content = (
      <main className="min-h-dvh paper has-tabbar page-enter">
        <TripHeader backTo={`/trip/${tripCode}/organiser`} />
        <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
          <h1 className="t-h1 text-ink mb-1">No bracket</h1>
          <p className="text-ink/65 text-sm mb-6">
            A match play event is made from Create an event, Golf tournament, Match play.
          </p>
          <BackButton href={`/trip/${tripCode}/organiser`} label="Organiser" />
        </div>
      </main>
    )
  }

  // The same gate as the organiser page, checking the same hash — and the
  // same fail-open when a row has no hash, rather than locking the
  // organiser out of their own event.
  if (isLocked(trip.settings_passcode_hash)) {
    return (
      <PasscodeGate
        tripCode={tripCode}
        tripName={trip.name}
        passcodeHash={trip.settings_passcode_hash as string}
        title="The bracket"
        hint={`Enter the organiser PIN for ${trip.name}.`}
      >
        {content}
      </PasscodeGate>
    )
  }

  return content
}
