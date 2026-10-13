'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DateField from '@/app/components/DateField'
import { todayString } from '@/lib/tripStatus'
import { challengeDatesIssue, closesOn, describeDay, dueForFinal } from '@/lib/runChallenge'

/**
 * Moving the challenge's dates, in the organiser area — most often to
 * extend it.
 *
 * Everything follows the dates on its own: the boards count the new days,
 * Strava's next read asks from the new start, and the close — the day the
 * standings freeze and every Strava connection ends — moves with the
 * finish (lib/runChallenge.ts `closesOn`). That is the room the runners
 * were told about when they connected: the link lasts for the challenge,
 * longer if the organiser extends it.
 *
 * Open until the challenge is final; a frozen result is for keeps, so the
 * page stops offering this card at all. A finish moved so far back that it
 * has already closed is allowed — an organiser may end things early — but
 * asked about first, because the standings then freeze overnight and the
 * Strava runs are deleted.
 */
export default function RunDatesEditor({ tripId, start, end }: {
  tripId: string
  start: string | null
  end: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [from, setFrom] = useState(start ?? '')
  const [to, setTo] = useState(end ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const issue = challengeDatesIssue(from, to)
  const unchanged = from === (start ?? '') && to === (end ?? '')

  async function save() {
    if (issue || unchanged || saving) return
    if (dueForFinal(to, todayString(new Date()), false) && !window.confirm(
      'That finish has already closed. The standings will be frozen overnight and every Strava run in the challenge deleted. Save it anyway?',
    )) return
    setSaving(true)
    setMessage(null)
    const { error } = await supabase
      .from('trips')
      .update({ start_date: from, end_date: to })
      .eq('id', tripId)
    setSaving(false)
    if (error) {
      setMessage({ ok: false, text: 'Could not save the dates — try again.' })
      return
    }
    setMessage({
      ok: true,
      text: `Saved — late runs count until ${describeDay(closesOn(to))}, and Strava connections last until then.`,
    })
    startTransition(() => router.refresh())
  }

  return (
    <div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <DateField label="Starts" value={from} onChange={v => { setFrom(v); setMessage(null) }} />
        <DateField label="Finishes" value={to} onChange={v => { setTo(v); setMessage(null) }} />
      </div>
      {!unchanged && issue && (
        <p className="text-rust-deep text-sm mt-3 leading-snug">{issue}</p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!!issue || unchanged || saving || pending}
          className="px-5 py-3 bg-accent-deep text-white text-sm font-bold tracking-[0.15em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save dates'}
        </button>
        {!unchanged && !saving && (
          <button
            type="button"
            onClick={() => { setFrom(start ?? ''); setTo(end ?? ''); setMessage(null) }}
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
