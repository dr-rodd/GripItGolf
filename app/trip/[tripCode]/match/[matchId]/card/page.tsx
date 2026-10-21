import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { currentPlayer } from '@/lib/currentPlayer'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { allowanceOf } from '@/lib/handicapAllowance'
import { isMine } from '@/lib/knockoutPortal'
import { matchStrokes, parseMatchTees } from '@/lib/matchArrangements'
import { splitCourseName } from '@/lib/courseDirectory'
import TripHeader from '@/app/components/TripHeader'
import BackButton from '@/app/components/BackButton'
import { buttonClass } from '@/app/components/ui'
import { readKnockout } from '../../../knockout'
import MatchCardClient, { type CardSideView } from './MatchCardClient'

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

  const [{ data: playerRows }, arrangedRes] = await Promise.all([
    supabase.from('players').select('id, name, handicap, claimed, gender')
      .eq('trip_id', trip.id).eq('is_composite', false),
    supabase.from('matchplay_matches').select('course_id, tees')
      .eq('trip_id', trip.id).eq('id', matchId).maybeSingle(),
  ])
  const players = (playerRows ?? []) as {
    id: string; name: string; handicap: number | null; claimed: boolean | null; gender: string
  }[]
  const me = await currentPlayer(tripCode, players)
  const view = await readKnockout(trip, (trip as { bracket_setup?: unknown }).bracket_setup, me?.id ?? null, players)
  const match = view?.matches.find(m => m.id === matchId)
  if (!view || !match) notFound()

  const arranged = arrangedRes.error ? null
    : (arrangedRes.data as { course_id: string | null; tees: unknown } | null)
  const courseId = arranged?.course_id ?? null
  const tees = parseMatchTees(arranged?.tees)
  const [courseRes, teesRes, holesRes] = await Promise.all([
    courseId ? supabase.from('courses').select('name').eq('id', courseId).maybeSingle() : Promise.resolve({ data: null }),
    courseId ? supabase.from('tees').select('id, slope, course_rating, par').eq('course_id', courseId) : Promise.resolve({ data: [] }),
    courseId
      ? supabase.from('holes').select('hole_number, par, stroke_index, stroke_index_ladies').eq('course_id', courseId).order('hole_number')
      : Promise.resolve({ data: [] }),
  ])
  const teeById = new Map(((teesRes.data ?? []) as {
    id: string; slope: number | null; course_rating: number | null; par: number | null
  }[]).map(t => [t.id, t]))
  const holes = ((holesRes.data ?? []) as { hole_number: number; par: number; stroke_index: number; stroke_index_ladies: number | null }[])
    .map(h => ({ holeNumber: h.hole_number, par: h.par, strokeIndex: h.stroke_index, strokeIndexLadies: h.stroke_index_ladies }))

  const playerById = new Map(players.map(p => [p.id, p]))
  const sideIds = [match.sideA, match.sideB]
  const inMatchIds = sideIds.flatMap(id => (id ? view.members[id] ?? [] : []))
  const draw = boardsForTrip(trip).find(lb => lb.competition === 'matchplay')
  const strokes = matchStrokes(inMatchIds.map(id => {
    const t = tees[id] ? teeById.get(tees[id]) : undefined
    const rated = t && t.slope != null && t.course_rating != null && t.par != null
      ? { slope: t.slope, course_rating: t.course_rating, par: t.par } : null
    return { playerId: id, index: playerById.get(id)?.handicap ?? null, tee: rated }
  }), draw ? allowanceOf(draw) : 100)
  const receivesOf = new Map((strokes ?? []).map(s => [s.playerId, s.receives]))

  const side = (id: string | null): CardSideView | null => id ? {
    id,
    name: view.names[id] ?? 'A player',
    players: (view.members[id] ?? []).flatMap(pid => {
      const p = playerById.get(pid)
      return p ? [{ id: pid, name: p.name, gender: p.gender, receives: receivesOf.get(pid) ?? 0 }] : []
    }),
  } : null
  const a = side(match.sideA)
  const b = side(match.sideB)
  const ready = !!a && !!b && !!strokes && holes.length >= 18
  const named = courseRes.data ? splitCourseName((courseRes.data as { name: string }).name) : null

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

        {ready ? (
          <MatchCardClient
            tripId={trip.id}
            tripCode={tripCode}
            matchId={matchId}
            a={a}
            b={b}
            holes={holes.slice(0, 18)}
            inMatch={!!view.entrantId && isMine(match, view.entrantId)}
            passcodeHash={(trip as { settings_passcode_hash?: string | null }).settings_passcode_hash ?? null}
            stored={{ winner: match.winner, result: match.result }}
          />
        ) : (
          <div className="text-center">
            <p className="text-ink/80 text-sm leading-snug">
              {!a || !b
                ? 'Both sides of this match are not known yet.'
                : holes.length < 18
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
