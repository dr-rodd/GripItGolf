'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import {
  MAX_NOTICE, normalizeNotice, parseStartFormat,
  START_FORMAT_LABEL, type StartFormat, teeSheetInUse,
} from '@/lib/eventHub'
import {
  type EventPermissions, describePermissions, permissionsFor,
} from '@/lib/eventPermissions'
import EventPermissionToggles from '@/app/components/EventPermissionToggles'
import Toggle from '@/app/components/Toggle'
import TeeTimesAccess from '@/app/components/TeeTimesAccess'
import TeeSheetRoundControls from '../teesheet/TeeSheetRoundControls'
import { ChoiceChips, FIELD, FIELD_LABEL, ListGroup, ListRow, SectionHeader, buttonClass, cardClass, iconButtonClass } from '@/app/components/ui'
import { courseLabel } from '@/lib/courseDirectory'
import GolfIrelandRequests, { type LinkRequest } from './GolfIrelandRequests'

/**
 * What the organiser can actually do, once past the PIN.
 *
 * Notices: post to the Event Hub's Notices section, newest first, and take
 * one down again. Home screen and tabs: what the field's home screen and
 * bar carry — notices and tee times follow what is set below, stats is a
 * switch of its own (lib/eventHub.ts `activeHubModules`, `eventFourthTab`).
 * Starts: per round, shotgun (one time for the field — the time is written
 * to the round's itinerary item, where the countdown, the weather and the
 * schedule already read it) or tee sheet, whose times are made in the tee
 * sheet wizard; and the tee times question's two answers, who makes the
 * sheets and who places players.
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
  /** Its tee sheet: not made yet, made in the wizard, or made before it (lib/teeSheet.ts). */
  teeState: 'vacant' | 'active' | 'legacy'
  /** The sheet in a line, opening included, or null while it is not open yet. */
  teeSummary: string | null
  /** How many are on its sheet. */
  teeBooked: number
}


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
  initialPermissions, overview, tagsSummary, dayFormatSummary, golfIreland, accessCard, knockout = false, drawSummary = null,
  series = false, initialTrackStats = false, hasTeamBoards = false,
}: {
  /** A leaderboard plays in teams — the team picker gets a row of its own. */
  hasTeamBoards?: boolean
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
  /** Who can see the event — the public PIN card, drawn by the page. */
  /** A match play event: the draw's own row in Running the event. */
  knockout?: boolean
  drawSummary?: string | null
  accessCard?: React.ReactNode
  /** The bird's-eye numbers, counted on the server. */
  overview: Overview
  /** The Tags row's one-liner (lib/tagBoards.ts describeTags). */
  tagsSummary: string
  /** How many days carry a format of their own, said in one line. */
  dayFormatSummary: string
  /** A league reading Golf Ireland: its rules and its link requests. Absent otherwise. */
  golfIreland?: { rulesLine: string; connected: boolean; links: LinkRequest[] } | null
  /** A series league — asked the series-only permissions too (`permissionsFor`). */
  series?: boolean
  /** `trips.track_stats` — whether the event records stats, and so shows them. */
  initialTrackStats?: boolean
}) {
  const permRegistry = permissionsFor(series, knockout)
  // A change to the stats or a round's start can change the bar's fourth
  // tab, which the layout reads — so a landed save refreshes the router.
  const router = useRouter()

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
    return !error
  }

  // The tee times question's answers live in the same map; their own error
  // line, so a refusal reads beside the question it refused.
  const [teeAccessError, setTeeAccessError] = useState<string | null>(null)
  async function saveTeeAccess(next: { anyoneMakes: boolean; playersPick: boolean }) {
    setTeeAccessError(null)
    const ok = await savePermissions({ ...perms, set_tee_sheets: next.anyoneMakes, edit_tee_sheet: next.playersPick })
    if (!ok) { setPermsError(null); setTeeAccessError('Could not save the change — try again') }
  }

  // ── Home screen: stats ───────────────────────────────────────
  // The one module that is a switch rather than a consequence. It is the
  // same `track_stats` Trip Settings carries — recording putts and fairways
  // is what gives the module anything to show — saved the same optimistic
  // way as everything here.
  const [trackStats, setTrackStats] = useState(initialTrackStats)
  const [statsError, setStatsError] = useState<string | null>(null)

  async function saveTrackStats(next: boolean) {
    const prev = trackStats
    setTrackStats(next)
    setStatsError(null)
    const { error } = await supabase
      .from('trips')
      .update({ track_stats: next })
      .eq('id', tripId)
    if (error) {
      setTrackStats(prev)
      setStatsError('Could not save — try again')
      return
    }
    router.refresh()
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
      return
    }
    router.refresh()
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
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">

        <h1 className="t-h1 text-ink mb-1">
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
        <section className={`${cardClass()} p-4 mb-8`}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-card text-ink min-w-0">
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
              <div key={s.label} className="rounded-tile bg-tint px-3 py-3 text-center">
                <p className="text-ink text-lg font-medium tabular-nums leading-none">{s.n}</p>
                <p className="t-cap text-ink/65 mt-1.5">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="t-cap text-ink/65 mt-3 leading-snug">
            {describePermissions(perms, permRegistry)}
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
          <h2 className="t-h2 text-ink mb-1">Participants</h2>
          <p className="text-ink/65 text-[13px] mb-3 leading-snug">
            Changes land on the field&apos;s phones straight away.
          </p>
          <EventPermissionToggles value={perms} onChange={savePermissions} registry={permRegistry} />
          {permsError && (
            <p className="text-rust-deep text-sm mt-3 leading-snug">{permsError}</p>
          )}
        </section>

        {accessCard}

        {/* ── The home screen and tabs ──
            What the field's home screen and bar carry beyond the schedule
            and the field. Each is there only while it is on — the hub never
            draws an empty module. Notices and tee times follow from this
            page (a notice up, a round on a tee sheet), so they say where
            they stand; stats is the one the organiser adds. */}
        <section className="mb-10">
          <h2 className="t-h2 text-ink mb-1">Home screen and tabs</h2>
          <p className="text-ink/65 text-[13px] mb-3 leading-snug">
            Each shows only while it&apos;s on.
          </p>
          <ListGroup>
            <ListRow
              label="Notices"
              hint="On while a notice is up — post one below."
              value={notices.length > 0 ? 'On' : 'Off'}
            />
            <ListRow
              label="Tee times"
              hint="A tab of its own, and each player's time on the home screen, while a round starts from a tee sheet — choose it in Starts."
              value={teeSheetInUse(rounds.map(r => r.startFormat)) ? 'On' : 'Off'}
            />
            <ListRow
              label="Stats"
              hint="The scorecard asks for putts and fairways. A tab of its own — on the home screen instead while tee times have the tab."
              trailing={<Toggle checked={trackStats} onChange={saveTrackStats} label="Stats" />}
            />
          </ListGroup>
          {statsError && (
            <p className="text-rust-deep text-sm mt-3 leading-snug">{statsError}</p>
          )}
        </section>

        {/* ── Post a notice ── */}
        <section>
          <h2 className="t-h2 text-ink mb-3">Notices</h2>

          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={MAX_NOTICE}
            rows={3}
            placeholder="Carts on the path today. Prizegiving at six…"
            className={`${FIELD} resize-none`}
          />
          <button
            onClick={postNotice}
            disabled={posting || !normalizeNotice(draft)}
            className={`${buttonClass('primary')} mt-3`}
          >
            {posting ? 'Posting…' : 'Post notice'}
          </button>

          {noticeError && (
            <p className="text-rust-deep text-sm mt-3 leading-snug">{noticeError}</p>
          )}

          {notices.length > 0 && (
            <ul className="flex flex-col gap-2 mt-5">
              {notices.map(n => (
                <li key={n.id} className={`flex items-start gap-3 ${cardClass()} pl-4 pr-1 py-1`}>
                  <p className="flex-1 min-w-0 py-2.5 text-ink text-sm leading-relaxed whitespace-pre-line">
                    {n.body}
                  </p>
                  <button
                    onClick={() => removeNotice(n.id)}
                    className={iconButtonClass(true)}
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
          <h2 className="t-h2 text-ink mb-1">Starts</h2>
          <p className="text-ink/65 text-[13px] mb-3 leading-snug">
            Shotgun sends everyone out together; a tee sheet sends groups in turn.
          </p>

          {rounds.length === 0 ? (
            <p className="t-cap text-ink/65 text-center py-2">No rounds yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rounds.map(round => {
                const chosen = parseStartFormat(round.startFormat)
                return (
                  <li key={round.id} className={`${cardClass()} p-4`}>
                    <p className="text-ink text-sm font-medium mb-3">
                      Round {round.roundNumber}
                      {round.courseName ? ` — ${courseLabel(round.courseName)}` : ''}
                    </p>

                    <ChoiceChips
                      label={`How round ${round.roundNumber} starts`}
                      value={chosen}
                      onChange={f => saveFormat(round, f)}
                      options={(['shotgun', 'tee_sheet'] as const).map(f => ({ value: f, label: START_FORMAT_LABEL[f] }))}
                    />

                    {chosen === 'shotgun' && round.itineraryItemId && (
                      <div className="mt-3">
                        <label className={FIELD_LABEL}>
                          Shotgun time
                        </label>
                        {/* The same native-control fixes DateField carries,
                            for the same iOS reasons. */}
                        <input
                          type="time"
                          value={round.teeTime ?? ''}
                          onChange={e => saveTime(round, e.target.value)}
                          className={FIELD}
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

                    {/* ── The tee sheet ──
                        Its times are the wizard's: here it says where the
                        sheet stands and is the way in — and the way to
                        clear it. Until it is opened the round is an empty
                        slot on the Tee times tab. */}
                    {chosen === 'tee_sheet' && (
                      <div className="mt-3">
                        <TeeSheetRoundControls
                          tripId={tripId}
                          tripCode={tripCode}
                          roundId={round.id}
                          roundNumber={round.roundNumber}
                          state={round.teeState}
                          summary={round.teeSummary}
                          booked={round.teeBooked}
                          from="organiser"
                        />
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

          {/* The tee times question — who makes the sheets, who places
              players — once any round starts from one. */}
          {teeSheetInUse(rounds.map(r => r.startFormat)) && (
            <div className={`${cardClass()} p-4 mt-4`}>
              <p className="t-label text-ink mb-3">Tee times</p>
              <TeeTimesAccess
                value={{ anyoneMakes: perms.set_tee_sheets, playersPick: perms.edit_tee_sheet }}
                onChange={saveTeeAccess}
              />
              {teeAccessError && (
                <p className="text-rust-deep text-sm mt-3 leading-snug">{teeAccessError}</p>
              )}
            </div>
          )}
        </section>

        {golfIreland && (
          <GolfIrelandRequests
            tripCode={tripCode}
            rulesLine={golfIreland.rulesLine}
            connected={golfIreland.connected}
            initial={golfIreland.links}
          />
        )}

        {/* ── The rest of the running of the event ──
            One list, one row each (refresh plan, 4.2): the tags portal (the
            tags players carry all event), the team picker (while a
            leaderboard plays in teams), a format for each day (only
            worth a door when there is more than one day), the format — a
            match play bracket's setup, or a league's summary, never a form
            that could overwrite the league with a bracket — and the setup
            screen, which the field never sees on an event: the tab bar
            hides Trip Setup for a tournament, so this is its one door. The
            PIN that opened this screen has already opened every one of
            them. */}
        <section className="mt-10">
          <SectionHeader className="mb-4">Running the event</SectionHeader>
          <ListGroup>
            <ListRow href={`/trip/${tripCode}/organiser/tags`} label="Tags" hint={tagsSummary} />
            {/* The team picker — the teams and partnerships the leaderboards
                play in (Ross, 27 Oct 2026: they were hard to find). */}
            {hasTeamBoards && (
              <ListRow href={`/trip/${tripCode}/teams`} label="Teams" hint="Pick the teams, or see the ones players have made." />
            )}
            {rounds.length > 1 && (
              <ListRow href={`/trip/${tripCode}/organiser/days`} label="Each day’s own format" hint={dayFormatSummary} />
            )}
            <ListRow
              href={`/trip/${tripCode}/organiser/bracket`}
              label={isLeague ? 'League' : 'Bracket setup'}
              hint={formatSummary ?? 'Mode, field size, qualifying and round deadlines.'}
            />
            {knockout && (
              <ListRow
                href={`/trip/${tripCode}/organiser/draw`}
                label="The draw"
                hint={drawSummary ?? 'Random, seeded or picked by hand — now, or on a date.'}
              />
            )}
            <ListRow
              href={`/trip/${tripCode}/setup`}
              label="Formats, players and teams"
              hint="Leaderboards, the field, the running order."
            />
          </ListGroup>
        </section>

      </div>
    </main>
  )
}
