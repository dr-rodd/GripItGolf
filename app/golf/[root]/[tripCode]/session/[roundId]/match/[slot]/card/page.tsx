import { notFound } from 'next/navigation'
import { isEvent } from '@/lib/eventHub'
import OrganiserLock from '@/app/components/OrganiserLock'
import Link from 'next/link'
import { eventReader } from '@/lib/eventReader'
import { currentPlayer } from '@/lib/currentPlayer'
import { splitCourseName } from '@/lib/courseDirectory'
import { allowsParticipant } from '@/lib/eventPermissions'
import { sideColours } from '@/lib/matchSides'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { overallOf, sessionName, MATCH_FORMATS } from '@/lib/sessions'
import { tagOfTeam } from '@/lib/tagBoards'
import TripHeader from '@/app/components/TripHeader'
import { IconChevronLeft } from '@/app/components/icons'
import { buttonClass, cardClass } from '@/app/components/ui'
import ScorecardGate from '@/app/components/ScorecardGate'
import MatchCardClient from '../../../../../match/[matchId]/card/MatchCardClient'
import SessionTees from './SessionTees'
import { readSessionCards, type SessionMatchRow } from '../../../../sessionMatches'
import { tripHomeAt } from '@/lib/tripPaths'
import { isLocked } from '@/lib/passcode'

export const dynamic = 'force-dynamic'

/**
 * A session match's card (lib/sessions.ts, D44): the Knockout's card, in its
 * session mode — eighteen holes, a half a result, the result onto the
 * match's own row. Its sides are the session's left and right, coloured by
 * their tags where they have them (lib/matchSides.ts).
 */
