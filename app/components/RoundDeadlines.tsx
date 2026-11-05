'use client'

import {
  deadlineOpensAt, deadlineRoundNames, deadlinesAnswerIssue, fitDeadlines, type DeadlinesAnswer,
} from '@/lib/bracketSetup'
import DateField from './DateField'
import { chipClass } from './ui'

/**
 * "Do you want to set a deadline for each round to be completed?" (Ross, 5
 * Nov 2026) — asked once a bracket exists, at creation and in the organiser
 * area alike, and on a league's rounds: yes, and a date for each round, or
 * no. Each round's calendar opens at the round before's deadline
 * (`deadlineOpensAt`), the first at the event's start. The rules are
 * lib/bracketSetup.ts's; this only asks.
 */
export default function RoundDeadlines({ value, onChange, rounds, names, floors, start }: {
  value: DeadlinesAnswer
  onChange: (next: DeadlinesAnswer) => void
  /** How many rounds there are. */
  rounds: number
  /** Each round's name, first first — a bracket's by default. */
  names?: string[]
  /** A league round's own date, which its deadline cannot come before. */
  floors?: (string | null)[]
  /** The event's start, where the first round's calendar opens. */
  start: string | null
}) {
  const labels = names ?? deadlineRoundNames(rounds)
  const dates = fitDeadlines(value.dates, rounds)
  const issue = deadlinesAnswerIssue(value, rounds, { names: labels, floors })
  const setDate = (i: number, date: string) => {
    const next = [...dates]
    next[i] = date
    onChange({ on: true, dates: next })
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5" role="group" aria-label="Set deadlines">
        <button type="button" aria-pressed={value.on === true} onClick={() => onChange({ on: true, dates })}
          className={`${chipClass(value.on === true)} flex-1`}>
          Yes, set deadlines
        </button>
        <button type="button" aria-pressed={value.on === false} onClick={() => onChange({ on: false, dates })}
          className={`${chipClass(value.on === false)} flex-1`}>
          No deadlines
        </button>
      </div>

      {value.on === false && (
        <p className="t-cap text-ink/65 leading-snug">Rounds are played when the players get to them. You can add deadlines later.</p>
      )}

      {value.on && (
        <div className="space-y-3">
          {labels.slice(0, rounds).map((label, i) => (
            <DateField
              key={label}
              label={label}
              value={dates[i] ?? ''}
              onChange={v => setDate(i, v)}
              min={deadlineOpensAt(dates, i, null, floors?.[i]) ?? undefined}
              openAt={deadlineOpensAt(dates, i, start, floors?.[i])}
            />
          ))}
          {issue && dates.some(Boolean) && <p className="text-rust-deep text-[13px] leading-snug">{issue}</p>}
        </div>
      )}
    </div>
  )
}
