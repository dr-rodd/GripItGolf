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
import { readContacts } from '../../matchContacts'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { allowanceOf } from '@/lib/handicapAllowance'
import { allowsParticipant } from '@/lib/eventPermissions'
import { splitCourseName } from '@/lib/courseDirectory'
import {
  contactShown, describeReceives, matchStrokes, parseMatchTees, shotHoles, walkoverChoices,
} from '@/lib/matchArrangements'
import MyHandicap from './MyHandicap'
import { MatchArrange, MatchWalkover } from './MatchActions'

export const dynamic = 'force-dynamic'

/**
 * One knockout match, from the hub's next-match card or the Scoring tab's
 * portal (docs/event-use-cases.md, story 2): who plays whom, in which
 * round, by when, the handicaps, and the result once there is one. A
 * player in the match amends their own handicap here before they play.
 *
 * **Arranging it** (stage 3): the course — a player's home club offered
 * first — the day, and each player's tee, from which the shots given and
 * received are worked out (lib/matchArrangements.ts) and listed hole by
 * hole. **Contact details**, each shown only as its player said (the field,
 * or the opponent). **A walkover**, conceded by a player or awarded by the
 * organiser. The arrangement columns arrive with migration 057 and are read
 * in their own fail-soft query, so the page stands without them.
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

  const [{ data: playerRows }, homesRes, arrangedRes] = await Promise.all([
    supabase.from('players')
      .select('id, name, handicap, claimed, gender')
      .eq('trip_id', trip.id)
      .eq('is_composite', false),
    // Migration 057's columns, each in its own fail-soft query: before it
    // runs the page shows the match without its arrangements.
    supabase.from('players').select('id, home_course_id').eq('trip_id', trip.id),
    supabase.from('matchplay_matches').select('course_id, played_on, tees')
      .eq('trip_id', trip.id).eq('id', matchId).maybeSingle(),
  ])
  const players = (playerRows ?? []) as {
    id: string; name: string; handicap: number | null; claimed: boolean | null; gender: string
  }[]
  const homeOf = new Map(((homesRes.data ?? []) as { id: string; home_course_id: string | null }[])
    .map(r => [r.id, r.home_course_id]))
  const arranged = arrangedRes.error ? null
    : (arrangedRes.data as { course_id: string | null; played_on: string | null; tees: unknown } | null)
  const arrangeable = !arrangedRes.error
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

  // ── The arrangement: the course, its tees and holes, and the shots ──
  const tees = parseMatchTees(arranged?.tees)
  const sideIds = [match.sideA, match.sideB].filter((x): x is string => !!x)
  const inMatchIds = sideIds.flatMap(id => view.members[id] ?? [])
  const [courseRes, teesRes, holesRes, contacts] = await Promise.all([
    arranged?.course_id
      ? supabase.from('courses').select('id, name').eq('id', arranged.course_id).maybeSingle()
      : Promise.resolve({ data: null }),
    arranged?.course_id
      ? supabase.from('tees').select('id, name, gender, slope, course_rating, par').eq('course_id', arranged.course_id)
      : Promise.resolve({ data: [] }),
    arranged?.course_id
      ? supabase.from('holes').select('hole_number, stroke_index, stroke_index_ladies').eq('course_id', arranged.course_id)
      : Promise.resolve({ data: [] }),
    readContacts(trip.id, inMatchIds),
  ])
  const course = courseRes.data as { id: string; name: string } | null
  const teeById = new Map(((teesRes.data ?? []) as {
    id: string; name: string | null; gender: string; slope: number | null; course_rating: number | null; par: number | null
  }[]).map(t => [t.id, t]))
  const holes = ((holesRes.data ?? []) as { hole_number: number; stroke_index: number; stroke_index_ladies: number | null }[])
    .map(h => ({ holeNumber: h.hole_number, strokeIndex: h.stroke_index, strokeIndexLadies: h.stroke_index_ladies }))
  const draw = boardsForTrip(trip).find(lb => lb.competition === 'matchplay')
  const strokes = matchStrokes(inMatchIds.map(id => {
    const t = tees[id] ? teeById.get(tees[id]) : undefined
    const rated = t && t.slope != null && t.course_rating != null && t.par != null
      ? { slope: t.slope, course_rating: t.course_rating, par: t.par } : null
    return { playerId: id, index: playerById.get(id)?.handicap ?? null, tee: rated }
  }), draw ? allowanceOf(draw) : 100)
  const strokeOf = new Map((strokes ?? []).map(s => [s.playerId, s]))

  // ── Who this phone is, against this match ──
  const myIds = me ? [me.id] : []
  const iAmIn = myIds.some(id => inMatchIds.includes(id))
  const mySide = view.entrantId && sideIds.includes(view.entrantId) ? view.entrantId : null
  const shownContact = (pid: string) => {
    const c = contacts.get(pid)
    if (!c) return null
    const theirSide = sideIds.find(id => (view.members[id] ?? []).includes(pid))
    return contactShown(c, {
      isSelf: me?.id === pid,
      isOpponent: !!mySide && !!theirSide && theirSide !== mySide,
    }) ? c : null
  }
  const concede = walkoverChoices(match, view.entrantId, false)[0] ?? null
  const awardable = walkoverChoices(match, null, true)
  const passcodeHash = (trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null
  const kind = (trip as { kind?: unknown }).kind
  const perms = (trip as { event_permissions?: unknown }).event_permissions

  const side = (id: string | null, label: string) => (
    <div className={`p-4 ${cardClass()}`}>
      <p className="t-cap text-ink/65">{label}</p>
      <p className="t-card text-ink mt-0.5">{nameOf(id) ?? 'To be decided'}</p>
      {id && (
        <ul className="mt-2 space-y-1">
          {(view.members[id] ?? []).map(pid => {
            const p = playerById.get(pid)
            if (!p) return null
            const stroke = strokeOf.get(pid)
            const tee = tees[pid] ? teeById.get(tees[pid]) : undefined
            const contact = shownContact(pid)
            const shotList = stroke ? shotHoles(stroke.receives, holes, p.gender) : []
            return (
              <li key={pid} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  {view.pairs && <span className="text-ink truncate">{p.name}</span>}
                  <span className="t-cap text-ink/65 tabular-nums">
                    {p.handicap == null ? HANDICAP_PENDING_LABEL : `Handicap ${formatHandicap(p.handicap)}`}
                    {tee && ` · ${tee.name ?? 'Tee'} tees`}
                  </span>
                </div>
                {stroke && (
                  <p className="t-cap text-ink/80 mt-0.5">
                    {describeReceives(stroke.receives)}
                    {shotList.length > 0 && ` · holes ${shotList.map(h => h.shots > 1 ? `${h.holeNumber} (${h.shots})` : `${h.holeNumber}`).join(', ')}`}
                  </p>
                )}
                {contact && (contact.phone || contact.email) && (
                  <p className="t-cap text-ink/65 mt-0.5 break-words">
                    {contact.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="text-accent-deep">{contact.phone}</a>}
                    {contact.phone && contact.email && ' · '}
                    {contact.email && <a href={`mailto:${contact.email}`} className="text-accent-deep">{contact.email}</a>}
                  </p>
                )}
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

        {/* ── Where and when ── */}
        {arrangeable && (
          <div className={`p-4 ${cardClass()}`}>
            <p className="t-cap text-ink/65">Venue</p>
            {course ? (
              <>
                <p className="t-card text-ink mt-0.5">{splitCourseName(course.name).club}</p>
                <p className="t-cap text-ink/65 mt-0.5">
                  {[splitCourseName(course.name).course, arranged?.played_on ? describeShortDate(arranged.played_on) : null]
                    .filter(Boolean).join(' · ')}
                </p>
                {!strokes && (
                  <p className="t-cap text-ink/80 mt-2 leading-snug">
                    The shots are worked out once every player has a handicap and a tee.
                  </p>
                )}
              </>
            ) : (
              <p className="text-ink/80 text-sm mt-0.5 leading-snug">
                Not arranged yet. Choose the course and each player’s tees, and the shots are worked out.
              </p>
            )}
            {!result && (
              <div className="mt-3">
                <MatchArrange
                  tripId={trip.id}
                  tripCode={tripCode}
                  matchId={match.id}
                  passcodeHash={passcodeHash}
                  inMatch={iAmIn}
                  allowAddCourse={allowsParticipant(kind, perms, 'add_courses')}
                  people={inMatchIds.flatMap(id => {
                    const p = playerById.get(id)
                    return p ? [{ id, name: p.name, gender: p.gender, homeCourseId: homeOf.get(id) ?? null }] : []
                  })}
                  courseId={arranged?.course_id ?? null}
                  playedOn={arranged?.played_on ?? null}
                  tees={tees}
                />
              </div>
            )}
          </div>
        )}

        {mine && me && me.claimed === true && !result && (
          <MyHandicap tripId={trip.id} playerId={me.id} handicap={me.handicap} roundIds={roundIds} />
        )}

        <div className="flex justify-center">
          <MatchWalkover
            tripId={trip.id}
            tripCode={tripCode}
            matchId={match.id}
            passcodeHash={passcodeHash}
            concedeTo={concede ? { id: concede, name: nameOf(concede) ?? 'your opponent' } : null}
            sides={awardable.map(id => ({ id, name: nameOf(id) ?? 'A player' }))}
            decided={match.winner !== null}
          />
        </div>

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