export default async function SessionMatchCardPage({ params, searchParams }: {
  params: Promise<{ root: string; tripCode: string; roundId: string; slot: string }>
  /** `view=scorecard` — from the leaderboard: the match hole by hole, not the card to score. */
  searchParams: Promise<{ view?: string }>
}) {
  const [{ root, tripCode, roundId, slot }, { view }] = await Promise.all([params, searchParams])
  const db = eventReader(tripCode)
  const tripHome = tripHomeAt(root, tripCode)
  const slotNo = Number(slot)
  if (!Number.isInteger(slotNo) || slotNo < 0) notFound()

  const { data: trip } = await db.from('trips').select('*').eq('trip_code', tripCode).single()
  if (!trip) notFound()

  const [playersRes, teamsRes, membersRes, roundRes, matchRes] = await Promise.all([
    db.from('players').select('id, name, handicap, claimed, gender').eq('trip_id', trip.id).eq('is_composite', false),
    db.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id),
    db.from('team_members').select('team_id, team_set, player_id').eq('trip_id', trip.id),
    db.from('rounds').select('id, round_number').eq('trip_id', trip.id).eq('id', roundId).maybeSingle(),
    db.from('session_matches').select('id, round_id, slot, side_a, side_b, result, margin, tees')
      .eq('trip_id', trip.id).eq('round_id', roundId).eq('slot', slotNo).maybeSingle(),
  ])
  if (!roundRes.data) notFound()
  const players = (playersRes.data ?? []) as { id: string; name: string; handicap: number | null; claimed: boolean | null; gender: string }[]
  const teams = (teamsRes.data ?? []) as { id: string; name: string; color: string; team_set: string | null }[]
  const memberships = (membersRes.data ?? []) as { team_id: string; team_set: string; player_id: string }[]
  const boards = boardsForTrip(trip)
  const rules = overallOf(boards)?.overall
  const label = `${sessionName(rules, roundId, roundRes.data.round_number)} · Match ${slotNo + 1}`
  const row = matchRes.data as SessionMatchRow | null
  const me = await currentPlayer(tripCode, players)

  const back = `${tripHome}/scoring`
  const header = (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3">
      <Link href={back} className={`justify-self-start h-10 pl-2 pr-3 inline-flex items-center gap-0.5 t-label text-ink/80 ${cardClass('raised', true)}`}>
        <IconChevronLeft size={18} /> Back
      </Link>
      <p className="t-cap text-ink/65 text-center leading-tight max-w-[44vw] truncate">{label}</p>
      <span aria-hidden="true" />
    </header>
  )

  if (!row) {
    return (
      <main className="min-h-dvh paper has-tabbar page-enter">
        <TripHeader backTo={tripHome} />
        <div className="max-w-lg mx-auto px-4 pt-3 pb-8">
          {header}
          <p className="text-ink/80 text-sm text-center leading-snug">This match has not been set yet.</p>
          <div className="text-center"><Link href={back} className={`${buttonClass('secondary')} mt-4`}>Back to Scoring</Link></div>
        </div>
      </main>
    )
  }

  const [{ setups }, scoredRes] = await Promise.all([
    readSessionCards(db, trip, boards, players, { teams, memberships }, [row]),
    // Whether the card is under way — the tees are fixed once it is.
    db.from('session_match_scores').select('match_id', { count: 'exact', head: true })
      .eq('trip_id', trip.id).eq('match_id', row.id),
  ])
  // A failed count reads as under way: the safer answer, it only locks the tees.
  const underWay = !!scoredRes.error || (scoredRes.count ?? 0) > 0
  const setup = setups.get(row.id)!
  const card = setup.card
  const named = setup.courseName ? splitCourseName(setup.courseName) : null
  const tagColour = (ids: string[]) => {
    const tag = ids.length ? tagOfTeam(ids, memberships) : null
    return tag ? teams.find(t => t.id === tag)?.color ?? null : null
  }
  const mySide = me && row.side_a.includes(me.id) ? 'A' as const : me && row.side_b.includes(me.id) ? 'B' as const : null
  const stored = {
    winner: row.result === 'halved' ? 'halved' : row.result === 'a' ? `${row.id}:A` : row.result === 'b' ? `${row.id}:B` : null,
    result: row.margin,
  }
  const format = MATCH_FORMATS.find(f => f.key === setup.format)?.label ?? 'Match'

  // The organiser's lock, at the header's right edge (OrganiserLock).
  const organiserLock = <OrganiserLock tripCode={tripCode} pinSet={isLocked((trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null)} isTrip={!isEvent((trip as { kind?: unknown }).kind)} />

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={tripHome} action={organiserLock} />
      <div className="max-w-lg mx-auto px-4 pt-3 pb-8">
        {card ? (
          <>
            <SessionTees
              tripId={trip.id}
              matchId={row.id}
              players={[...row.side_a, ...row.side_b].map(id => ({ id, name: players.find(p => p.id === id)?.name ?? 'A player' }))}
              tees={setup.tees}
              choices={setup.teeChoices}
              underWay={underWay}
              finished={!!row.result}
              tripCode={tripCode}
              pinSet={isLocked((trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null)}
              inMatch={mySide !== null}
            />
            <MatchCardClient
              startOn={view === 'scorecard' ? 'scorecard' : 'card'}
              session
              backHref={back}
              roundName={`${label} · ${format}`}
              club={named?.club ?? null}
              courseId={setup.courseId ?? null}
              tripId={trip.id}
              tripCode={tripCode}
              matchId={row.id}
              a={card.a}
              b={card.b}
              holes={card.holes}
              mySide={mySide}
              pinSet={isLocked((trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null)}
              stored={stored}
              colours={sideColours(tagColour(row.side_a), tagColour(row.side_b))}
              anyoneScores={allowsParticipant(
                (trip as { kind?: unknown }).kind,
                (trip as { event_permissions?: unknown }).event_permissions,
                'score_session_matches',
              )}
            />
          </>
        ) : (
          <>
            {header}
            {(setup.blocked === 'scorecard' || setup.blocked === 'unrated') && setup.courseId ? (
              // The one scorecard gate (D68): the photo, then the card in place.
              <ScorecardGate
                blocker={setup.blocked === 'scorecard' ? 'none' : 'unrated'}
                courseId={setup.courseId}
                tripCode={tripCode}
                event={isEvent((trip as { kind?: unknown }).kind)}
                match={{
                  decided: !!row.result,
                  inMatch: mySide !== null,
                  anyoneScores: allowsParticipant(
                    (trip as { kind?: unknown }).kind,
                    (trip as { event_permissions?: unknown }).event_permissions,
                    'score_session_matches',
                  ),
                  pinSet: isLocked((trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null),
                }}
              />
            ) : (
            <p className="text-ink/80 text-sm text-center leading-snug">
              {setup.blocked === 'sides' ? 'Both sides of this match are not set yet.'
                : 'Every player needs a handicap and a rated tee before the shots can be worked out.'}
            </p>
            )}
            <div className="text-center"><Link href={back} className={`${buttonClass('secondary')} mt-4`}>Back to Scoring</Link></div>
          </>
        )}
      </div>
    </main>
  )
}
