'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import RoundDeadlines from '@/app/components/RoundDeadlines'
import { deadlinesAnswerIssue, storedDeadlines, type DeadlinesAnswer } from '@/lib/bracketSetup'
import { setRoundDeadlines } from '@/lib/leagueRoundStore'
import { buttonClass } from '@/app/components/ui'

/**
 * A league's round deadlines, from the organiser area (Ross, 5 Nov 2026) —
 * "Do you want to set a deadline for each round to be completed?", the same
 * question creation asks (`RoundDeadlines`), over every round the league
 * has now, a round added since included. Each round's own date is the
 * earliest its deadline can be. Saved whole on its own button.
 */
export default function LeagueDeadlines({ tripId, rounds, start }: {
  tripId: string
  /** The league's rounds in date order: the key the deadline is kept by, its name, its own date, its deadline. */
  rounds: { key: string; name: string; date: string | null; deadline: string | null }[]
  start: string | null
}) {
  const router = useRouter()
  const set = rounds.some(r => r.deadline)
  const [value, setValue] = useState<DeadlinesAnswer>({ on: set ? true : null, dates: rounds.map(r => r.deadline ?? '') })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const opts = { names: rounds.map(r => r.name), floors: rounds.map(r => r.date) }
  const issue = deadlinesAnswerIssue(value, rounds.length, opts)

  async function save() {
    setBusy(true)
    setNote(null)
    const stored = storedDeadlines(value, rounds.length, opts)
    const byKey: Record<string, string> = {}
    if (stored) rounds.forEach((r, i) => { if (r.key && stored[i]) byKey[r.key] = stored[i] })
    const result = await setRoundDeadlines({ tripId, deadlines: stored ? byKey : null })
    setBusy(false)
    setNote(result.ok ? { ok: true, text: stored ? 'Deadlines saved.' : 'No deadlines.' } : { ok: false, text: result.error })
    if (result.ok) router.refresh()
  }

  return (
    <section className="mt-8">
      <h2 className="t-h2 text-ink mb-1">Round deadlines</h2>
      <p className="t-cap text-ink/65 mb-4">Do you want to set a deadline for each round to be completed?</p>
      <RoundDeadlines value={value} onChange={v => { setValue(v); setNote(null) }} rounds={rounds.length}
        names={opts.names} floors={opts.floors} start={start} />
      <button type="button" onClick={save} disabled={busy || !!issue} className={`${buttonClass('primary')} mt-5`}>
        {busy ? 'Saving…' : 'Save deadlines'}
      </button>
      {note && <p className={`t-cap mt-2 ${note.ok ? 'text-accent-deep' : 'text-rust-deep'}`}>{note.text}</p>}
    </section>
  )
}
