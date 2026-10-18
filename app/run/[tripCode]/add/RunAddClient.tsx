'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import DateField from '@/app/components/DateField'
import { todayString } from '@/lib/tripStatus'
import {
  RUN_ACTIVITIES, MAX_RUN_KM,
  type RunActivity, type RunRules,
  runPoints, runEntryIssue, roundKm, formatPoints, describePace, describeDuration, describeDay,
} from '@/lib/runChallenge'
import { formatKm } from '@/lib/runBoards'
import { activityUrl } from '@/lib/stravaLinks'

/**
 * The Add tab's body: the log-a-run form, and this runner's own runs.
 * Strava sits above it, in the page's own StravaCard.
 *
 * The form checks a run as it is typed through `runEntryIssue` — the same
 * function the server route runs before it saves — so the button is only
 * live for a run the server will take. Today is this phone's today, read
 * after mount; the server allows a day's grace for timezones ahead of its
 * own.
 *
 * Saving and deleting go to `/api/run/runs`; the table is closed to the
 * browser. After either, `router.refresh()` re-reads the page so the list,
 * the totals and every board agree with what was saved.
 *
 * The runs listed here are this runner's own — the one place anybody's runs
 * are shown whole, and only to them (Strava's rules; docs/run.md).
 */

export type MyRun = {
  id: string
  date: string
  activity: RunActivity
  km: number
  minutes: number | null
  source: 'manual' | 'strava'
  points: number
  /**
   * The Garmin that recorded it ("Garmin Forerunner 265"), or null — Strava's
   * API Policy (§4.4) asks that Garmin-sourced data credits Garmin, and
   * Garmin's guidelines name the device.
   */
  garmin?: string | null
  /** Strava's id for a Strava run — its "View on Strava" link (API Policy §2.4). */
  stravaId?: number | null
}

const INPUT = [
  'w-full min-w-0 bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
  'text-ink placeholder:text-ink/60',
  'focus:outline-none focus:border-accent/50 transition-colors',
].join(' ')
const LABEL = 'block text-ink/80 text-[13px] uppercase tracking-wider mb-2'

const subscribe = () => () => {}
const readToday = () => todayString(new Date())
const serverToday = () => ''

const numeric = (v: string) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')

