'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import RunRulesFields from '@/app/components/RunRulesFields'
import {
  type RunSetup, type RulesDraft,
  draftFromSetup, draftIssue, setupWithDraft,
} from '@/lib/runChallenge'

/**
 * Changing the points rules, in the organiser area — the same fields
 * challenge setup asks (RunRulesFields), with a Save.
 *
 * Saved whole to `trips.run_setup` through `setupWithDraft`, which keeps
 * every board already there and only re-points team boards at the chosen
 * comparison. Nothing else needs touching: points are never stored, so the
 * next time any board is drawn it is drawn under the new rules — every run
 * already logged re-counted at once.
 */
export default function RunRulesEditor({ tripId, setup }: {
  tripId: string
  setup: RunSetup
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<RulesDraft>(() => draftFromSetup(setup))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const issue = draftIssue(draft)
  const unchanged = JSON.stringify(setupWithDraft(setup, draft)) === JSON.stringify(setup)

  async function save() {
    if (issue || unchanged || saving) return
    setSaving(true)
    setMessage(null)
    const { error } = await supabase
      .from('trips')
      .update({ run_setup: setupWithDraft(setup, draft) })
      .eq('id', tripId)
    setSaving(false)
    if (error) {
      setMessage({ ok: false, text: 'Could not save the rules — try again.' })
      return
    }
    setMessage({ ok: true, text: 'Saved — the leaderboard has re-counted every run.' })
    startTransition(() => router.refresh())
  }

  return (
    <div>
      <RunRulesFields draft={draft} onChange={next => { setDraft(next); setMessage(null) }} />
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!!issue || unchanged || saving || pending}
          className="px-5 py-3 bg-accent-deep text-white text-sm font-bold tracking-[0.15em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save rules'}
        </button>
        {!unchanged && !saving && (
          <button
            type="button"
            onClick={() => { setDraft(draftFromSetup(setup)); setMessage(null) }}
            className="t-cap text-ink/65 hover:text-ink/80 transition-colors"
          >
            Undo changes
          </button>
        )}
      </div>
      {message && (
        <p className={`text-sm mt-3 leading-snug ${message.ok ? 'text-accent-deep' : 'text-rust-deep'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
