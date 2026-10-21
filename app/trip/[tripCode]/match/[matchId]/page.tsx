import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { currentPlayer } from '@/lib/currentPlayer'
import { describeShortDate } from '@/lib/itinerary'
import { deadlineNote } from '@/lib/bracketSetup'
import { describeResult, isMine, portalRounds } from '@/lib/knockoutPortal'
import { formatHandicap, HANDICAP_PENDING_LABEL } from '@/lib/handicap'
import { todayString } from '@/lib/tripStatus'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import { cardClass } from '@/app/components/ui'
import { readKnockout } from '../../knockout'
import MyHandicap from './MyHandicap'

export const dynamic = 'force-dynamic'

/**
 * One knockout match, from the hub's next-match card or the Scoring tab's
 * portal (docs/event-use-cases.md, story 2): who plays whom, in which
 * round, by when, the handicaps, and the result once there is one. A
 * player in the match amends their own handicap here before they play.
 *
 * Choosing the venue (and with it the shots given and received) and the
 * match play card follow in the next stages — this is the page they hang
 * off. The result is still recorded on the bracket, by the long press.
 */
export default async function MatchPage({
  params,
}: {
  params: Promise<{ tripCode: string; matchId: string }>
}) {
  const { tripCode, matchId } = await params

  const { data: trip } = await supabase
    .from('trips')
    .select('*, rounds(id)')
    .eq('trip_code', tripCode)
    .single()
  if (!trip) notFound()

  const { data: playerRows } = await supabase
    .from('players')
    .select('id, name, handicap, claimed')
    .eq('trip_id', trip.id)
    .eq('is_composite', false)
  const players = (playerRows ?? []) as { id: string; name: string; handicap: number | null; claimed: boolean | null }[]
  const me = await currentPlayer(tripCode, players)

  const view = await readKnockout(trip, (trip as { bracket_setup?: unknown }).bracket_setup, me?.id ?? null, players)
  const match = view?.matches.find(m => m.id === matchId)
  if (!view || !match) notFound()

  const round = portalRounds(view.matches, view.entrantId, view.deadlines)
    .find(r => r.roundNumber === match.roundNumber)
  const today = todayString(new Date())
  const due = round?.deadline
    ? deadlineNote(round.deadline, describeShortDate(round.deadline) ?? round.deadline,
        { today, finished: match.winner !== null })
    : null
  const nameOf = (id: string | null) => (id ? view.names[id] ?? null : null)
  const result = describeResult(match, nameOf)
  const playerById = new Map(players.map(p => [p.id, p]))
  const mine = isMine(match, view.entrantId)
  const roundIds = ((trip as { rounds?: { id: string }[] }).rounds ?? []).map(r => r.id)

  const side = (id: string | null, label: string) => (
    <div className={`p-4 ${cardClass()}`}>
      <p className="t-cap text-ink/65">{label}</p>
      <p className="t-card text-ink mt-0.5">{nameOf(id) ?? 'To be decided'}</p>
      {id && (
        <ul className="mt-2 space-y-1">
          {(view.members[id] ?? []).map(pid => {
            const p = playerById.get(pid)
            if (!p) return null
            return (
              <li key={pid} className="flex items-center justify-between gap-3 text-sm">
                {view.pairs && <span className="text-ink truncate">{p.name}</span>}
                <span className="t-cap text-ink/65 tabular-nums">
                  {p.handicap == null ? HANDICAP_PENDING_LABEL : `Handicap ${formatHandicap(p.handicap)}`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <BackButton href={`/trip/${tripCode}/scoring`} label="Scoring" />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 flex flex-col gap-4">
        <header className="text-center mb-2">
          <p className="t-label text-ink/65">{match.roundName}</p>
          <h1 className="t-h1 text-ink mt-1">
            {nameOf(match.sideA) ?? 'To be decided'} v {nameOf(match.sideB) ?? 'To be decided'}
          </h1>
          {result ? (
            <p className="t-cap text-accent-deep mt-2">{result}</p>
          ) : due && (
            <p className={`t-cap mt-2 ${due.startsWith('Was due') ? 'text-rust-deep' : 'text-ink/65'}`}>{due}</p>
          )}
        </header>

        {side(match.sideA, mine && match.sideA === view.entrantId ? 'You' : view.pairs ? 'Pairing' : 'Player')}
        {side(match.sideB, mine && match.sideB === view.entrantId ? 'You' : view.pairs ? 'Pairing' : 'Player')}

        {mine && me && me.claimed === true && !result && (
          <MyHandicap tripId={trip.id} playerId={me.id} handicap={me.handicap} roundIds={roundIds} />
        )}

        <p className="t-cap text-ink/65 text-center leading-snug mt-2">
          The result goes on the bracket — hold the match there to record it.
        </p>
        <p className="text-center">
          <Link href={`/trip/${tripCode}/matchplay`} className="t-cap text-accent-deep hover:text-accent">
            See the whole bracket →
          </Link>
        </p>
      </div>
    </main>
  )
}
