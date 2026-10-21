import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { currentPlayer } from '@/lib/currentPlayer'
import { isMine } from '@/lib/knockoutPortal'
import { splitCourseName } from '@/lib/courseDirectory'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import { buttonClass } from '@/app/components/ui'
import { readKnockout } from '../../../knockout'
import { readCardSetups } from '../../matchCards'
import MatchCardClient from './MatchCardClient'

export const dynamic = 'force-dynamic'

/**
 * A knockout match's own scorecard (docs/event-use-cases.md, story 2,
 * stage 4) — the top of the draw on the left, the bottom on the right, each
 * player's gross a hole with the shots they receive marked, and a concede
 * button for each side. The rules are lib/matchCard.ts's; this page hands
 * the card its holes, its sides and their shots, which come off the
 * arrangement (the course and each player's tee — the match page's job,
 * so a match not yet arranged is sent back there).
 */
export default async function MatchCardPage({
  params,
}: {
  params: Promise<{ tripCode: string; matchId: string }>
}) {
  const { tripCode, matchId } = await params

  const { data: trip } = await supabase.from('trips').select('*').eq('trip_code', tripCode).single()
  if (!trip) notFound()

  const { data: playerRows } = await supabase.from('players').select('id, name, handicap, claimed, gender')
    .eq('trip_id', trip.id).eq('is_composite', false)
  const players = (playerRows ?? []) as {
    id: string; name: string; handicap: number | null; claimed: boolean | null; gender: string
  }[]
  const me = await currentPlayer(tripCode, players)
  const view = await readKnockout(trip, (trip as { bracket_setup?: unknown }).bracket_setup, me?.id ?? null, players)
  const match = view?.matches.find(m => m.id === matchId)
  if (!view || !match) notFound()

  const setup = (await readCardSetups(trip, view, players, [matchId])).get(matchId)
  const card = setup?.card ?? null
  const named = setup?.courseName ? splitCourseName(setup.courseName) : null
  const mySide = !view.entrantId || !isMine(match, view.entrantId) ? null
    : match.sideA === view.entrantId ? 'A' as const : 'B' as const

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <BackButton href={`/trip/${tripCode}/match/${matchId}`} label="Match" />
      </div>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <header className="text-center mb-5">
          <p className="t-label text-ink/65">{match.roundName}{named ? ` · ${named.club}` : ''}</p>
          <h1 className="t-h2 text-ink mt-1">Match card</h1>
        </header>

        {card ? (
          <MatchCardClient
            tripId={trip.id}
            tripCode={tripCode}
            matchId={matchId}
            a={card.a}
            b={card.b}
            holes={card.holes}
            mySide={mySide}
            passcodeHash={(trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null}
            stored={{ winner: match.winner, result: match.result }}
          />
        ) : (
          <div className="text-center">
            <p className="text-ink/80 text-sm leading-snug">
              {setup?.blocked === 'sides'
                ? 'Both sides of this match are not known yet.'
                : setup?.blocked === 'scorecard'
                  ? 'This course has no scorecard yet, so the match cannot be scored here.'
                  : 'Arrange the match first — the course and each player’s tees — so the shots can be worked out.'}
            </p>
            <Link href={`/trip/${tripCode}/match/${matchId}`} className={`${buttonClass('secondary')} mt-4`}>
              Back to the match
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
