'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { describeShortDate } from '@/lib/itinerary'
import { cardKey, insertedRoundNumber, nextRoundIssue, parseLeagueSetup } from '@/lib/leagueSetup'
import {
  addLeagueRound, confirmLeagueVenue, setCardCounts, setRoundAllowance,
} from '@/lib/leagueRoundStore'
import { type Leaderboard, boardTitle, offersAllowance, parseLeaderboards } from '@/lib/leaderboards'
import { ALLOWANCE_PRESETS, allowanceOf } from '@/lib/handicapAllowance'
import { readLiveScores, readScores } from '@/lib/scoreReads'
import type { RoundCard } from '@/lib/golfIreland'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { Sheet } from '@/app/components/ItineraryForms'
import CourseSelect from '@/app/components/CourseSelect'
import DateField from '@/app/components/DateField'
import Toggle from '@/app/components/Toggle'
import CourseName from '@/app/components/CourseName'
import InlineUnlock from '@/app/components/InlineUnlock'
import { FIELD_LABEL, IconButton, Segmented, cardClass, chipClass } from '@/app/components/ui'
import { IconPlus, IconSettings } from '@/app/components/icons'

/**
 * A league's rounds, where the field can touch them — the Scoring tab and
 * the hub (docs/event-use-cases.md).
 *
 * Two doors, both for a dated series: **Add round**, a round on any date
 * after the last one played, at the last venue unless told otherwise or
 * left TBC — it takes its place in date order and the rounds after it move
 * up a number; and a **TBC round's tile**, paler than the rest, which opens
 * "Choose the venue". Choosing one makes the round
 * (lib/leagueRoundStore.ts), and only then can it be scored — a TBC round
 * has nothing to open a card on. A round not reachable yet — dated after
 * the next one — wears `LockedRoundTile`: shown, pale, and inert.
 *
 * Who may: the organiser always, with the PIN asked in place; the field
 * when the organiser has switched on `add_rounds` or `set_venues`. Adding a
 * missing course from the picker is the field's only with `add_courses`.
 */

/** What both doors are told about the league and the person holding the phone. */
export type LeagueDoor = {
  tripId: string
  tripCode: string
  /** The first round's date — the trip's start. */
  startDate: string
  passcodeHash: string | null
  /** `add_courses` is on: the field may add a missing course from the picker. */
  fieldMayAddCourses: boolean
}

// ─── Shared pieces ─────────────────────────────────────────────

/**
 * The players a new round gives a handicap snapshot to, fetched when a
 * sheet opens and not before — the Scoring tab's rule (AddRound's note).
 * Null until loaded; a failed fetch stops the save rather than making a
 * round nobody has a handicap on.
 */
function usePlayers(tripId: string, enabled: boolean) {
  const [players, setPlayers] = useState<{ id: string; handicap: number | null }[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || players) return
    let live = true
    supabase
      .from('players')
      .select('id, handicap')
      .eq('trip_id', tripId)
      .eq('is_composite', false)
      .then(({ data, error }) => {
        if (!live) return
        if (error) { console.error('League players fetch failed:', error); setFailed(true); return }
        setPlayers(data ?? [])
      })
    return () => { live = false }
  }, [enabled, tripId, players])

  return { players, failed }
}

