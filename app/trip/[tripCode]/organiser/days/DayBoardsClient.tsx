'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import LeaderboardSetup from '@/app/components/LeaderboardSetup'
import {
  type Leaderboard, boardTitle, boardRules,
} from '@/lib/leaderboards'
import { type DayBoards, DAY_BOARDS, boardGrouping } from '@/lib/leagueSetup'

/**
 * A format for each day.
 *
 * One card per round. A day with no board of its own is scored by the
 * overall board like every other; adding one gives that day a competition
 * in its own right, and the overall board goes on counting the lot unless
 * the event said its days are separate.
 *
 * The board itself is made on the same cascade every board is made on —
 * `LeaderboardSetup`, handed only that day's round — so a day format can
 * be anything a board can be. What this screen adds is the scope: whatever
 * comes back is stamped with the round it was made under.
 */

type Round = { id: string; roundNumber: number; courseName: string | null }

export default function DayBoardsClient({
  tripId, tripCode, rounds, initialBoards, playerCount, teamCount, dayBoards,
}: {
  tripId: string
  tripCode: string
  rounds: Round[]
  initialBoards: Leaderboard[]
  playerCount: number
  teamCount: number
  /** How the event said its days relate, for the line at the top. */
  dayBoards?: DayBoards
}) {
  const [boards, setBoards] = useState<Leaderboard[]>(initialBoards)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { overall } = boardGrouping(boards, dayBoards)
  const boardsFor = (roundId: string) =>
    boards.filter(b => b.roundIds?.length === 1 && b.roundIds[0] === roundId)

  async function saveBoards(next: Leaderboard[]) {
    const prev = boards
    setBoards(next)
    setError(null)
    const { error: err } = await supabase
      .from('trips')
      .update({ leaderboards: next })
      .eq('id', tripId)
    if (err) {
      setBoards(prev)
      setError('Could not save the format — try again')
    }
  }

  const dayLine = DAY_BOARDS.find(d => d.key === dayBoards)

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}/organiser`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-1">
          Formats by day
        </h1>
        <p className="text-ink/65 text-sm mb-6 leading-snug">
          The event&apos;s own rules count every round. Give a day its own
          format and that day becomes a competition in its own right —
          singles one day, fourballs the next.
        </p>

        {dayLine && (
          <div className="bg-surface border border-bark/12 rounded-2xl p-4 mb-6">
            <p className="text-ink text-sm font-medium">{dayLine.label}</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{dayLine.hint}</p>
          </div>
        )}

        {/* The overall boards, named so it is clear what a day board sits
            beside rather than replaces. */}
        {overall.length > 0 && (
          <section className="mb-8">
            <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-3">
              The whole event
            </h2>
            <ul className="flex flex-col gap-2">
              {overall.map(b => (
                <li key={b.id} className="bg-surface border border-bark/12 rounded-2xl p-4">
                  <p className="text-ink text-sm font-medium">{boardTitle(b)}</p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{boardRules(b)}</p>
                </li>
              ))}
            </ul>
            <p className="t-cap text-ink/65 mt-2 leading-snug">
              Changed in Trip Setup, through the organiser area.
            </p>
          </section>
        )}

        <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-3">Each day</h2>

        {rounds.length === 0 ? (
          <p className="t-cap text-ink/65 text-center py-2">No rounds yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rounds.map(round => {
              const mine = boardsFor(round.id)
              const open = openFor === round.id
              return (
                <li key={round.id} className="bg-surface border border-bark/12 rounded-2xl p-4">
                  <p className="text-ink text-sm font-medium">
                    Day {round.roundNumber}
                    {round.courseName ? ` — ${round.courseName}` : ''}
                  </p>

                  {mine.length > 0 ? (
                    <ul className="flex flex-col gap-1 mt-3">
                      {mine.map(b => (
                        <li key={b.id} className="rounded-lg bg-bark/[0.04] px-3 py-2">
                          <p className="text-ink text-sm">{boardTitle(b)}</p>
                          <p className="t-cap text-ink/65 mt-0.5 leading-snug">{boardRules(b)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="t-cap text-ink/65 mt-2 leading-snug">
                      Scored by the event&apos;s own rules.
                    </p>
                  )}

                  {open ? (
                    <div className="mt-3">
                      {/* `scope` is what makes a board made here this day's
                          — seeded onto the draft, so the cascade knows from
                          its first question that a day's Stableford is not
                          the event's Stableford and offers it rather than
                          calling it taken. */}
                      <LeaderboardSetup
                        boards={boards}
                        playerCount={playerCount}
                        teamCount={teamCount}
                        rounds={[{
                          id: round.id,
                          roundNumber: round.roundNumber,
                          courseName: round.courseName,
                        }]}
                        scope={[round.id]}
                        askTeeTeams
                        askTags
                        onChange={saveBoards}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenFor(null)}
                        className="t-cap text-ink/65 hover:text-ink/80 transition-colors mt-3"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenFor(round.id)}
                      className="t-cap text-accent-deep hover:text-accent transition-colors mt-3"
                    >
                      {mine.length > 0 ? 'Change this day’s format' : '+ Give this day its own format'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {error && (
          <p className="text-rust-deep text-sm mt-4 leading-snug">{error}</p>
        )}
      </div>
    </main>
  )
}
