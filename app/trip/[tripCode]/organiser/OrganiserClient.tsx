'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import {
  MAX_NOTICE, normalizeNotice, parseStartFormat,
  START_FORMAT_LABEL, type StartFormat,
} from '@/lib/eventHub'
import {
  type EventPermissions, describePermissions,
} from '@/lib/eventPermissions'
import EventPermissionToggles from '@/app/components/EventPermissionToggles'
import {
  MIN_TEE_INTERVAL_MINS, MAX_TEE_INTERVAL_MINS,
  MIN_GROUP_SIZE, MAX_GROUP_SIZE,
} from '@/lib/teeSheet'

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
  /** The tee sheet's tuning, defaults filled (lib/teeSheet.ts). */
  teeIntervalMins: number
  teeGroupSize: number
}

const INPUT = [
  'w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5',
  'text-ink placeholder:text-ink/60',
  'focus:outline-none focus:border-accent/50 transition-colors',
].join(' ')

type Overview = {
  name: string
  dates: string | null
  players: number
  claimed: number
  roundCount: number
  boardCount: number
  noticeCount: number
}

export default function OrganiserClient({
  tripId, tripCode, initialNotices, initialRounds, formatSummary, isLeague,
  initialPermissions, overview, tagsSummary,
}: {
  tripId: string
  tripCode: string
  initialNotices: Notice[]
  initialRounds: RoundInfo[]
  /** The saved tournament format in one line, or null when none is saved yet. */
  formatSummary: string | null
  /** A league event — the format card describes rather than invites setup. */
  isLeague: boolean
  /** The stored participant permissions, defaults filled (lib/eventPermissions.ts). */
  initialPermissions: EventPermissions
  /** The bird's-eye numbers, counted on the server. */
  overview: Overview
  /** The Teams & tags card's one-liner (lib/tagBoards.ts describeTags). */
  tagsSummary: string
}) {
  // ── Participant permissions ──────────────────────────────────
  // Saved the moment a toggle moves — optimistic, reverting on refusal,
  // the same manners as every organiser write. The whole map goes each
  // time: it is one setting, read whole (lib/eventPermissions.ts).
  const [perms, setPerms] = useState<EventPermissions>(initialPermissions)
  const [permsError, setPermsError] = useState<string | null>(null)

  async function savePermissions(next: EventPermissions) {
    const prev = perms
    setPerms(next)
    setPermsError(null)

    const { error } = await supabase
      .from('trips')
      .update({ event_permissions: next })
      .eq('id', tripId)

    if (error) {
      setPerms(prev)
      setPermsError(/column|schema cache/i.test(error.message ?? '')
        ? 'Could not save — a database update may not have been applied yet.'
        : 'Could not save the change — try again')
    }
  }

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

  /**
   * The tee sheet's tuning, saved as it moves — interval and group size to
   * the round's own columns (migration 050), the same optimistic manners
   * as everything else on this screen.
   */
  async function saveTeeSetting(
    round: RoundInfo,
    patch: { teeIntervalMins?: number; teeGroupSize?: number },
  ) {
    const prev = { teeIntervalMins: round.teeIntervalMins, teeGroupSize: round.teeGroupSize }
    patchRound(round.id, patch)
    setStartError(null)

    const { error } = await supabase
      .from('rounds')
      .update({
        ...(patch.teeIntervalMins !== undefined ? { tee_interval_mins: patch.teeIntervalMins } : {}),
        ...(patch.teeGroupSize !== undefined ? { tee_group_size: patch.teeGroupSize } : {}),
      })
      .eq('id', round.id)
      .eq('trip_id', tripId)

    if (error) {
      patchRound(round.id, prev)
      setStartError(/column|schema cache/i.test(error.message ?? '')
        ? 'Could not save — a database update may not have been applied yet.'
        : 'Could not save the tee sheet setting — try again')
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
        <p className="text-ink/65 text-sm mb-6">
          Your event at a glance, and everything you run it with.
        </p>

        {/* ── The event, above the fold ──
            The bird's-eye card: what this event is and where it stands,
            before any of the levers. Counted on the server; the code is
            here because this page is what the admin email links to, and
            the code is the first thing an organiser passes on. */}
        <section className="bg-surface border border-bark/12 rounded-2xl p-4 mb-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-[family-name:var(--font-display)] text-xl text-ink min-w-0">
              {overview.name}
            </p>
            <p className="t-label text-accent-deep tabular-nums flex-shrink-0">{tripCode}</p>
          </div>
          {(overview.dates || formatSummary) && (
            <p className="t-cap text-ink/65 mt-1 leading-snug">
              {[overview.dates, formatSummary].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              {
                n: `${overview.claimed}/${overview.players}`,
                label: overview.players === 1 ? 'player in' : 'players in',
              },
              {
                n: String(overview.roundCount),
                label: overview.roundCount === 1 ? 'round' : 'rounds',
              },
              {
                n: String(overview.boardCount),
                label: overview.boardCount === 1 ? 'leaderboard' : 'leaderboards',
              },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-bark/[0.04] px-3 py-3 text-center">
                <p className="text-ink text-lg font-medium tabular-nums leading-none">{s.n}</p>
                <p className="t-cap text-ink/65 mt-1.5">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="t-cap text-ink/65 mt-3 leading-snug">
            {describePermissions(perms)}
            {overview.noticeCount > 0 &&
              ` ${overview.noticeCount} notice${overview.noticeCount === 1 ? '' : 's'} up.`}
          </p>
        </section>

        {/* ── Participant permissions ──
            The same three answers creation asks, editable for the life of
            the event and saved the moment they move. What they gate is the
            field's screens — the organiser, holding this page, is never
            gating themselves. */}
        <section className="mb-10">
          <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-1">Participants</h2>
          <p className="text-ink/65 text-[13px] mb-3 leading-snug">
            How collaborative this event is. Changes land on the field&apos;s
            phones straight away.
          </p>
          <EventPermissionToggles value={perms} onChange={savePermissions} />
          {permsError && (
            <p className="text-rust-deep text-sm mt-3 leading-snug">{permsError}</p>
          )}
        </section>

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

                    {/* ── Tee sheet settings ──
                        The sheet's tuning lives with the choice that makes
                        it a tee-sheet morning. First group time: the same
                        time control shotgun uses — one clock, on the
                        round's itinerary item, where everything reads it. */}
                    {chosen === 'tee_sheet' && (
                      <div className="mt-3 space-y-3">
                        {round.itineraryItemId && (
                          <div>
                            <label className="block text-ink/80 text-[13px] uppercase tracking-wider mb-2">
                              First group
                            </label>
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

                        <div>
                          <label className="block text-ink/80 text-[13px] uppercase tracking-wider mb-2">
                            Minutes between groups
                          </label>
                          <div className="flex gap-1.5">
                            {[5, 8, 10, 12, 15, 20].map(m => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => saveTeeSetting(round, { teeIntervalMins: m })}
                                aria-pressed={round.teeIntervalMins === m}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                  round.teeIntervalMins === m
                                    ? 'bg-accent-deep text-white'
                                    : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-ink/80 text-[13px] uppercase tracking-wider mb-2">
                            Players per group
                          </label>
                          <div className="flex gap-1.5">
                            {Array.from(
                              { length: MAX_GROUP_SIZE - MIN_GROUP_SIZE + 1 },
                              (_, i) => MIN_GROUP_SIZE + i,
                            ).map(n => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => saveTeeSetting(round, { teeGroupSize: n })}
                                aria-pressed={round.teeGroupSize === n}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                  round.teeGroupSize === n
                                    ? 'bg-accent-deep text-white'
                                    : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>

                        <Link
                          href={`/trip/${tripCode}/teesheet`}
                          className="block t-cap text-accent-deep hover:text-accent transition-colors"
                        >
                          Open the tee sheet →
                        </Link>
                      </div>
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

        {/* ── Teams & tags ──
            The tags portal: the event-wide sides players carry all week,
            made and assigned behind this card. Playing teams for a given
            day stay the tee sheet's business; the tag is the census, and
            the census lives with the organiser. */}
        <section className="mt-10">
          <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-3">Teams &amp; tags</h2>
          <Link
            href={`/trip/${tripCode}/organiser/tags`}
            className="block bg-surface border border-bark/12 rounded-2xl p-4 press hover:border-bark/25"
          >
            <p className="text-ink text-sm font-medium">Tags</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
              {tagsSummary}
            </p>
          </Link>
        </section>

        {/* ── The format ──
            The tournament's competition structure, saved whole in
            trips.bracket_setup. A match play event sets its bracket on the
            form behind this card — mode, field size, qualifying, deadlines
            (lib/bracketSetup.ts). A league was created whole through its
            own door (lib/leagueSetup.ts), so its card describes rather than
            invites: the screen behind it is a summary, never a form that
            could overwrite the league with a bracket. The PIN that opened
            this screen has already opened that one. */}
        <section className="mt-10">
          <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-3">Format</h2>
          <Link
            href={`/trip/${tripCode}/organiser/bracket`}
            className="block bg-surface border border-bark/12 rounded-2xl p-4 press hover:border-bark/25"
          >
            <p className="text-ink text-sm font-medium">
              {isLeague ? 'League' : 'Bracket setup'}
            </p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
              {formatSummary
                ?? 'Match play knockout — mode, field size, qualifying and round deadlines.'}
            </p>
          </Link>
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