/** The course list plus anything added from the picker mid-flow. */
function useCourses(enabled: boolean) {
  const { courses } = usePlatformCourses(enabled)
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const all = useMemo(() => {
    const known = new Set(courses.map(c => c.id))
    return [...courses, ...added.filter(c => !known.has(c.id))]
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [courses, added])
  const upsert = (course: DirectoryCourse) =>
    setAdded(prev => prev.some(c => c.id === course.id)
      ? prev.map(c => (c.id === course.id ? course : c))
      : [...prev, course])
  return { courses: all, upsert }
}

/** The PIN, asked in place, when the field has not been given this. */
function OrganiserOnly({ door, what, onUnlocked }: {
  door: LeagueDoor; what: string; onUnlocked: () => void
}) {
  if (!door.passcodeHash) return null
  return (
    <div className={`p-4 ${cardClass()}`}>
      <p className="text-ink text-sm font-medium">The organiser {what}</p>
      <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
        Enter the organiser PIN to carry on.
      </p>
      <InlineUnlock
        tripCode={door.tripCode}
        passcodeHash={door.passcodeHash}
        onUnlocked={onUnlocked}
        prompt="Enter the PIN"
      />
    </div>
  )
}

/** Today on the device's own calendar — the day being played. */
function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ─── Add round ─────────────────────────────────────────────────

export function AddLeagueRound({
  door, endDate, rounds, lastPlayedDate, positionsByDay, lastVenueId, fieldMayAdd,
}: {
  door: LeagueDoor
  endDate: string | null
  /** Every round of the league, TBC ones included — dates and numbers. */
  rounds: { date: string | null; number: number }[]
  /** The latest date a round has scores or a card open on — a new one goes after it. */
  lastPlayedDate: string | null
  /** How many items each day already holds, so the round goes after them. */
  positionsByDay: Record<number, number>
  /** The most recent round's course — a league presumes its home venue. */
  lastVenueId: string | null
  /** `add_rounds` is on: the field adds rounds without the PIN. */
  fieldMayAdd: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [date, setDate] = useState('')
  const [courseId, setCourseId] = useState('')
  const [tbc, setTbc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { courses, upsert } = useCourses(open)
  const { players, failed } = usePlayers(door.tripId, open)

  const organiser = unlocked || !isLocked(door.passcodeHash)
  const mayAdd = fieldMayAdd || organiser
  const roundDates = rounds.flatMap(r => (r.date ? [r.date] : []))
  const rules = { startDate: door.startDate, roundDates, lastPlayedDate }
  // The earliest date the picker offers: the league's start, or the day
  // after the last round played.
  const minDate = lastPlayedDate && lastPlayedDate >= door.startDate
    ? new Date(Date.parse(`${lastPlayedDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    : door.startDate

  function openSheet() {
    // Read on tap, never during render: the unlock lives in sessionStorage
    // and the date on the device's own calendar.
    setUnlocked(hasUnlocked(door.tripCode))
    const today = localToday()
    setDate(nextRoundIssue(today, rules) ? '' : today)
    setCourseId(lastVenueId ?? '')
    setTbc(false)
    setError(null)
    setOpen(true)
  }

  async function add() {
    if (!mayAdd) { setError('Adding a round needs the organiser PIN.'); return }
    const issue = nextRoundIssue(date, rules)
    if (issue) { setError(issue); return }
    if (!tbc && !courseId) { setError('Pick a venue, or leave it to be confirmed.'); return }
    if (!players) {
      setError(failed ? 'Could not load the field — try again' : 'Still loading the field — try again in a moment')
      return
    }

    setSaving(true)
    setError(null)
    const dayIndex = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${door.startDate}T00:00:00Z`)) / 86_400_000)
    const result = await addLeagueRound({
      tripId: door.tripId, startDate: door.startDate, endDate, date,
      courseId: tbc ? null : courseId, number: insertedRoundNumber(rounds, date),
      position: positionsByDay[dayIndex] ?? 0, players,
    })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className={`flex-shrink-0 flex items-center gap-2 pl-3.5 pr-4 py-2.5 -mr-1 hover:border-accent ${cardClass('raised', true)}`}
      >
        <span className="text-accent-deep"><IconPlus size={16} /></span>
        <span className="t-label text-ink">Add round</span>
      </button>

      {open && (
        <Sheet
          title="Add a round"
          onClose={() => !saving && setOpen(false)}
          onAdd={add}
          addLabel={saving ? 'Adding…' : 'Add round'}
          error={error}
        >
          {!mayAdd && (
            <OrganiserOnly door={door} what="adds rounds" onUnlocked={() => setUnlocked(true)} />
          )}

          <DateField label="Date" value={date} onChange={setDate} min={minDate} />
          {date && !nextRoundIssue(date, rules) && insertedRoundNumber(rounds, date) <= rounds.length && (
            <p className="t-cap text-ink/65 -mt-2 leading-snug">
              It becomes round {insertedRoundNumber(rounds, date)}; the rounds after it move up one.
            </p>
          )}

          <div>
            <label className={FIELD_LABEL}>Venue</label>
            {tbc ? (
              <p className="t-cap text-ink/65 leading-snug">
                To be confirmed. The round can’t be played until somebody chooses it.
              </p>
            ) : (
              <CourseSelect
                courses={courses}
                value={courseId}
                onChange={setCourseId}
                onCourseAdded={upsert}
                allowAdd={organiser || door.fieldMayAddCourses}
              />
            )}
            <div className="flex items-center justify-between gap-4 mt-3">
              <p className="text-ink text-sm">Venue to be confirmed</p>
              <Toggle checked={tbc} onChange={setTbc} label="Venue to be confirmed" />
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}

// ─── A round not reachable yet ─────────────────────────────────

/**
 * A round dated after the next one (`seriesListing`'s `locked`): shown so
 * the field can see what is coming, pale, and inert — no card, no venue,
 * no gear — until the round before it has happened (Ross, 26 Oct 2026).
 */
export function LockedRoundTile({ number, date, courseName }: {
  number: number
  date: string
  /** The venue, or null while it is to be confirmed. */
  courseName: string | null
}) {
  return (
    <div
      aria-disabled="true"
      className="flex items-center justify-between w-full px-5 py-4 rounded-card border border-line"
    >
      <div className="min-w-0">
        <p className="t-label text-ink/50 mb-1">
          Round {number} · {describeShortDate(date)}
        </p>
        <p className="t-card text-ink/50 truncate">
          {courseName ? <CourseName name={courseName} /> : 'Venue TBC'}
        </p>
        <p className="t-cap mt-1 text-ink/50">Opens once the round before it has been played</p>
      </div>
    </div>
  )
}

// ─── A round whose venue is TBC ────────────────────────────────

/**
 * The tile a TBC round wears — paler than a round that exists, dashed like
 * the "add" rows elsewhere — and the sheet it opens. Its number is the one
 * `leagueRounds` held for it, and confirming writes exactly that.
 */
export function TbcRoundTile({ door, itemId, date, number, lastVenueId, fieldMaySetVenue }: {
  door: LeagueDoor
  itemId: string
  date: string
  number: number
  lastVenueId: string | null
  /** `set_venues` is on: the field chooses venues without the PIN. */
  fieldMaySetVenue: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [courseId, setCourseId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { courses, upsert } = useCourses(open)
  const { players, failed } = usePlayers(door.tripId, open)

  const organiser = unlocked || !isLocked(door.passcodeHash)
  const mayChoose = fieldMaySetVenue || organiser

  function openSheet() {
    setUnlocked(hasUnlocked(door.tripCode))
    setCourseId(lastVenueId ?? '')
    setError(null)
    setOpen(true)
  }

  async function confirm() {
    if (!mayChoose) { setError('Choosing a venue needs the organiser PIN.'); return }
    if (!courseId) { setError('Pick the venue.'); return }
    if (!players) {
      setError(failed ? 'Could not load the field — try again' : 'Still loading the field — try again in a moment')
      return
    }
    setSaving(true)
    setError(null)
    const result = await confirmLeagueVenue({
      tripId: door.tripId, itemId, courseId, number, date, players,
    })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="flex items-center justify-between w-full px-5 py-4 rounded-card press text-left border border-dashed border-line-strong"
      >
        <div className="min-w-0">
          <p className="t-label text-ink/50 mb-1">
            Round {number} · {describeShortDate(date)}
          </p>
          <p className="t-card text-ink/50">Venue TBC</p>
          <p className="t-cap mt-1 text-ink/50">Tap to choose the venue</p>
        </div>
      </button>

      {open && (
        <Sheet
          title={`Round ${number}’s venue`}
          onClose={() => !saving && setOpen(false)}
          onAdd={confirm}
          addLabel={saving ? 'Saving…' : 'Confirm venue'}
          error={error}
        >
          <p className="t-cap text-ink/65 leading-snug">
            {describeShortDate(date)}. Once it has a venue the round can be scored.
          </p>
          {!mayChoose && (
            <OrganiserOnly door={door} what="chooses venues" onUnlocked={() => setUnlocked(true)} />
          )}
          <div>
            <label className={FIELD_LABEL}>Venue</label>
            <CourseSelect
              courses={courses}
              value={courseId}
              onChange={setCourseId}
              onCourseAdded={upsert}
              allowAdd={organiser || door.fieldMayAddCourses}
            />
          </div>
        </Sheet>
      )}
    </>
  )
}

// ─── One round's settings ──────────────────────────────────────

/**
 * The gear beside a league round on the Scoring tab — that round's own
 * settings (docs/event-use-cases.md, Ross's answer 1). The league's settings
 * live in the organiser area and set the defaults; this manages one round.
 * Every switch here is a toggle, never permanent: nothing touches a score.
 *
 * **Round** — whether the round counts towards the league (`rounds.casual`,
 * stage 2: rained off, short of players), and each player's card in it
 * (`LeagueSetup.cardsOff`, stage 3: a Golf Ireland card swept in from a
 * different competition, or any card the league should not count). Both
 * are read in `buildRows` and nowhere else. A Golf Ireland card matched to
 * the round by its date and venue is listed with the rest and switched off
 * by the same key (stage 5) — the way out of a card matched wrongly.
 *
 * **Rules** — the round's own handicap allowance on each leaderboard
 * (`Leaderboard.roundAllowances`), the league's being the default. Kept on
 * its own tab, as Ross asked, so the gear opens uncluttered.
 *
 * All of it the organiser's, with the PIN asked in place — sensitive.
 */
/** One empty list, so a gear with no Golf Ireland cards never re-fetches on a re-render. */
const NO_CARDS: RoundCard[] = []

export function RoundSettings({ door, roundId, number, casual, golfIrelandCards = NO_CARDS }: {
  door: Pick<LeagueDoor, 'tripId' | 'tripCode' | 'passcodeHash'>
  roundId: string
  number: number
  /** The round does not count towards the league just now. */
  casual: boolean
  /**
   * The Golf Ireland cards played as this round — read on the server,
   * which alone can (lib/golfIrelandCards.ts). Totals only.
   */
  golfIrelandCards?: RoundCard[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'round' | 'rules'>('round')
  const [unlocked, setUnlocked] = useState(false)
  const [counts, setCounts] = useState(!casual)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { data, reload } = useRoundGear(door.tripId, roundId, open, golfIrelandCards)

  const organiser = unlocked || !isLocked(door.passcodeHash)

  function openSheet() {
    setUnlocked(hasUnlocked(door.tripCode))
    setCounts(!casual)
    setTab('round')
    setError(null)
    setOpen(true)
  }

  /** One write, the organiser's, then the page re-read from the server. */
  async function save(write: () => Promise<{ ok: boolean; error?: string }>) {
    if (!organiser) { setError('Changing a round needs the organiser PIN.'); return false }
    setSaving(true)
    setError(null)
    const result = await write()
    setSaving(false)
    if (!result.ok) { setError(result.error ?? 'Could not save the change — try again.'); return false }
    reload()
    // The tab, the hub and the board all read these on the server.
    router.refresh()
    return true
  }

  async function setCounting(next: boolean) {
    setCounts(next)
    const done = await save(async () => {
      const { error: writeError } = await supabase
        .from('rounds')
        .update({ casual: !next })
        .eq('trip_id', door.tripId)
        .eq('id', roundId)
      if (writeError) console.error('Round counting write failed:', writeError)
      return writeError ? { ok: false } : { ok: true }
    })
    if (!done) setCounts(!next)
  }

  return (
    <>
      <IconButton
        label={`Round ${number} settings`}
        onClick={openSheet}
        className="flex-shrink-0 self-center"
      >
        <IconSettings size={20} />
      </IconButton>

      {open && (
        <Sheet
          title={`Round ${number}`}
          onClose={() => !saving && setOpen(false)}
          onAdd={() => !saving && setOpen(false)}
          addLabel="Done"
          error={error}
        >
          {!organiser && door.passcodeHash && (
            <div className={`p-4 ${cardClass()}`}>
              <p className="text-ink text-sm font-medium">The organiser changes a round</p>
              <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
                Enter the organiser PIN to carry on.
              </p>
              <InlineUnlock
                tripCode={door.tripCode}
                passcodeHash={door.passcodeHash}
                onUnlocked={() => setUnlocked(true)}
                prompt="Enter the PIN"
              />
            </div>
          )}

          <Segmented
            label="Round settings"
            value={tab}
            onChange={setTab}
            options={[{ value: 'round', label: 'Round' }, { value: 'rules', label: 'Rules' }]}
          />

          {tab === 'round' ? (
            <>
              <div className={`p-4 ${cardClass()}`}>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-ink text-sm font-medium">Counts towards the league</p>
                  <Toggle checked={counts} onChange={setCounting} label="Counts towards the league" />
                </div>
                <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                  {counts
                    ? 'Switch off for a round rained off or short of players. Its scores are kept.'
                    : 'Not counting. Its scores are kept and its own leaderboard shows, greyed; the overall skips it. Switch back any time.'}
                </p>
              </div>

              <div>
                <label className={FIELD_LABEL}>Cards</label>
                {(data.state === 'idle' || data.state === 'loading') && (
                  <p className="t-cap text-ink/65">Loading the cards…</p>
                )}
                {data.state === 'failed' && <p className="t-cap text-rust-deep">Could not load the cards — try again.</p>}
                {data.state === 'ready' && data.cards.length === 0 && (
                  <p className="t-cap text-ink/65">No cards in this round yet.</p>
                )}
                {data.state === 'ready' && data.cards.length > 0 && (
                  <div className="space-y-2">
                    {data.cards.map(card => {
                      const on = !data.cardsOff.includes(cardKey(roundId, card.id))
                      return (
                        <div key={card.id} className={`flex items-center justify-between gap-4 px-4 py-3 ${cardClass()}`}>
                          <div className="min-w-0">
                            <p className={`text-sm truncate ${on ? 'text-ink' : 'text-ink/50'}`}>{card.name}</p>
                            {card.golfIreland && (
                              <p className="t-cap text-ink/65">{card.golfIreland}</p>
                            )}
                            {!on && <p className="t-cap text-ink/65">Doesn’t count</p>}
                          </div>
                          <Toggle
                            checked={on}
                            onChange={next => save(() => setCardCounts({
                              tripId: door.tripId, roundId, playerId: card.id, counts: next,
                            }))}
                            label={`${card.name}’s card counts`}
                          />
                        </div>
                      )
                    })}
                    <p className="t-cap text-ink/65 leading-snug">
                      A card switched off is out of every leaderboard, this round’s too. Its scores are kept.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="t-cap text-ink/65 leading-snug">
                This round’s handicap allowance on each leaderboard. The league’s own is the default.
              </p>
              {data.state === 'ready' && data.boards.length === 0 && (
                <p className="t-cap text-ink/65">No leaderboard here plays off an allowance.</p>
              )}
              {data.state === 'ready' && data.boards.map(board => {
                const leagueOwn = allowanceOf(board)
                const own = board.roundAllowances?.[roundId]
                const choices = [...new Set<number>([...ALLOWANCE_PRESETS, leagueOwn])].sort((a, b) => b - a)
                return (
                  <div key={board.id}>
                    <label className={FIELD_LABEL}>{boardTitle(board)}</label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        aria-pressed={own == null}
                        onClick={() => save(() => setRoundAllowance({
                          tripId: door.tripId, boardId: board.id, roundId, pct: null,
                        }))}
                        className={chipClass(own == null)}
                      >
                        League ({leagueOwn}%)
                      </button>
                      {choices.filter(pct => pct !== leagueOwn).map(pct => (
                        <button
                          key={pct}
                          type="button"
                          aria-pressed={own === pct}
                          onClick={() => save(() => setRoundAllowance({
                            tripId: door.tripId, boardId: board.id, roundId, pct,
                          }))}
                          className={chipClass(own === pct)}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              {data.state === 'failed' && <p className="t-cap text-rust-deep">Could not load the leaderboards — try again.</p>}
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}

/** "Golf Ireland card · 34 points" — what the gear says of a card read in. */
export function describeRoundCard(c: Pick<RoundCard, 'points' | 'gross' | 'holes'>): string {
  const parts = ['Golf Ireland card']
  if (c.points != null) parts.push(`${c.points} points`)
  else if (c.gross != null) parts.push(`${c.gross} gross`)
  if (c.holes === 9) parts.push('9 holes')
  return parts.join(' · ')
}

type GearData =
  | { state: 'idle' | 'loading' | 'failed'; cards: []; cardsOff: []; boards: [] }
  | {
      state: 'ready'
      /**
       * The players with a card in this round — the ones there is anything
       * to switch. `golfIreland` describes the card when the round is a
       * Golf Ireland card rather than one scored here.
       */
      cards: { id: string; name: string; golfIreland?: string }[]
      cardsOff: string[]
      /** The league boards a round's allowance means anything on. */
      boards: Leaderboard[]
    }

const EMPTY_GEAR: GearData = { state: 'idle', cards: [], cardsOff: [], boards: [] }

/**
 * What the gear shows, fetched when it opens and again after every write:
 * who has a card in the round (committed or in play, read whole past the
 * 1,000-row cap — lib/scoreReads.ts), the switched-off cards and the
 * boards, as stored now rather than as the page loaded them.
 */
function useRoundGear(tripId: string, roundId: string, enabled: boolean, imported: readonly RoundCard[]) {
  const [data, setData] = useState<GearData>(EMPTY_GEAR)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let live = true
    Promise.all([
      supabase.from('trips').select('bracket_setup, leaderboards').eq('id', tripId).single(),
      supabase.from('players').select('id, name').eq('trip_id', tripId).eq('is_composite', false).order('name'),
      readScores<{ player_id: string; round_id: string; hole_id: string }>(
        supabase, 'player_id, round_id, hole_id', [roundId]),
      readLiveScores<{ player_id: string; round_id: string; hole_number: number }>(
        supabase, 'player_id, round_id, hole_number', [roundId]),
    ]).then(([tripRes, playersRes, scoresRes, liveRes]) => {
      if (!live) return
      if (tripRes.error || playersRes.error || scoresRes.error || liveRes.error) {
        console.error('Round gear fetch failed:',
          tripRes.error ?? playersRes.error ?? scoresRes.error ?? liveRes.error)
        setData({ state: 'failed', cards: [], cardsOff: [], boards: [] })
        return
      }
      const trip = tripRes.data as { bracket_setup?: unknown; leaderboards?: unknown }
      const holding = new Set([
        ...(scoresRes.data ?? []).map(s => s.player_id),
        ...(liveRes.data ?? []).map(s => s.player_id),
      ])
      // A card scored here is the round's own card and wins on the board,
      // so a player holding both is listed as the live card alone.
      const fromGi = new Map(imported.filter(c => !holding.has(c.playerId)).map(c => [c.playerId, c]))
      setData({
        state: 'ready',
        cards: (playersRes.data ?? [])
          .filter(p => holding.has(p.id) || fromGi.has(p.id))
          .map(p => {
            const gi = fromGi.get(p.id)
            return gi ? { ...p, golfIreland: describeRoundCard(gi) } : p
          }),
        cardsOff: parseLeagueSetup(trip.bracket_setup)?.cardsOff ?? [],
        boards: parseLeaderboards(trip.leaderboards).filter(b => offersAllowance(b)),
      })
    })
    return () => { live = false }
    // `imported` is a server prop: it changes only when the page re-renders.
  }, [tripId, roundId, enabled, version, imported])

  return { data, reload: () => setVersion(v => v + 1) }
}
