import Link from 'next/link'
import { type MyTee } from '@/lib/teeSheet'
import { joinNames } from '@/lib/matchplayEntrants'
import { describeShortDate } from '@/lib/itinerary'
import CourseName from '@/app/components/CourseName'
import { cardClass } from '@/app/components/ui'

/**
 * The tee times, as the Event Hub shows them — a home screen module, there
 * only while a round starts from a tee sheet (lib/eventHub.ts
 * `activeHubModules`). It used to be a tab of its own; the field mostly
 * wants one answer from it, and that answer belongs on the home screen.
 *
 * One round, from the reader's side: when they go off and who with, or —
 * for a phone not on the sheet — when the first group goes and how full it
 * is. The sheet itself, every slot and the editing, stays on its own
 * screen, and the link at the foot is the way there.
 *
 * Server component. Nothing is worked out here: the round is
 * `hubTeeRound`'s and the place is `myTee`'s, both in lib/teeSheet.ts.
 */
export default function TeeTimesPanel({
  tripCode, round, mine, firstClock, booked, fieldSize, claimed,
}: {
  tripCode: string
  round: { roundNumber: number; courseName: string | null; date: string | null }
  /** This phone's place on the sheet, or null when it has none. */
  mine: MyTee | null
  /** When the first group goes, or null while the round has no start time. */
  firstClock: string | null
  /** Players on this round's sheet, out of the field. */
  booked: number
  fieldSize: number
  /** Whether this phone is a claimed player — "you're not on it" is only theirs. */
  claimed: boolean
}) {
  const date = describeShortDate(round.date)

  return (
    <div>
      <p className="t-label text-ink/65 mb-1">
        Round {round.roundNumber}{date ? ` · ${date}` : ''}
      </p>
      {round.courseName && (
        <p className="t-card text-ink">
          <CourseName name={round.courseName} />
        </p>
      )}

      {mine ? (
        <div className={`mt-3 px-4 py-3 ${cardClass()}`}>
          <p className="t-cap text-ink/65">{mine.clock ? 'You’re off at' : 'You’re in'}</p>
          <p className="font-serif text-3xl t-num text-ink mt-0.5">
            {mine.clock ?? `Group ${mine.slotIndex + 1}`}
          </p>
          <p className="t-cap text-ink/80 mt-1 leading-snug">
            {mine.partners.length > 0
              ? `With ${joinNames(mine.partners)}`
              : 'Nobody else in your group yet.'}
          </p>
        </div>
      ) : (
        <p className="t-body text-ink/80 mt-3 leading-snug">
          {claimed ? 'You’re not on the sheet yet. ' : ''}
          {firstClock ? `First group off at ${firstClock}. ` : 'No start time yet. '}
          {booked} of {fieldSize} on the sheet.
        </p>
      )}

      {/* A link, not a button — the hub already has its one emerald action. */}
      <Link
        href={`/trip/${tripCode}/teesheet`}
        className="inline-block mt-4 t-label text-accent-deep hover:text-accent transition-colors duration-150"
      >
        Open the tee sheet →
      </Link>
    </div>
  )
}
