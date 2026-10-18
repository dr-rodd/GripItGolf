'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SITE } from '@/config/site'
import { closesOn, describeDay } from '@/lib/runChallenge'
import { STRAVA_APPS_URL } from '@/lib/stravaLinks'
import PoweredByStrava from '@/app/components/PoweredByStrava'
import ConnectWithStrava from '@/app/components/ConnectWithStrava'
import type { StravaStatus } from './runs'
import { cardClass } from '@/app/components/ui'

/**
 * Strava, from the runner's side — on the Add tab and in Settings.
 *
 * Not connected: what connecting means, the consent box, then Connect with
 * Strava. Strava's API Policy (§2.1) asks that a runner is told — before
 * they agree — what is collected and how, who sees it, how to withdraw, and
 * how to have it deleted, with a confirmation when it is. So the card says
 * all of it in five short lines, links the privacy notice, and connecting
 * needs the box ticked: before it is, the button goes nowhere and says so
 * under the box. The connection lasts for the
 * challenge only, and the card says when that is: the day it closes, three
 * days after the finish, or later if the organiser extends it. Connecting
 * is a full navigation to our connect route, which hands over to Strava.
 *
 * Connected: when Strava was last read, a "Check for new runs" for the
 * moment a run has not arrived on its own yet, Disconnect — whose answer
 * is the written confirmation of what was deleted — and the way to manage
 * the connection on Strava itself (§2.4).
 *
 * Closed (past the challenge's last day for late runs): nothing new can be
 * connected, and a connection still standing says it is about to end.
 *
 * Every state that carries Strava ends with Strava's own "Powered by
 * Strava" logo (PoweredByStrava), and the button that starts a connection
 * is Strava's own "Connect with Strava" (ConnectWithStrava) — both the
 * files as Strava supplied them. Their guidelines allow the button
 * unaltered or not at all, so it is never greyed out while the box is
 * unticked: until then it is a plain button that asks for the tick, and
 * only once ticked is it the link that carries the consent to the connect
 * route — so the consent can never travel without the tick.
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

const LINK = 'text-accent-deep underline underline-offset-2 hover:text-accent transition-colors'

function ManageOnStrava() {
  return (
    <a href={STRAVA_APPS_URL} target="_blank" rel="noopener noreferrer" className="t-cap text-accent-deep hover:text-accent transition-colors">
      Manage on Strava ↗
    </a>
  )
}

export default function StravaCard({ code, status, joined, outcome, end, closed = false }: {
  code: string
  status: StravaStatus
  /** Has this phone joined the challenge? Connecting needs a runner. */
  joined: boolean
  /** What just happened on Strava's screen, said as a sentence. */
  outcome?: { ok: boolean; text: string } | null
  /** The challenge's finish — the connection ends three days after it. */
  end: string | null
  /** Past the last day for late runs, or final: nothing new connects. */
  closed?: boolean
}) {
  const router = useRouter()
  const [consent, setConsent] = useState(false)
  /** The button was tapped before the box was ticked: ask for the tick. */
  const [askTick, setAskTick] = useState(false)
  const [busy, setBusy] = useState<'sync' | 'disconnect' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(outcome ?? null)

  async function call(path: 'sync' | 'disconnect') {
    if (busy) return
    if (path === 'disconnect' && !window.confirm(
      'Disconnect Strava? Your Strava runs will be permanently deleted from Green Dot and taken off this challenge\'s leaderboard. Runs you typed in stay.',
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
        : { ok: true, text: body.message ?? 'Strava disconnected — your Strava runs have been permanently deleted from Green Dot.' })
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
  const closing = end ? describeDay(closesOn(end)) : null

  if (status.state === 'off' || status.state === 'unready') {
    return (
      <div className={`p-4 ${cardClass()}`}>
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
      <div className={`p-4 ${cardClass()}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium">Strava connected</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
              {closed
                ? 'This challenge has closed — no new runs are read. The connection ends, and your Strava runs are deleted, when the final results are frozen overnight.'
                : <>New runs arrive by themselves. Last checked {since(status.lastSyncedAt)}.
                  {closing && <> The connection ends on {closing}, when the challenge closes.</>}</>}
            </p>
          </div>
          <span className="t-cap text-accent-deep flex-shrink-0">On</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {!closed && (
            <button
              type="button"
              onClick={() => call('sync')}
              disabled={!!busy}
              className="px-3 py-2 rounded-lg text-sm font-medium border border-line-strong text-ink/80 hover:border-bark/40 transition-colors disabled:opacity-40"
            >
              {busy === 'sync' ? 'Checking…' : 'Check for new runs'}
            </button>
          )}
          <button
            type="button"
            onClick={() => call('disconnect')}
            disabled={!!busy}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-rust/40 text-rust-deep hover:bg-rust/[0.06] transition-colors disabled:opacity-40"
          >
            {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <ManageOnStrava />
          <PoweredByStrava />
        </div>
        {note}
      </div>
    )
  }

  if (closed) {
    return (
      <div className={`p-4 ${cardClass()}`}>
        <p className="text-ink text-sm font-medium">Strava</p>
        <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
          This challenge has closed — Strava can no longer be connected to it.
        </p>
        {note}
        <PoweredByStrava className="mt-3" />
      </div>
    )
  }

  // Not connected.
  return (
    <div className={`p-4 ${cardClass()}`}>
      <p className="text-ink text-sm font-medium">Connect Strava</p>
      <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
        Your runs arrive by themselves — the ones since the challenge started, and
        every one after, until it closes.
      </p>

      {joined ? (
        <>
          <ul className="mt-4 space-y-2.5 text-ink/80 text-[13px] leading-snug">
            <li>
              <span className="text-ink font-medium">What is kept.</span> For each run, walk
              or hike: its type, date, distance and moving time, and the device that
              recorded it — read from Strava automatically. Only activities you share on
              Strava, never ones marked Only You; rides, swims and the rest are passed over.
              Nothing else is kept: no maps, routes, titles, photos or heart rate.
            </li>
            <li>
              <span className="text-ink font-medium">Who sees it.</span> The others in this
              challenge see your totals only — points, distance and number of runs. Your
              runs themselves are shown only to you.
            </li>
            <li>
              <span className="text-ink font-medium">For this challenge only.</span> The
              connection ends when the challenge closes
              {closing ? <>, on {closing}</> : null} — three days after the finish, or later
              if the organiser extends it. Your Strava runs are then deleted; your
              team&apos;s final total stays on the leaderboard.
            </li>
            <li>
              <span className="text-ink font-medium">Stop at any time.</span> Disconnect here,
              or remove Green Dot in your{' '}
              <a href={STRAVA_APPS_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                Strava settings
              </a>
              . Either way your Strava runs and connection details are deleted from Green
              Dot straight away.
            </li>
            <li>
              <span className="text-ink font-medium">Delete everything.</span> Settings → Leave
              and delete my data, or write to{' '}
              <a href={`mailto:${SITE.supportEmail}`} className={LINK}>{SITE.supportEmail}</a>.
              We confirm when it is done.
            </li>
          </ul>
          <p className="text-ink/65 text-[13px] mt-3 leading-snug">
            The full details are in the{' '}
            <Link href="/privacy" className={LINK}>privacy notice</Link>.
          </p>

          <label className="flex items-start gap-3 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => { setConsent(e.target.checked); setAskTick(false) }}
              className="mt-0.5 w-5 h-5 accent-accent-deep flex-shrink-0"
            />
            <span className="text-ink/80 text-[13px] leading-snug">
              I agree: Green Dot may read my Strava activities for this challenge as set out
              above, and show my totals on its leaderboard.
            </span>
          </label>
          {askTick && (
            <p className="text-rust-deep text-[13px] mt-2 leading-snug" role="alert">
              Tick the box above to agree first.
            </p>
          )}
          <div className="mt-4 flex justify-center">
            {consent ? (
              <a href={`/api/run/strava/connect?code=${code}&consent=1`} className="press rounded-md">
                <ConnectWithStrava />
              </a>
            ) : (
              <button type="button" onClick={() => setAskTick(true)} className="press rounded-md">
                <ConnectWithStrava />
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-ink/80 text-[13px] mt-3 leading-snug">Join the challenge first, then connect.</p>
      )}
      {note}
      <div className="mt-4 flex justify-center">
        <PoweredByStrava />
      </div>
    </div>
  )
}
