'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StravaStatus } from './runs'

/**
 * Strava, from the runner's side — on the Add tab and in Settings.
 *
 * Not connected: the consent box, then Connect with Strava. The box is
 * the agreement Strava's rules ask for — that this runner's totals (points,
 * distance, how many runs) appear on this challenge's leaderboard for the
 * others in it — and the button stays dead until it is ticked. Connecting
 * is a full navigation to our connect route, which hands over to Strava.
 *
 * Connected: when Strava was last read, a "Check for new runs" for the
 * moment a run has not arrived on its own yet, and Disconnect — which says
 * plainly that their Strava runs leave the board.
 *
 * The button is ours, not Strava's artwork: the official "Connect with
 * Strava" asset could not be fetched from the build, and Strava's brand
 * guidelines want theirs used unaltered if it is used at all. Dropping the
 * asset in is a one-line change once it is in public/ (docs/run.md).
 */

function since(iso: string | null): string {
  if (!iso) return 'not yet'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export default function StravaCard({ code, status, joined, outcome }: {
  code: string
  status: StravaStatus
  /** Has this phone joined the challenge? Connecting needs a runner. */
  joined: boolean
  /** What just happened on Strava's screen, said as a sentence. */
  outcome?: { ok: boolean; text: string } | null
}) {
  const router = useRouter()
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'sync' | 'disconnect' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(outcome ?? null)

  async function call(path: 'sync' | 'disconnect') {
    if (busy) return
    if (path === 'disconnect' && !window.confirm(
      'Disconnect Strava? Your Strava runs will be taken off this challenge\'s leaderboard. Runs you typed in stay.',
    )) return
    setBusy(path)
    setMessage(null)
    try {
      const res = await fetch(`/api/run/strava/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode: code }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setMessage({ ok: false, text: body.message ?? 'Something went wrong — try again.' })
        return
      }
      setMessage(path === 'sync'
        ? { ok: true, text: body.written > 0 ? 'Up to date with Strava.' : 'Up to date — no runs in the challenge yet.' }
        : { ok: true, text: 'Strava disconnected — your Strava runs are off the board.' })
      router.refresh()
    } catch {
      setMessage({ ok: false, text: 'Could not reach the site — check your connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  const note = message && (
    <p className={`text-[13px] mt-3 leading-snug ${message.ok ? 'text-accent-deep' : 'text-rust-deep'}`}>
      {message.text}
    </p>
  )

  if (status.state === 'off' || status.state === 'unready') {
    return (
      <div className="bg-surface border border-bark/12 rounded-2xl p-4">
        <p className="text-ink text-sm font-medium">Strava</p>
        <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
          {status.state === 'off'
            ? 'Strava is not set up for this site yet — typed-in runs work in the meantime.'
            : 'Strava needs a database update that has not been applied yet (migration 054).'}
        </p>
        {note}
      </div>
    )
  }

  if (status.state === 'connected') {
    return (
      <div className="bg-surface border border-bark/12 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium">Strava connected</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
              New runs arrive by themselves. Last checked {since(status.lastSyncedAt)}.
            </p>
          </div>
          <span className="t-cap text-accent-deep flex-shrink-0">On</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => call('sync')}
            disabled={!!busy}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-bark/25 text-ink/80 hover:border-bark/40 transition-colors disabled:opacity-40"
          >
            {busy === 'sync' ? 'Checking…' : 'Check for new runs'}
          </button>
          <button
            type="button"
            onClick={() => call('disconnect')}
            disabled={!!busy}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-rust/40 text-rust-deep hover:bg-rust/[0.06] transition-colors disabled:opacity-40"
          >
            {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
        {note}
      </div>
    )
  }

  // Not connected.
  return (
    <div className="bg-surface border border-bark/12 rounded-2xl p-4">
      <p className="text-ink text-sm font-medium">Connect Strava</p>
      <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
        Your runs arrive by themselves — the ones since the challenge started, and
        every one after. Only runs you share on Strava; never ones marked Only You.
      </p>

      {joined ? (
        <>
          <label className="flex items-start gap-3 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-accent-deep flex-shrink-0"
            />
            <span className="text-ink/80 text-[13px] leading-snug">
              I agree my totals — points, distance and number of runs — appear on this
              challenge&apos;s leaderboard for the others in it. My runs themselves are
              shown only to me.
            </span>
          </label>
          <a
            href={consent ? `/api/run/strava/connect?code=${code}&consent=1` : undefined}
            aria-disabled={!consent}
            onClick={e => { if (!consent) e.preventDefault() }}
            className={`block w-full mt-4 py-3.5 text-center text-sm font-bold tracking-[0.15em] uppercase rounded-xl border transition-colors ${
              consent
                ? 'bg-surface border-bark/25 text-ink hover:border-bark/40'
                : 'bg-surface border-bark/12 text-ink/65 cursor-not-allowed'
            }`}
          >
            Connect with Strava
          </a>
        </>
      ) : (
        <p className="text-ink/80 text-[13px] mt-3 leading-snug">Join the challenge first, then connect.</p>
      )}
      {note}
    </div>
  )
}