export default function RunAddClient({
  code, rules, start, end, logRuns, closed = false, final = null, myRuns,
}: {
  code: string
  rules: RunRules
  start: string | null
  end: string | null
  logRuns: boolean
  /** Past the last day for late runs: the server refuses new ones. */
  closed?: boolean
  /** Frozen — and whether its Strava runs were deleted at the freeze. */
  final?: { stravaRemoved: boolean } | null
  myRuns: MyRun[]
}) {
  const router = useRouter()
  const today = useSyncExternalStore(subscribe, readToday, serverToday)

  // The last day a run can be logged for: today, or the finish if earlier.
  const latest = today && end && end < today ? end : today
  const counted = RUN_ACTIVITIES.filter(a => rules.activities.includes(a.key))

  const [activity, setActivity] = useState<RunActivity>(counted[0]?.key ?? 'run')
  const [date, setDate] = useState('')
  const [km, setKm] = useState('')
  const [hours, setHours] = useState('')
  const [mins, setMins] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const day = date || latest
  const kmNum = km ? roundKm(Number(km)) : 0
  const minutes = hours || mins ? Number(hours || 0) * 60 + Number(mins || 0) : null
  const entry = { activity, date: day, km: kmNum, minutes }
  const issue = today ? runEntryIssue(entry, { start, end, latest: today, activities: rules.activities }) : null
  const notStarted = !!(today && start && today < start)
  const pts = kmNum > 0 ? runPoints({ km: kmNum, activity }, rules) : 0

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || issue) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/run/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode: code, ...entry }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setError(body.message ?? 'Could not save that run — try again.')
        return
      }
      setKm('')
      setHours('')
      setMins('')
      setSaved(true)
      router.refresh()
    } catch {
      setError('Could not save that run — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(run: MyRun) {
    if (!window.confirm(`Delete your ${formatKm(run.km)} from ${describeDay(run.date)}?`)) return
    setError(null)
    try {
      const res = await fetch('/api/run/runs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode: code, runId: run.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setError(body.message ?? 'Could not delete that run — try again.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not delete that run — check your connection and try again.')
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Log a run ── */}
      {closed ? (
        <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
          <p className="text-ink/80 text-sm leading-snug">
            {final
              ? `This challenge is final — runs can no longer be added. The final team standings are on the leaderboard${
                final.stravaRemoved ? ', and its Strava runs have been deleted, as agreed when they were connected' : ''}.`
              : 'This challenge has closed — runs can no longer be added. Its final standings are frozen overnight.'}
          </p>
        </div>
      ) : !logRuns ? (
        <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
          <p className="text-ink/80 text-sm leading-snug">
            Runs come from Strava in this challenge — typing them in is switched off.
          </p>
        </div>
      ) : notStarted ? (
        <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
          <p className="text-ink/80 text-sm leading-snug">
            The challenge starts on {start ? describeDay(start) : 'its start date'} — log your
            runs from then.
          </p>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink">Log a run</h2>

          {counted.length > 1 && (
            <div>
              <p className={LABEL}>Activity</p>
              <div className="flex flex-wrap gap-2">
                {counted.map(a => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setActivity(a.key)}
                    aria-pressed={activity === a.key}
                    className={`px-3 py-2 rounded-xl text-sm transition-colors ${
                      activity === a.key
                        ? 'bg-accent-deep text-white'
                        : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <DateField label="Day" value={day} onChange={setDate} min={start ?? undefined} max={latest || undefined} />
            <div className="min-w-0">
              <label className={LABEL} htmlFor="run-km">Distance (km)</label>
              <input
                id="run-km"
                type="text"
                inputMode="decimal"
                value={km}
                onChange={e => setKm(numeric(e.target.value))}
                placeholder="5.0"
                maxLength={String(MAX_RUN_KM).length + 3}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <p className={LABEL}>Time (optional)</p>
            <div className="flex items-center gap-2">
              <input
                type="text" inputMode="numeric" value={hours}
                onChange={e => setHours(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="0" aria-label="Hours"
                className={`${INPUT} w-20 text-center`}
              />
              <span className="text-ink/65 text-sm">h</span>
              <input
                type="text" inputMode="numeric" value={mins}
                onChange={e => setMins(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="30" aria-label="Minutes"
                className={`${INPUT} w-20 text-center`}
              />
              <span className="text-ink/65 text-sm">min</span>
            </div>
          </div>

          {/* What it is worth, before anything is saved. */}
          <div className="px-4 py-3 bg-accent/[0.08] border border-accent/30 rounded-xl">
            {km && issue ? (
              <p className="text-rust-deep text-sm leading-snug">{issue}</p>
            ) : (
              <p className="text-ink text-sm">
                {kmNum > 0
                  ? pts > 0
                    ? `This run earns ${formatPoints(pts)} ${pts === 1 ? 'point' : 'points'}.`
                    : `Runs under ${formatPoints(rules.minKm)} km don't earn points.`
                  : 'Add the distance to see what it earns.'}
                {kmNum > 0 && describePace(kmNum, minutes) ? ` ${describePace(kmNum, minutes)}.` : ''}
              </p>
            )}
          </div>

          {error && (
            <div className="p-4 bg-rust/10 border border-rust/30 rounded-xl">
              <p className="text-rust-deep text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !km || !!issue || !today}
            className="w-full py-4 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : saved && !km ? '✓ Saved — log another' : 'Save run'}
          </button>
        </form>
      )}

      {/* ── Your runs ── */}
      <section>
        <h2 className="t-cap uppercase tracking-[0.12em] text-ink/65 mb-2.5">Your runs</h2>
        {myRuns.length === 0 ? (
          <p className="text-ink/65 text-sm">Nothing logged yet.</p>
        ) : (
          <ul className="bg-surface border border-bark/12 rounded-2xl overflow-hidden">
            {myRuns.map((r, i) => {
              const label = RUN_ACTIVITIES.find(a => a.key === r.activity)?.label ?? 'Run'
              const extra = [describeDuration(r.minutes), describePace(r.km, r.minutes)].filter(Boolean).join(' · ')
              return (
                <li key={r.id} className={`flex items-center gap-3 px-4 py-3 ${i < myRuns.length - 1 ? 'border-b border-bark/12' : ''}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-ink text-sm font-medium">
                      {formatKm(r.km)} {label.toLowerCase()}
                      {r.source === 'strava' && <span className="text-ink/65 font-normal"> · Strava</span>}
                    </span>
                    <span className="block text-ink/65 text-[13px]">
                      {describeDay(r.date)}{extra ? ` · ${extra}` : ''}
                    </span>
                    {r.garmin && (
                      <span className="block text-ink/65 text-[13px]">Recorded on {r.garmin}</span>
                    )}
                    {r.source === 'strava' && r.stravaId ? (
                      <a
                        href={activityUrl(r.stravaId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-ink text-[13px] font-medium underline underline-offset-2 hover:text-accent-deep transition-colors mt-0.5"
                      >
                        View on Strava
                      </a>
                    ) : null}
                  </span>
                  <span className="font-serif text-lg font-semibold tabular-nums text-ink flex-shrink-0">
                    {formatPoints(r.points)}
                  </span>
                  {r.source === 'manual' && (
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      aria-label={`Delete ${formatKm(r.km)} from ${describeDay(r.date)}`}
                      className="text-ink/65 hover:text-rust-deep transition-colors p-1 flex-shrink-0"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {myRuns.length > 0 && (
          <p className="text-ink/65 text-[13px] mt-2 leading-snug">
            Points shown are each run on its own — a daily limit, if the challenge has
            one, applies on the leaderboard.
          </p>
        )}
      </section>
    </div>
  )
}
