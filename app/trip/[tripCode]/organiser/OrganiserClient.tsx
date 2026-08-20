'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import {
  MAX_NOTICE, normalizeNotice, parseStartFormat,
  START_FORMAT_LABEL, type StartFormat,
} from '@/lib/eventHub'

/**
 * What the organiser can actually do, once past the PIN.
 *
 * Notices: post to the Event Hub's Notices section, newest first, and take
 * one down again. Starts: per round, shotgun (one time for the field — the
 * time is written to the round's itinerary item, where the countdown, the
 * weather and the schedule already read it) or tee sheet (the choice is
 * stored now; the sheet itself, groups and times, is still to come).
 *
 * Writes go straight to Supabase with the anon key, like every trip-scoped
 * write on the platform — the PIN in front of this screen is a soft gate,
 * not a security boundary (lib/passcode.ts). Every query filters by
 * trip_id.
 */

type Notice = { id: string; body: string; created_at: string }
type RoundInfo = {
  id: string
  roundNumber: number
  courseName: string | null
  itineraryItemId: string | null
  startFormat: string | null
  teeTime: string | null
}

const INPUT = [
  'w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
  'text-ink placeholder:text-ink/60',
  'focus:outline-none focus:border-accent/50 transition-colors',
].join(' ')

export default function OrganiserClient({
  tripId, tripCode, initialNotices, initialRounds,
}: {
  tripId: string
  tripCode: string
  initialNotices: Notice[]
  initialRounds: RoundInfo[]
}) {
  // ── Notices ──────────────────────────────────────────────────
  const [notices, setNotices] = useState<Notice[]>(initialNotices)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [noticeError, setNoticeError] = useState<string | null>(null)

  async function postNotice() {
    const body = normalizeNotice(draft)
    if (!body || posting) return
    setPosting(true)
    setNoticeError(null)

    const { data, error } = await supabase
      .from('event_messages')
      .insert({ trip_id: tripId, body })
      .select('id, body, created_at')
      .single()

    if (error || !data) {
      setNoticeError('Could not post the notice — try again')
    } else {
      setNotices(prev => [data as Notice, ...prev])
      setDraft('')
    }
    setPosting(false)
  }

  async function removeNotice(id: string) {
    // Deliberate, never one tap — the same rule deleting anything follows.
    if (!window.confirm('Take this notice down?')) return
    setNoticeError(null)

    const { error } = await supabase
      .from('event_messages')
      .delete()
      .eq('id', id)
      .eq('trip_id', tripId)

    if (error) setNoticeError('Could not remove the notice — try again')
    else setNotices(prev => prev.filter(n => n.id !== id))
  }

  // ── Starts ───────────────────────────────────────────────────
  const [rounds, setRounds] = useState<RoundInfo[]>(initialRounds)
  const [startError, setStartError] = useState<string | null>(null)

  function patchRound(id: string, patch: Partial<RoundInfo>) {
    setRounds(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  /** Tap a chip to choose; tap the chosen one again to clear. */
  async function saveFormat(round: RoundInfo, format: StartFormat) {
    const next = parseStartFormat(round.startFormat) === format ? null : format
    const prev = round.startFormat
    // Optimistic, reverting on refusal — the same manners as Trip Settings.
    patchRound(round.id, { startFormat: next })
    setStartError(null)

    const { error } = await supabase
      .from('rounds')
      .update({ start_format: next })
      .eq('id', round.id)
      .eq('trip_id', tripId)

    if (error) {
      patchRound(round.id, { startFormat: prev })
      setStartError('Could not save the start format — try again')
    }
  }

  async function saveTime(round: RoundInfo, time: string) {
    if (!round.itineraryItemId) return
    const prev = round.teeTime
    patchRound(round.id, { teeTime: time || null })
    setStartError(null)

    const { error } = await supabase
      .from('itinerary_items')
      .update({ tee_time: time || null })
      .eq('id', round.itineraryItemId)
      .eq('trip_id', tripId)

    if (error) {
      patchRound(round.id, { teeTime: prev })
      setStartError('Could not save the time — try again')
    }
  }

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">

        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-1">
          Organiser
        </h1>
        <p className="text-ink/65 text-sm mb-8">
          Notices go straight to the Event Hub. Starts show on the schedule.
        </p>

        {/* ── Post a notice ── */}
        <section>
          <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-3">Notices</h2>

          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={MAX_NOTICE}
            rows={3}
            placeholder="Carts on the path today. Prizegiving at six…"
            className={`${INPUT} resize-none leading-snug`}
          />
          <button
            onClick={postNotice}
            disabled={posting || !normalizeNotice(draft)}
            className="w-full mt-3 py-4 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {posting ? 'Posting…' : 'Post Notice'}
          </button>

          {noticeError && (
            <p className="text-rust-deep text-sm mt-3 leading-snug">{noticeError}</p>
          )}

          {notices.length > 0 && (
            <ul className="flex flex-col gap-2 mt-5">
              {notices.map(n => (
                <li key={n.id} className="flex items-start gap-3 bg-surface border border-bark/12 rounded-xl px-4 py-3">
                  <p className="flex-1 min-w-0 text-ink text-sm leading-relaxed whitespace-pre-line">
                    {n.body}
                  </p>
                  <button
                    onClick={() => removeNotice(n.id)}
                    className="text-ink/65 hover:text-ink/80 transition-colors p-1 flex-shrink-0"
                    aria-label="Take this notice down"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── How each round starts ── */}
        <section className="mt-10">
          <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-1">Starts</h2>
          <p className="text-ink/65 text-[13px] mb-3 leading-snug">
            Shotgun sends the whole field out at once. Tee sheets — groups
            and times — are on the way; choosing one says so on the schedule.
          </p>

          {rounds.length === 0 ? (
            <p className="t-cap text-ink/65 text-center py-2">No rounds yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rounds.map(round => {
                const chosen = parseStartFormat(round.startFormat)
                return (
                  <li key={round.id} className="bg-surface border border-bark/12 rounded-2xl p-4">
                    <p className="text-ink text-sm font-medium mb-3">
                      Round {round.roundNumber}
                      {round.courseName ? ` — ${round.courseName}` : ''}
                    </p>

                    <div className="flex gap-1.5">
                      {(['shotgun', 'tee_sheet'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => saveFormat(round, f)}
                          aria-pressed={chosen === f}
                          className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                            chosen === f
                              ? 'bg-accent-deep text-white'
                              : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                          }`}
                        >
                          {START_FORMAT_LABEL[f]}
                        </button>
                      ))}
                    </div>

                    {chosen === 'shotgun' && round.itineraryItemId && (
                      <div className="mt-3">
                        <label className="block text-ink/80 text-[13px] uppercase tracking-wider mb-2">
                          Shotgun time
                        </label>
                        {/* The same native-control fixes DateField carries,
                            for the same iOS reasons. */}
                        <input
                          type="time"
                          value={round.teeTime ?? ''}
                          onChange={e => saveTime(round, e.target.value)}
                          className="block w-full min-w-0 max-w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5 text-ink text-sm focus:outline-none focus:border-accent/50 transition-colors"
                          style={{
                            colorScheme: 'dark',
                            WebkitAppearance: 'none',
                            appearance: 'none',
                            minWidth: 0,
                            maxWidth: '100%',
                          }}
                        />
                      </div>
                    )}

                    {chosen === 'tee_sheet' && (
                      <p className="text-ink/65 text-[13px] mt-3 leading-snug">
                        The schedule now says tee sheet. Building the sheet
                        itself — groups and times — is coming soon.
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {startError && (
            <p className="text-rust-deep text-sm mt-3 leading-snug">{startError}</p>
          )}
        </section>

        {/* ── The rest of the running of the event ──
            The setup screen holds formats, players, teams and the running
            order, and an event's field never sees it — the tab bar hides
            Trip Setup for a tournament, so this is its one door. The PIN
            that opened this screen has already opened that one: both gates
            remember the same unlock for the session. */}
        <section className="mt-10">
          <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-3">Event settings</h2>
          <Link
            href={`/trip/${tripCode}/setup`}
            className="block bg-surface border border-bark/12 rounded-2xl p-4 press hover:border-bark/25"
          >
            <p className="text-ink text-sm font-medium">Formats, players &amp; teams</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
              Leaderboards, the field, the running order — the setup screen,
              already unlocked by your PIN.
            </p>
          </Link>
        </section>

      </div>
    </main>
  )
}
