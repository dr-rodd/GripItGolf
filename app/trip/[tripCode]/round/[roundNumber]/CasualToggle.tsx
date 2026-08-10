'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Toggle from '@/app/components/Toggle'

/**
 * Whether this round counts, decided on the round's own page.
 *
 * The itinerary's golf sheet asks the same question when a round is added;
 * this is where the answer changes afterwards — a subgroup that played an
 * extra course and only then decided it should not move the trip standings.
 * Flipping it is allowed with scores on the round, deliberately: the scores
 * are untouched either way, and the leaderboard simply stops (or starts)
 * reading them. The rule that reads the flag lives in lib/boardRows.ts.
 *
 * The stats question appears only on a casual round of a trip that records
 * stats, mirroring the sheet. A trip that turns stats on later finds a
 * casual round opted out, and this switch is how it opts in.
 */
export default function CasualToggle({
  roundId, casual, casualStats, trackStats,
}: {
  roundId: string
  casual: boolean
  casualStats: boolean
  trackStats: boolean
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function write(fields: { casual?: boolean; casual_stats?: boolean }) {
    setSaving(true)
    setError('')
    const { error: writeError } = await supabase
      .from('rounds')
      .update(fields)
      .eq('id', roundId)
    setSaving(false)
    if (writeError) {
      console.error('CasualToggle write failed:', writeError)
      setError('Could not save the change — try again.')
      return
    }
    // The server rendered this page — and renders the leaderboard — so the
    // new answer has to come back from there rather than being assumed here.
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-bark/12 bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink text-sm">Counts on the leaderboard</span>
        <Toggle
          checked={!casual}
          disabled={saving}
          onChange={next => write({ casual: !next })}
          label="Counts on the leaderboard"
        />
      </div>
      {casual && (
        <p className="t-cap text-ink/65 mt-2">
          A casual round — scored as usual, kept off every leaderboard.
        </p>
      )}
      {casual && trackStats && (
        <div className="flex items-center justify-between gap-3 mt-4">
          <span className="text-ink text-sm">Include in trip stats</span>
          <Toggle
            checked={casualStats}
            disabled={saving}
            onChange={next => write({ casual_stats: next })}
            label="Include in trip stats"
          />
        </div>
      )}
      {error && <p className="t-cap text-rust-deep mt-2">{error}</p>}
    </section>
  )
}
