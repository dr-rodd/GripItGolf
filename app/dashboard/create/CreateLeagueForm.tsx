'use client'

import { enterGoesTo } from '@/lib/focusNext'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import DateField from '@/app/components/DateField'
import Toggle from '@/app/components/Toggle'
import CourseSelect from '@/app/components/CourseSelect'
import HandicapField from '@/app/components/HandicapField'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { NO_FORMATS } from '@/lib/formats'
import { normaliseEmail, emailWarning, MAX_EMAIL } from '@/lib/email'
import { rememberPlayer } from '@/lib/playerCookie'
import {
  dayCount, dateForDay, describeDay, dayNumber, describeShortDate, isWholeDate, type ItineraryItem,
} from '@/lib/itinerary'
import { toItemRow } from '@/lib/itinerarySync'
import {
  MIN_PASSCODE, MAX_PASSCODE, passcodeError,
} from '@/lib/passcode'
import { NO_PUBLIC_PIN, publicPinIssue } from '@/lib/publicPin'
import PublicPinField from '@/app/components/PublicPinField'
import { parseHandicap, isPlusHandicap, isHandicapPending, PLUS_HANDICAP_WARNING } from '@/lib/handicap'
import { firstDuplicateIndex, duplicateNameError } from '@/lib/roster'
import {
  type PlayerEntry, PLAYER_ENTRIES, NO_DEADLINES_ANSWER, deadlinesAnswerIssue, storedDeadlines, type DeadlinesAnswer,
} from '@/lib/bracketSetup'
import RoundDeadlines from '@/app/components/RoundDeadlines'
import { setRoundDeadlines } from '@/lib/leagueRoundStore'
import {
  type DayBoards, type LeagueSetup, type LeagueSchedule, type RepeatUnit, DAY_BOARDS,
  MAX_LEAGUE_DAYS, MAX_REPEAT_EVERY, REPEAT_UNITS,
  asksRoundDeadlines, describeRepeat, leagueDaysIssue, seriesDates,
  type LeaguePeriod, type PeriodRule, PERIOD_RULES, MAX_PERIODS, MAX_PERIOD_EVERY,
  equalPeriods, periodsIssue, describePeriod,
} from '@/lib/leagueSetup'
import type { Leaderboard } from '@/lib/leaderboards'
import LeaderboardSetup from '@/app/components/LeaderboardSetup'
import {
  type EventPermissions, defaultPermissions, permissionsFor, storedPermissions,
} from '@/lib/eventPermissions'
import CollaborationQuestion from '@/app/components/CollaborationQuestion'
import { NO_FIELD_TAGS, fieldTagsIssue, tagCounts, withLeagueTagBoard, type FieldTags } from '@/lib/fieldTags'
import { PlayerTagChips, TagsCard } from './FieldTags'
import { writeFieldTags } from './fieldTagsWrite'
import { TeeTimesQuestion } from '@/app/components/TeeTimesAccess'
import GolfIrelandRulesForm from '@/app/components/GolfIrelandRulesForm'
import {
  type GolfIrelandRules, type ScoreSource, SCORE_SOURCES,
  defaultRules, parseGolfIrelandRules, readsGolfIreland,
} from '@/lib/golfIreland'
import { describeError, generateCode } from './CreateTripForm'
import { CODE_CHAR, FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass, optionClass } from '@/app/components/ui'
import WizardShell from '@/app/components/WizardShell'
import { Stepper } from '@/app/components/ItineraryForms'
import { tripBase } from '@/lib/tripPaths'
import { DynamicQuestion, SessionList, OverallSetup } from './SessionPicker'
import {
  type SessionDraft, type OverallRanks, type SessionFeed, type OverallRules,
  sessionsIssue, resolvedFormats, inRunningOrder, sessionBoard, overallBoard, feedFor, defaultMatchSlots,
} from '@/lib/sessions'
import { daySheetId } from '@/lib/teamSets'
import { createTripRow, enterEvent } from '@/lib/entryClient'

/**
 * Creating a league event — the league branch of the tournament door.
 *
 * Not the trip wizard re-worn: a league has no itinerary to build and no
 * formats to defer. It is venues, dates, a field and a leaderboard, and it
 * plays from the moment it exists — so this form is its own four steps,
 * purpose-built, and what it reuses from the trip wizard is the proven
 * underneath: the course picker, the player fields, the date fields, the
 * shared row mapping (`toItemRow`) and the shared write order.
 *
 * Single day is deliberately lightweight — one venue, one date, one
 * leaderboard, live scoring, nothing more elaborate. Multi-day adds a venue
 * per day (or one for all, behind a toggle) and one extra question: how the
 * days relate on the leaderboard (lib/leagueSetup.ts `DayBoards`).
 *
 * A series is a league of rounds on their own dates
 * (docs/event-use-cases.md): ad hoc — the first round here, the rest added
 * on the Scoring tab as they are played — or recurring, every so many weeks
 * or months, every round made now (`seriesDates`). Either way the first
 * round's date is the trip's start, and each round sits at its calendar
 * offset from it, the same as a continuous league's days. One venue is
 * presumed for the lot; turned off, each round picks its own or is left
 * **to be confirmed** — a dated golf item with no round yet, made when
 * somebody chooses the venue (lib/leagueSetup.ts says why).
 *
 * What creation writes: the trip row (kind 'tournament', the league setup
 * whole in `bracket_setup`, the starter Stableford board in
 * `leaderboards`), the players, one golf itinerary item per day, the rounds
 * those become, and the handicap snapshots — the platform's insertion
 * order, same as the trip wizard's.
 */

// ── Styles shared with the trip wizard, by convention not import ─────────

/** Each step opens on its question — WizardShell draws it as the step's title. */
type StepKey = 'details' | 'venues' | 'deadlines' | 'field' | 'dynamic' | 'sessions' | 'overall' | 'ready'
const STEP_TITLES: Record<StepKey, string> = {
  details: 'Name your event',
  // A standalone league's first leaderboard decision (Ross, 9 Nov 2026, D35).
  dynamic: 'Enable Dynamic Overall Leaderboard?',
  sessions: 'Set the running order',
  overall: 'Finalise the Overall',
  venues: 'Where you’re playing',
  // Continuous and series leagues, once their rounds are made (Ross, 5 Nov 2026).
  deadlines: 'Set a deadline for each round?',
  field: 'Who’s playing',
  ready: 'Ready to go',
}
/** At most one line under the question. */
const STEP_INTROS: Partial<Record<StepKey, string>> = {
  deadlines: 'Do you want to set a deadline for each round to be completed?',
  dynamic: 'If the format of the golf changes over the course of the event, add each round as individual sessions with its own format and set the rules on how they feed the overall leaderboard.',
  sessions: 'Each session is one round of golf, in its own format.',
  overall: 'Who it ranks, and how each session feeds it.',
}

type PlayerInput = { name: string; handicap: string; gender: 'M' | 'F'; tag?: string }

/** How a league's rounds arrive — the first question a series is asked. */
type SeriesPlan = 'ad_hoc' | 'recurring'
const SERIES_PLANS: { key: SeriesPlan; label: string; hint: string }[] = [
  { key: 'ad_hoc', label: 'Ad hoc', hint:
    'Start with the first round here. Each one after is added on the Scoring tab when it’s played.' },
  { key: 'recurring', label: 'Recurring', hint:
    'A set number of rounds, every so many weeks or months, all made now.' },
]

/** A venue left to be confirmed — a series' round with no course yet. */
const TBC_VENUE = 'tbc'

/** The chip row every either/or question on this form is asked with. */
function Chips<K extends string>({ options, chosen, onChoose }: {
  options: readonly { key: K; label: string }[]
  chosen: K | null
  onChoose: (key: K) => void
}) {
  return (
    <div className="flex gap-1.5">
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChoose(o.key)}
          aria-pressed={chosen === o.key}
          className={`${chipClass(chosen === o.key)} flex-1`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A venue, or — on a series — a venue to be confirmed. The course picker
 * itself is the platform's own; this only adds the switch beside it, and
 * stores the choice as `TBC_VENUE` in the same slot a course id would sit.
 */
function VenuePicker({ courses, value, onChange, onCourseAdded, allowTbc }: {
  courses: DirectoryCourse[]
  value: string
  onChange: (id: string) => void
  onCourseAdded: (course: DirectoryCourse) => void
  allowTbc: boolean
}) {
  const tbc = value === TBC_VENUE
  return (
    <div>
      {tbc ? (
        <p className="t-cap text-ink/65 leading-snug">
          To be confirmed. The round can’t be played until somebody chooses its venue.
        </p>
      ) : (
        <CourseSelect
          courses={courses}
          value={value}
          onChange={onChange}
          onCourseAdded={onCourseAdded}
        />
      )}
      {allowTbc && (
        <div className="flex items-center justify-between gap-4 mt-2">
          <p className="text-ink/65 text-[13px]">Venue to be confirmed</p>
          <Toggle
            checked={tbc}
            onChange={on => onChange(on ? TBC_VENUE : '')}
            label="Venue to be confirmed"
          />
        </div>
      )}
    </div>
  )
}

export default function CreateLeagueForm({ schedule, onExit }: {
  /**
   * The shape chosen on the tournament door — standalone (a single point
   * in time, one day or a run), continuous (a period with the playing days
   * picked inside it, by hand or weekly), or series (a league of rounds,
   * each on its own date, ad hoc or recurring). Decides which
   * questions step one asks and what the
   * venues step is a list of; the players, boards and write path are the
   * same underneath whichever it is.
   */
  schedule: LeagueSchedule
  /**
   * Back to the tournament door's chooser, from step 1 (CreateFlow). Absent
   * — the trip door — step 1 has no way back but the header mark, as ever.
   */
  onExit?: () => void
}) {
  // The platform course list, fetched while the event is being named —
  // venues are step two, so it loads behind the first screen exactly as it
  // does on the trip wizard.
  const { courses: fetched, loaded: coursesLoaded } = usePlatformCourses()
  // A course added mid-build lives here — the fetched list is never mutated,
  // the same rule ItineraryBuilder keeps with its own addedCourses.
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const courses = useMemo(() => {
    const extra = added.filter(a => !fetched.some(c => c.id === a.id))
    return [...fetched, ...extra]
  }, [fetched, added])

  function onCourseAdded(course: DirectoryCourse) {
    setAdded(prev => [...prev.filter(c => c.id !== course.id), course])
  }

  const [step, setStep] = useState<number | 'done'>(1)
  // A play-by date for each round, where the league's shape asks one.
  const [deadlines, setDeadlines] = useState<DeadlinesAnswer>(NO_DEADLINES_ANSWER)
  const [deadlineWarning, setDeadlineWarning] = useState<string | null>(null)

  // Step 1 — the event
  const [name, setName] = useState('')
  const [multiDay, setMultiDay] = useState<boolean | null>(null)
  // Standalone: the run's ends (single day writes one date to both).
  // Continuous: the period the event occupies.
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [email, setEmail] = useState('')

  // Standalone multi-day — the days of the run that nobody plays, by
  // index into the run. A run of days is not a promise of golf on every
  // one of them: a travel day, a rest day in the middle of a long weekend.
  // Empty is every day playing, which is what every standalone event
  // created before this question existed was.
  const [restDays, setRestDays] = useState<number[]>([])

  // Continuous — the league's periods (Ross, 8 Nov 2026): an equal run from
  // `startDate`, then each period's dates adjusted by hand. Any change to
  // the run starts the adjustments again from the run it now makes.
  const continuous = schedule === 'continuous'
  const [periodEvery, setPeriodEvery] = useState(4)
  const [periodUnit, setPeriodUnit] = useState<RepeatUnit>('week')
  const [periodCount, setPeriodCount] = useState(6)
  const [periodEdits, setPeriodEdits] = useState<LeaguePeriod[] | null>(null)
  // Which card counts in a period, and where a card may be played.
  const [periodRule, setPeriodRule] = useState<PeriodRule>('best_card')
  const [anyCourse, setAnyCourse] = useState<boolean | null>(null)
  const [cardCourses, setCardCourses] = useState<string[]>([''])

  // Series — how the rounds arrive, and for a recurring one how often and
  // how many. The first round's date is `startDate`.
  const [seriesPlan, setSeriesPlan] = useState<SeriesPlan | null>(null)
  const [repeatEvery, setRepeatEvery] = useState(1)
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>('week')
  const [eventCount, setEventCount] = useState(8)

  // Step 2 — venues. `venues[i]` is slot i's course id (day i of a
  // standalone run); with the toggle on, the first pick is every slot's and
  // the rest are ignored. A continuous league and a series key by date
  // instead, so a date added or removed in step one cannot silently shuffle
  // the courses.
  const [venues, setVenues] = useState<string[]>([])
  const [dateVenues, setDateVenues] = useState<Record<string, string>>({})
  // A league presumes its home course — on until the organiser says
  // otherwise. Everything else starts off, as it always did.
  const [sameVenue, setSameVenue] = useState(schedule === 'series')

  // Step 3 — the field
  const [entry, setEntry] = useState<PlayerEntry | null>(null)
  const [requireApproval, setRequireApproval] = useState(false)
  const [organiserPlaying, setOrganiserPlaying] = useState(true)
  const [players, setPlayers] = useState<PlayerInput[]>([
    { name: '', handicap: '', gender: 'M' },
  ])
  // Tags, switched on in the field step (lib/fieldTags.ts) — on, the
  // Finish step's leaderboards gain a tags board.
  const [tags, setTags] = useState<FieldTags>(NO_FIELD_TAGS)
  const [tagsWarning, setTagsWarning] = useState<string | null>(null)

  // Step 4 — the leaderboards, how the days relate, and the organiser PIN.
  // Seeded with the starter board so a league that never touches the picker
  // still plays from the moment it exists; the picker itself is the same
  // LeaderboardSetup Trip Setup runs, so creation can offer exactly the
  // competitions the platform can score and not one more.
  // Nothing chosen for the organiser (Ross, 8 Nov 2026): the leaderboards
  // are set by hand, and Finish waits for at least one.
  const [boards, setBoards] = useState<Leaderboard[]>([])
  // The Dynamic Overall Leaderboard (lib/sessions.ts): a standalone
  // league's first leaderboard question, its sessions and the Overall's rules.
  const [dynamic, setDynamic] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<SessionDraft[]>([])
  const [overallRanks, setOverallRanks] = useState<OverallRanks | null>(null)
  const [feeds, setFeeds] = useState<Record<string, SessionFeed>>({})
  const [dayBoards, setDayBoards] = useState<DayBoards | null>(null)
  // How collaborative the event is — all off until the organiser opts in
  // (lib/eventPermissions.ts, the one registry).
  const [perms, setPerms] = useState<EventPermissions>(defaultPermissions)
  // Tee times: on, every round starts from a tee sheet, and the two answers
  // ride in the permissions (components/TeeTimesAccess.tsx).
  const [teeTimes, setTeeTimes] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [passcodeConfirm, setPasscodeConfirm] = useState('')
  const [publicPin, setPublicPin] = useState(NO_PUBLIC_PIN)
  // Where the scores come from — live here, Golf Ireland, or both — and,
  // when Golf Ireland is a source, which of its cards count
  // (lib/golfIreland.ts, docs/golf-ireland.md).
  const [scoreSource, setScoreSource] = useState<ScoreSource>('live')
  const [giRules, setGiRules] = useState<GolfIrelandRules>(() => defaultRules())

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultCode, setResultCode] = useState('')
  const [copied, setCopied] = useState(false)

  // ── Derived shape ────────────────────────────────────────────────────────

  // A date half-typed or scrolled past (year 0202) is no date yet
  // (`isWholeDate`) — read as such, nothing is built from it.
  const datesWhole = isWholeDate(startDate) && isWholeDate(endDate)
  const datesBackwards = !!(datesWhole && endDate < startDate)
  const periodSet = datesWhole && !datesBackwards

  // The standalone run's length in days — how many days the event spans,
  // which is no longer the same question as how many rounds it plays.
  // A run longer than a continuous league's ceiling is the wrong shape
  // rather than a bigger one, and is said so on screen.
  const runLength = schedule === 'standalone' && multiDay && periodSet
    ? dayCount(startDate, endDate)
    : 1
  const runTooLong = runLength > MAX_LEAGUE_DAYS

  // A continuous league's periods — the run as made, or as adjusted.
  const periods: LeaguePeriod[] = !continuous ? []
    : periodEdits ?? equalPeriods(startDate, periodEvery, periodUnit, periodCount)
  const periodsProblem = !continuous ? null
    : !startDate ? 'Pick when the first period starts.'
    : periodsIssue(periods)

  /**
   * The playing slots — what a round will be made from, whatever the
   * shape. Standalone: the days of the run that are being played, each at
   * its own offset, so a rest day in the middle leaves the days either
   * side on their true dates. Continuous: the picked dates, each at its
   * calendar offset inside the period so `dateForDay` keeps telling the
   * truth about it. Series: the first event alone (as you go) or every
   * recurring date, each at its offset from the first — the same reading.
   * The rounds are the one copy of this after creation.
   */
  const slots: { dayIndex: number; date: string | null }[] =
    schedule === 'standalone'
      // Built only once the run is a length the form accepts: before the
      // guard, a half-typed year made this hundreds of thousands long.
      ? Array.from({ length: !multiDay ? 1 : runTooLong ? 0 : runLength }, (_, i) => i)
          .filter(i => !restDays.includes(i))
          .map(i => ({ dayIndex: i, date: dateForDay(startDate || null, i) }))
      // A league of periods makes no rounds at creation: a card is a round,
      // made when a player starts one inside a period.
      : continuous
        ? []
        : !startDate || !seriesPlan
          ? []
          : (seriesPlan === 'recurring'
              ? seriesDates(startDate, { every: repeatEvery, unit: repeatUnit }, eventCount)
              : [startDate]
            ).map(d => ({
              dayIndex: (dayNumber(d)! - dayNumber(startDate)!) / 86_400_000,
              date: d,
            }))

  const daysIssue = continuous ? null : leagueDaysIssue(slots.length, schedule)

  // One slot is asked with the single picker, which writes `venues[0]` —
  // so one slot reads it back from there, whatever the shape keys by.
  const venueFor = (slot: { date: string | null }, i: number) =>
    (sameVenue || slots.length === 1
      ? venues[0]
      : schedule !== 'standalone' && slot.date
        ? dateVenues[slot.date]
        : venues[i]) ?? ''
  const venuesComplete = continuous
    ? anyCourse === true || (anyCourse === false && cardCourses.some(Boolean))
    : slots.length > 0 && slots.every((s, i) => venueFor(s, i) !== '')

  const duplicateIndex = firstDuplicateIndex(players.map(p => p.name))
  const duplicateIssue = duplicateIndex === -1
    ? null
    : duplicateNameError(players[duplicateIndex].name)

  const passcodeIssue =
    passcodeError(passcode) ??
    (passcode !== passcodeConfirm ? 'The two passcodes do not match.' : null)
  // The public PIN, beside it on an event (lib/publicPin.ts).
  const publicIssue = publicPinIssue(publicPin, passcode)

  // The rules as they would be stored, or null while something is missing.
  const giStored = readsGolfIreland(scoreSource) ? parseGolfIrelandRules(giRules) : null
  const giIssue = !readsGolfIreland(scoreSource) ? null
    : giRules.clubs.length === 0 ? 'Golf Ireland needs at least one club — pick one above.'
    : giRules.weekdays?.length === 0 ? 'Tick the days a round may be played on, or choose any day.'
    : !giStored ? 'Answer each Golf Ireland question above.'
    : null

  const step1Valid =
    name.trim().length > 0 &&
    (schedule === 'standalone'
      ? multiDay !== null && (multiDay
          ? periodSet && !runTooLong && !daysIssue
          : isWholeDate(startDate))
      : continuous
        ? periodsProblem === null
        : !!seriesPlan && !!startDate && slots.length > 0 && !daysIssue)

  /** The course a slot is played at, or null while it is to be confirmed. */
  const courseOf = (slot: { date: string | null }, i: number) => {
    const v = venueFor(slot, i)
    return v === TBC_VENUE ? null : v
  }

  // How the days relate is asked of anything with more than one day — and
  // of every series, whose events are added after creation if they were
  // not all made now: one event today is the start of several.
  // Only a standalone league is asked about the Dynamic Overall Leaderboard.
  const asksDynamic = schedule === 'standalone'
  const isDynamic = asksDynamic && dynamic === true
  // The run's playing days, for a session's day.
  const playingDays = slots.map(s => ({ index: s.dayIndex, label: describeDay(s.date, s.dayIndex) }))
  // The sessions as the rounds they become: running order, a position each
  // within its day so two sessions on one day are two golf items.
  const orderedSessions = inRunningOrder(sessions)
  const sessionSlots = orderedSessions.map((sess, i) => ({
    dayIndex: sess.dayIndex,
    date: dateForDay(startDate || null, sess.dayIndex),
    position: orderedSessions.slice(0, i).filter(o => o.dayIndex === sess.dayIndex).length,
    courseId: sess.courseId,
  }))
  const sessionsProblem = isDynamic ? sessionsIssue(orderedSessions) : null
  // Named players so far — what a Matches session's count starts from.
  const fieldCount = players.filter(p => p.name.trim()).length
  const ranks: OverallRanks = overallRanks ?? (tags.on ? 'tags' : 'individuals')
  const overallEntrants = ranks === 'tags' ? Math.max(2, tags.tags?.length ?? 2)
    : ranks === 'individuals' ? Math.max(1, players.filter(p => p.name.trim()).length) : 4

  const asksDayBoards = !continuous && !isDynamic && (slots.length > 1 || schedule === 'series')

  // The deadline question, once the rounds are made — on a league whose
  // rounds are played over a stretch, each round's name and own date.
  const askDeadlines = asksRoundDeadlines(schedule, continuous) && slots.length > 0
  const deadlineNames = slots.map((slot, i) => `Round ${i + 1}${slot.date ? ` · ${describeShortDate(slot.date)}` : ''}`)
  const deadlineFloors = slots.map(slot => slot.date)
  const deadlineOpts = { names: deadlineNames, floors: deadlineFloors }
  // A standalone league asks the field first, then the question, then the
  // running order: venues a day, or (Yes) sessions and the Overall — so the
  // back arrow from the Overall returns to the sessions and from there to
  // the question (Ross, 9 Nov 2026).
  const keys: StepKey[] = asksDynamic
    ? ['details', 'field', 'dynamic', ...(isDynamic ? ['sessions' as const, 'overall' as const] : ['venues' as const]), 'ready']
    : ['details', 'venues', ...(askDeadlines ? ['deadlines' as const] : []), 'field', 'ready']
  const key = keys[Math.min(Number(step) || 1, keys.length) - 1]
  const lastStep = keys.length

  const canProceed = !submitting && (
    key === 'details' ? step1Valid :
    key === 'venues' ? venuesComplete :
    key === 'deadlines' ? !deadlinesAnswerIssue(deadlines, slots.length, deadlineOpts) :
    key === 'field' ? !!entry && !duplicateIssue && !fieldTagsIssue(tags) :
    key === 'dynamic' ? dynamic !== null :
    key === 'sessions' ? sessionsProblem === null :
    key === 'overall' ? (ranks !== 'tags' || tags.on) :
    key === 'ready' ? (isDynamic || boards.length > 0) && (!asksDayBoards || !!dayBoards) && !passcodeIssue && !publicIssue && !giIssue :
    false
  )

  /** Yes chosen: the running order starts with one session. */
  function chooseDynamic(on: boolean) {
    setDynamic(on)
    if (on && sessions.length === 0) {
      setSessions([{
        key: 's-first',
        dayIndex: slots[0]?.dayIndex ?? 0,
        courseId: venues[0] ?? '',
        format: { kind: 'stroke', audience: 'individual', scoring: 'stableford' },
      }])
    }
  }

  /** Yes → No: each day keeps its first session's venue as a plain round. */
  function sessionsToVenues() {
    const next = slots.map(slot => orderedSessions.find(sess => sess.dayIndex === slot.dayIndex)?.courseId ?? '')
    setVenues(next)
    setSameVenue(next.length > 1 && next.every(v => v === next[0]))
  }

  function goNext() {
    if (step === 'done') return
    if (step < lastStep) setStep(step + 1)
    else handleSubmit()
  }

  function goBack() {
    setError(null)
    if (step === 1 && onExit) { onExit(); return }
    if (step !== 'done' && step > 1) setStep(step - 1)
  }

  function setVenue(i: number, id: string) {
    setVenues(prev => {
      const next = [...prev]
      while (next.length <= i) next.push('')
      next[i] = id
      return next
    })
  }

  function setDateVenue(date: string, id: string) {
    setDateVenues(prev => ({ ...prev, [date]: id }))
  }

  /** One period's start or finish moved by hand — the run keeps its keys. */
  function setPeriodDate(i: number, end: 'start' | 'end', value: string) {
    setPeriodEdits(periods.map((p, idx) => (idx === i ? { ...p, [end]: value } : p)))
  }

  /** The run's own answers: any change makes the run afresh. */
  function setRun(patch: { every?: number; unit?: RepeatUnit; count?: number; start?: string }) {
    if (patch.every !== undefined) setPeriodEvery(patch.every)
    if (patch.unit !== undefined) setPeriodUnit(patch.unit)
    if (patch.count !== undefined) setPeriodCount(patch.count)
    if (patch.start !== undefined) setStartDate(patch.start)
    setPeriodEdits(null)
  }

  // ── Player helpers — the trip wizard's, same shapes ─────────────────────

  function addPlayer() {
    setPlayers(prev => [...prev, { name: '', handicap: '', gender: 'M' }])
  }
  function removePlayer(i: number) {
    setPlayers(prev => prev.filter((_, idx) => idx !== i))
  }
  function updatePlayer(i: number, patch: Partial<PlayerInput>) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  // ── Submit — the platform's insertion order, same as the trip wizard ────

  async function handleSubmit() {
    for (const p of players) {
      if (!p.name.trim()) continue
      if (!isPlusHandicap(parseHandicap(p.handicap))) continue
      if (!window.confirm(`${p.name.trim()} — ${PLUS_HANDICAP_WARNING}`)) return
    }

    setSubmitting(true)
    setError(null)

    const code = generateCode()

    // The PINs as typed: sent beside the row and stored salted and slow by
    // the server (row-level security stage 4, D64) — no hash is made here.
    const pins = { adminPin: passcode, publicPin: publicIssue === null && publicPin.on ? publicPin.pin : null }


    // The Dynamic Overall Leaderboard's boards, written with the trip: each
    // session's round is given its id here so its board can name it before
    // the round row exists (lib/sessions.ts). TBC sessions get no board.
    const roundIds = isDynamic ? sessionSlots.map(() => crypto.randomUUID()) : []
    const storedBoards: Leaderboard[] = isDynamic ? (() => {
      const formats = resolvedFormats(orderedSessions)
      const sessionBoards = formats.flatMap((f, i) => f ? [sessionBoard(f, roundIds[i], daySheetId(roundIds[i]))] : [])
      const rules: OverallRules = { ranks }
      const storedFeeds: Record<string, SessionFeed> = {}
      const names: Record<string, string> = {}
      const slots: Record<string, number> = {}
      orderedSessions.forEach((sess, i) => {
        const rid = roundIds[i]
        const board = sessionBoards.find(b => b.roundIds?.[0] === rid) ?? null
        if (board) {
          const own = feeds[sess.key]
          storedFeeds[rid] = feedFor({ ranks, ...(own ? { feeds: { [rid]: own } } : {}) }, rid, board, overallEntrants)
        }
        if (sess.name?.trim()) names[rid] = sess.name.trim()
        const f = formats[i]
        if (f?.kind === 'matches') slots[rid] = sess.matches ?? defaultMatchSlots(fieldCount, f.match)
      })
      if (Object.keys(storedFeeds).length > 0) rules.feeds = storedFeeds
      if (Object.keys(names).length > 0) rules.names = names
      if (Object.keys(slots).length > 0) rules.slots = slots
      return [overallBoard(rules), ...sessionBoards, ...boards]
    })() : boards

    const setup: LeagueSetup = {
      format: 'league',
      // Standalone is the absent default — the keep-the-no-op-off rule.
      ...(schedule !== 'standalone' ? { schedule } : {}),
      // A league of periods: the periods, the rule (best card the absent
      // default), and the courses a card may be played on (absent is any).
      ...(continuous ? {
        periods,
        ...(periodRule === 'composite' ? { periodRule } : {}),
        ...(anyCourse === false ? { courseIds: [...new Set(cardCourses.filter(Boolean))] } : {}),
      } : {}),
      // A recurring series says so; as you go is the absent answer.
      ...(schedule === 'series' && seriesPlan === 'recurring'
        ? { repeat: { every: repeatEvery, unit: repeatUnit } } : {}),
      entry: entry!,
      ...(entry === 'self_join' && requireApproval ? { requireApproval: true } : {}),
      ...(asksDayBoards && dayBoards ? { dayBoards } : {}),
      // Live is the absent default; the rules ride only with a source that reads them.
      ...(giStored && scoreSource !== 'live' ? { scoreSource, golfIreland: giStored } : {}),
    }

    // 1. The trip row. Unlike the trip wizard, the boards are written at
    // creation: a league's competition is the point of this form, and the
    // boards the organiser built on the last step are what make day one
    // scoreable without a visit to setup. `bracket_setup` needs migration
    // 047 — without it the insert fails and describeError says why in as
    // many words.
    //
    // The dates say the shape: a standalone run carries its ends (one day
    // writes one date to both), a continuous event carries its period, and
    // a series runs from its first event to its last made so far — adding
    // the next event on the Scoring tab moves the end on with it.
    const tripStart = continuous ? periods[0].start : startDate
    const tripEnd = continuous ? periods.at(-1)!.end
      : schedule === 'series' ? (slots.at(-1)?.date ?? startDate)
      : schedule === 'standalone' && !multiDay ? startDate
      : endDate
    // Tee times off leaves both of its answers at their defaults, whatever
    // was tapped while it was on.
    const finalPerms = teeTimes ? perms
      : { ...perms, set_tee_sheets: defaultPermissions().set_tee_sheets, edit_tee_sheet: defaultPermissions().edit_tee_sheet }
    const tripRow: Record<string, unknown> = {
      name: name.trim(),
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: tripStart || null,
      end_date: tripEnd || null,
      kind: 'tournament',
      formats: {
        ...NO_FORMATS,
        league: { ...NO_FORMATS.league },
        matchplay: { ...NO_FORMATS.matchplay },
      },
      leaderboards: storedBoards,
      bracket_setup: setup,
      // Only when a toggle was actually flipped — nothing opened writes
      // nothing, so creation still lands before migration 049 has run.
      ...(storedPermissions(finalPerms) ? { event_permissions: finalPerms } : {}),
    }

    const leadEmail = normaliseEmail(email)
    if (leadEmail) tripRow.lead_email = leadEmail

    const { data: trip, error: tripErr } = await createTripRow(tripRow, pins)

    if (tripErr || !trip) {
      setError(`Could not create the event. ${describeError(tripErr)}`)
      setSubmitting(false)
      return
    }
    const tripId = trip.id

    // 2. Players. The organiser's own name leads the list only when they
    // are playing — an organiser off the card has no player row at all.
    const firstIsOrganiser = organiserPlaying
    const validPlayers = players.filter(p => p.name.trim())
    let playerRows: { id: string; handicap: number | null; is_lead?: boolean }[] = []
    if (validPlayers.length > 0) {
      const { data: insertedPlayers, error: playersErr } = await supabase
        .from('players')
        .insert(
          validPlayers.map((p, i) => ({
            trip_id: tripId,
            name: p.name.trim(),
            // Blank is pending, never scratch (lib/handicap.ts)
            handicap: parseHandicap(p.handicap),
            gender: p.gender,
            role: 'player',
            is_lead: firstIsOrganiser && i === 0,
            claimed: firstIsOrganiser && i === 0,
            team_id: null,
          }))
        )
        .select('id, name, handicap, is_lead')

      if (playersErr || !insertedPlayers) {
        setError(`Event created, but the players could not be saved. ${describeError(playersErr)}`)
        setSubmitting(false)
        return
      }
      playerRows = insertedPlayers
      const lead = insertedPlayers.find(p => p.is_lead)
      if (lead) { rememberPlayer(code, lead.id); void enterEvent(code, { playerId: lead.id }) }

      // The field step's tags — a failure costs them, never the event.
      const idByName = new Map(insertedPlayers.map(p => [String(p.name).trim().toLowerCase(), p.id as string]))
      setTagsWarning(await writeFieldTags(supabase, tripId, tags, validPlayers, n => idByName.get(n.trim().toLowerCase())))
    }

    // 3. One golf item per playing slot, through the shared row mapping —
    // never a second copy of it — and then the rounds those items become.
    // A continuous league's day_index is its calendar offset inside the
    // period, and a series' its offset from the first event, so the
    // schedule and the countdown keep reading true dates.
    // A dynamic league's slots are its sessions, several to a day.
    const playSlots = isDynamic
      ? sessionSlots
      : slots.map((slot, i) => ({ ...slot, position: 0, courseId: courseOf(slot, i) }))
    const items: ItineraryItem[] = playSlots.map((slot, i) => ({
      id: `tmp-day-${i}`,
      dayIndex: slot.dayIndex,
      position: slot.position,
      kind: 'golf',
      // A venue to be confirmed is a golf item with no course — and, below,
      // no round until somebody chooses one.
      courseId: slot.courseId || null,
      teeTime: null,
      teeCount: 1,
    }))

    // None on a league of periods — its rounds are made card by card.
    const { data: savedItems, error: itinErr } = items.length > 0
      ? await supabase
        .from('itinerary_items')
        .insert(items.map(item => toItemRow(tripId, item)))
        .select('id, day_index, position, kind')
      : { data: [] as { id: string; day_index: number; position: number; kind: string }[], error: null }

    if (itinErr) {
      setError(`Event created, but the schedule could not be saved. ${describeError(itinErr)}`)
      setSubmitting(false)
      return
    }

    const savedBySlot = new Map(
      (savedItems ?? []).map(r => [`${r.day_index}:${r.position}`, r.id])
    )

    // A round for every slot with a venue, numbered by its place in date
    // order — so a TBC slot keeps its number free until its round is made
    // (`leagueRounds` reads it back the same way). Every slot has a venue
    // on any shape but a series, so there the numbers run 1, 2, 3 as ever.
    const roundRows = items.flatMap((item, i) => {
      if (!item.courseId) return []
      // The slot's own date — every shape has one now.
      const date = playSlots[i].date
      return [{
        // A session's round carries the id its board was written with.
        ...(isDynamic ? { id: roundIds[i] } : {}),
        trip_id: tripId,
        course_id: item.courseId,
        round_number: i + 1,
        status: 'upcoming',
        itinerary_item_id: savedBySlot.get(`${item.dayIndex}:${item.position}`) ?? null,
        ...(date ? { scheduled_date: date } : {}),
        // Every round on a tee sheet when tee times are on — vacant until
        // the organiser makes it. Named only then, as every optional column.
        ...(teeTimes ? { start_format: 'tee_sheet' } : {}),
      }]
    })
    const { data: insertedRounds, error: roundsErr } = roundRows.length > 0
      ? await supabase.from('rounds').insert(roundRows).select('id')
      : { data: [] as { id: string }[], error: null }

    if (roundsErr || !insertedRounds) {
      setError(`Event created, but the rounds could not be saved. ${describeError(roundsErr)}`)
      setSubmitting(false)
      return
    }

    // 4. Handicap snapshots — one row per player per round. The index
    // stands in until a tee is chosen, exactly as on a trip, and a pending
    // player gets no row at all, as on a trip (CreateTripForm says why).
    const ratedPlayers = playerRows.filter(p => !isHandicapPending(p.handicap))
    if (ratedPlayers.length > 0 && insertedRounds.length > 0) {
      const hcpRows = insertedRounds.flatMap(round =>
        ratedPlayers.map(player => ({
          round_id: round.id,
          player_id: player.id,
          playing_handicap: Math.round(player.handicap as number),
        }))
      )
      const { error: hcpErr } = await supabase.from('round_handicaps').insert(hcpRows)
      if (hcpErr) {
        setError(`Event created, but the handicaps could not be saved. ${describeError(hcpErr)}`)
        setSubmitting(false)
        return
      }
    }

    // 5. Each round's deadline, by the golf item it was saved as — a failure
    // costs the deadlines, never the league (the organiser area sets them).
    const stored = askDeadlines ? storedDeadlines(deadlines, slots.length, deadlineOpts) : null
    if (stored) {
      const byKey: Record<string, string> = {}
      items.forEach((item, i) => {
        const id = savedBySlot.get(`${item.dayIndex}:${item.position}`)
        if (id && stored[i]) byKey[id] = stored[i]
      })
      const saved = await setRoundDeadlines({ tripId, deadlines: byKey })
      if (!saved.ok) setDeadlineWarning('The league is made, but its round deadlines could not be saved — set them in the organiser area.')
    }

    try {
      localStorage.setItem(`gig-owner-${code}`, '1')
    } catch { /* localStorage unavailable */ }

    // The confirmation email, fire-and-forget for the same reasons the trip
    // wizard's is — nothing may stand between the organiser and their event.
    if (leadEmail) {
      fetch('/api/trip-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode: code }),
        keepalive: true,
      }).catch(() => { /* the event is created; the email is best-effort */ })
    }

    // The device that just set the PIN is the organiser already: the server
    // made it so with the event (createTripRow remembers until when), and
    // set the public PIN's cookie on the way back.

    setResultCode(code)
    setStep('done')
    setSubmitting(false)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(resultCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable (non-HTTPS) */ }
  }

  // ── Confirmation screen ──────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="min-h-dvh paper flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mx-auto mb-8">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0A9D56" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>

          <h1 className="t-h1 text-ink mb-2">
            League created
          </h1>
          <p className="text-ink/65 text-sm mb-10">
            {entry === 'self_join'
              ? 'Players join with this code — your Event Hub has it as a link and a QR to hold up.'
              : 'Your field is in. The leaderboard and live scoring are ready on your Event Hub.'}
          </p>
          {tagsWarning && <p className="text-rust-deep text-sm -mt-6 mb-6 leading-snug">{tagsWarning}</p>}
          {deadlineWarning && <p className="text-rust-deep text-sm -mt-6 mb-6 leading-snug">{deadlineWarning}</p>}

          <div className={`px-4 py-8 mb-4 ${cardClass()}`}>
            <p className="t-label text-ink/65 mb-4">Your event code</p>
            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
              {resultCode.split('').map((ch, i) => (
                <span
                  key={i}
                  className={CODE_CHAR}
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>

          <div className={`mb-4 px-4 py-3 ${cardClass()}`}>
            <p className="text-ink/80 text-[13px] leading-snug">
              Your organiser PIN is set. Keep it safe — it cannot be recovered
              or changed.
            </p>
          </div>

          <button
            onClick={copyCode}
            className={`${buttonClass('secondary')} mb-3`}
          >
            {copied ? '✓ Copied' : 'Copy code'}
          </button>

          <Link
            href={tripBase(resultCode, 'tournament')}
            className={buttonClass('primary')}
          >
            Go to your event
          </Link>
        </div>
      </div>
    )
  }

  // ── The wizard ───────────────────────────────────────────────────────────

  const stepNum = Math.min(Number(step) || 1, lastStep)

  return (
    <div className="min-h-dvh paper text-ink">
      <TripHeader backTo="/golf" />

      <div className="page-enter">

      <WizardShell
        step={stepNum}
        titles={keys.map(k => k === 'venues' && continuous ? 'Where cards are played' : STEP_TITLES[k])}
        intro={STEP_INTROS[key]}
        onBack={goBack}
        backOnFirst={!!onExit}
        footer={<>
          <button
            onClick={goNext}
            disabled={!canProceed}
            className={buttonClass('primary')}
          >
            {submitting ? 'Creating…' : stepNum === lastStep ? 'Create league' : 'Continue'}
          </button>
          {key === 'field' && (
            <p className="text-center text-ink/65 text-[13px] mt-3">
              Players without a name will be skipped
            </p>
          )}
          </>}
      >

        {/* ── 1 · Event details ── */}
        {key === 'details' && (
          <div className="space-y-6">
            <div>
              <label className={FIELD_LABEL}>Event name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Winter League 2026"
                className={FIELD}
                autoFocus
              />
            </div>

            {/* ── The shape's own questions ──
                Standalone asks one day or a run; continuous asks for the
                period and the playing days inside it; a series asks how
                its events arrive and when the first one is. */}
            {schedule === 'standalone' && (
              <>
                <div>
                  <label className={FIELD_LABEL}>Event length</label>
                  <Chips
                    options={[
                      { key: 'single', label: 'Single day' },
                      { key: 'multi', label: 'Multi-day' },
                    ] as const}
                    chosen={multiDay === null ? null : multiDay ? 'multi' : 'single'}
                    onChoose={k => { setMultiDay(k === 'multi'); setRestDays([]) }}
                  />
                  <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                    {multiDay === null
                      ? 'One day at one venue, or a run of days.'
                      : multiDay
                        ? 'Pick the playing days here, then a venue for each.'
                        : 'Deliberately simple: one venue, one date, one leaderboard, live scoring.'}
                  </p>
                </div>

                {multiDay !== null && (
                  multiDay ? (
                    <div>
                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                        {/* Moving either end re-numbers the days, so the
                            days turned off are cleared with it: index 2 of
                            the old run is a different date in the new one,
                            and a rest day silently landing on the wrong
                            day is worse than asking again. */}
                        <DateField
                          label="First day"
                          value={startDate}
                          onChange={v => { setStartDate(v); setRestDays([]) }}
                        />
                        <DateField
                          label="Last day"
                          value={endDate}
                          openAt={startDate || null}
                          onChange={v => { setEndDate(v); setRestDays([]) }}
                        />
                      </div>
                      {datesBackwards && (
                        <p className="text-rust-deep text-[13px] mt-2 leading-snug">
                          The last day cannot come before the first.
                        </p>
                      )}
                      {runTooLong && (
                        <p className="text-rust-deep text-[13px] mt-2 leading-snug">
                          Too long for one run. A period like this is a
                          continuous event.
                        </p>
                      )}

                      {/* Which of the run's days are actually played.
                          A run of days was taken as a round a day, which is
                          a presumption: the middle Saturday of a long
                          weekend may be nobody's golf. Every day starts on,
                          so an event that does play every day is made
                          exactly as it always was. */}
                      {!datesBackwards && !runTooLong && periodSet && runLength > 1 && (
                        <div className="mt-4">
                          <label className={FIELD_LABEL}>Playing days</label>
                          <p className="text-ink/65 text-[13px] mb-2 leading-snug">
                            Turn off travel or rest days. The dates stay as they are.
                          </p>
                          <div className="space-y-2">
                            {Array.from({ length: runLength }, (_, i) => i).map(i => {
                              const label = describeDay(dateForDay(startDate, i), i)
                              const on = !restDays.includes(i)
                              return (
                                <div
                                  key={i}
                                  className={`flex items-center justify-between gap-4 px-4 py-3 ${cardClass()}`}
                                >
                                  <p className={`text-sm min-w-0 truncate ${on ? 'text-ink' : 'text-ink/65'}`}>
                                    {label}
                                  </p>
                                  <Toggle
                                    checked={on}
                                    onChange={v => setRestDays(prev =>
                                      v ? prev.filter(d => d !== i) : [...prev, i])}
                                    label={`Golf on ${label}`}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {!datesBackwards && !runTooLong && startDate && endDate && (
                        daysIssue
                          ? <p className="text-rust-deep text-[13px] mt-2 leading-snug">{daysIssue}</p>
                          : <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                              {slots.length === runLength
                                ? slots.length === 1
                                  ? 'One day, one round.'
                                  : `${slots.length} days, a round each.`
                                : `${slots.length} round${slots.length === 1 ? '' : 's'} across ${runLength} days.`}
                            </p>
                      )}
                    </div>
                  ) : (
                    <DateField
                      label="Event date"
                      value={startDate}
                      onChange={v => { setStartDate(v); setEndDate(v) }}
                    />
                  )
                )}
              </>
            )}

            {continuous && (
              <>
                {/* The periods (Ross, 8 Nov 2026): an equal run, then each
                    one's dates adjusted by hand. A period is a round of the
                    league — cards are handed in any time inside one. */}
                <DateField label="The first period starts" value={startDate}
                  onChange={v => setRun({ start: v })} />

                <div>
                  <Stepper
                    label="Each period lasts"
                    value={periodEvery}
                    min={1}
                    max={MAX_PERIOD_EVERY}
                    unit={n => periodUnit === 'week'
                      ? (n === 1 ? 'week' : 'weeks')
                      : (n === 1 ? 'month' : 'months')}
                    onChange={n => setRun({ every: n })}
                  />
                  <div className="mt-3">
                    <Chips options={REPEAT_UNITS} chosen={periodUnit} onChoose={u => setRun({ unit: u })} />
                  </div>
                </div>

                <Stepper
                  label="How many periods?"
                  value={periodCount}
                  min={1}
                  max={MAX_PERIODS}
                  unit={n => (n === 1 ? 'period' : 'periods')}
                  onChange={n => setRun({ count: n })}
                />

                {startDate && periods.length > 0 && (
                  <div>
                    <label className={FIELD_LABEL}>The periods</label>
                    <p className="text-ink/65 text-[13px] mb-3 leading-snug">
                      Change any dates that need it, like a break over Christmas.
                    </p>
                    <div className="space-y-3">
                      {periods.map((p, i) => (
                        <div key={p.key} className={`p-4 ${cardClass()}`}>
                          <p className="text-ink text-sm font-medium mb-2">
                            Period {i + 1}
                            <span className="text-ink/65 font-normal"> · {describePeriod(p)}</span>
                          </p>
                          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                            <DateField label="Starts" value={p.start} onChange={v => setPeriodDate(i, 'start', v)}
                              openAt={periods[i - 1]?.end || startDate || null} />
                            <DateField label="Finishes" value={p.end} onChange={v => setPeriodDate(i, 'end', v)}
                              openAt={p.start || null} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {periodEdits && (
                      <button
                        type="button"
                        onClick={() => setPeriodEdits(null)}
                        className="mt-2 text-accent-deep text-[13px] font-medium"
                      >
                        Back to equal periods
                      </button>
                    )}
                  </div>
                )}

                {startDate && periodsProblem && (
                  <p className="text-rust-deep text-[13px] leading-snug">{periodsProblem}</p>
                )}
              </>
            )}

            {schedule === 'series' && (
              <>
                <div>
                  <label className={FIELD_LABEL}>How are the rounds planned?</label>
                  <Chips options={SERIES_PLANS} chosen={seriesPlan} onChoose={setSeriesPlan} />
                  <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                    {seriesPlan
                      ? SERIES_PLANS.find(p => p.key === seriesPlan)!.hint
                      : 'Rounds on separate days, each with its own result, feeding one overall league.'}
                  </p>
                </div>

                {seriesPlan && (
                  <DateField label="First round" value={startDate} onChange={setStartDate} />
                )}

                {seriesPlan === 'recurring' && (
                  <>
                    <div>
                      <Stepper
                        label="Repeats every"
                        value={repeatEvery}
                        min={1}
                        max={MAX_REPEAT_EVERY}
                        unit={n => repeatUnit === 'week'
                          ? (n === 1 ? 'week' : 'weeks')
                          : (n === 1 ? 'month' : 'months')}
                        onChange={setRepeatEvery}
                      />
                      <div className="mt-3">
                        <Chips options={REPEAT_UNITS} chosen={repeatUnit} onChoose={setRepeatUnit} />
                      </div>
                      {repeatUnit === 'month' && (
                        <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                          On the same weekday each time, like the second Wednesday.
                        </p>
                      )}
                    </div>

                    <Stepper
                      label="How many rounds?"
                      value={eventCount}
                      min={2}
                      max={MAX_LEAGUE_DAYS}
                      unit={n => (n === 1 ? 'round' : 'rounds')}
                      onChange={setEventCount}
                    />
                  </>
                )}

                {seriesPlan === 'recurring' && startDate && slots.length > 0 && (
                  daysIssue
                    ? <p className="text-rust-deep text-[13px] leading-snug">{daysIssue}</p>
                    : <p className="text-ink/65 text-[13px] leading-snug">
                        {slots.length} rounds, {describeRepeat({ every: repeatEvery, unit: repeatUnit }, startDate)}:{' '}
                        {describeDay(slots[0].date, 0)} to {describeDay(slots.at(-1)!.date, 0)}.
                      </p>
                )}
              </>
            )}

            <div>
              <label className={FIELD_LABEL} htmlFor="league-email">Email (optional)</label>
              <input
                id="league-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_EMAIL}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={FIELD}
              />
              <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                We&apos;ll email you the event details and share link.
              </p>
              {emailWarning(email) && (
                <p className="text-rust/80 text-[13px] mt-2 leading-snug">
                  {emailWarning(email)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 2 · Venues ── */}
        {key === 'venues' && continuous && (
          <div className="space-y-5">
            <div className="space-y-2">
              {[
                { any: true, label: 'Any course', hint: 'Players hand in a card from wherever they play.' },
                { any: false, label: 'Only these courses', hint: 'Cards count only from the courses you pick.' },
              ].map(o => (
                <button
                  key={o.label}
                  onClick={() => setAnyCourse(o.any)}
                  aria-pressed={anyCourse === o.any}
                  className={optionClass(anyCourse === o.any)}
                >
                  <p className="text-[17px] font-medium leading-snug text-ink">{o.label}</p>
                  <p className="t-cap text-ink/65 mt-0.5">{o.hint}</p>
                </button>
              ))}
            </div>

            {anyCourse === false && (
              <div className="space-y-4">
                {cardCourses.map((id, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between">
                      <label className={FIELD_LABEL}>Course {i + 1}</label>
                      {cardCourses.length > 1 && (
                        <button
                          onClick={() => setCardCourses(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-ink/65 hover:text-ink/80 text-[13px] mb-2"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <VenuePicker
                      courses={courses}
                      value={id}
                      onChange={v => setCardCourses(prev => prev.map((c, idx) => (idx === i ? v : c)))}
                      onCourseAdded={onCourseAdded}
                      allowTbc={false}
                    />
                  </div>
                ))}
                <button
                  onClick={() => setCardCourses(prev => [...prev, ''])}
                  disabled={cardCourses.length >= 20}
                  className="w-full py-3 border border-dashed border-line-strong rounded-xl text-ink/65 text-sm hover:text-ink/80 transition-colors disabled:opacity-40"
                >
                  + Add another course
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── The first leaderboard decision (D35) ── */}
        {key === 'dynamic' && (
          <DynamicQuestion
            value={dynamic}
            onChange={chooseDynamic}
            sessionCount={sessions.length}
            onConfirmOff={sessionsToVenues}
          />
        )}

        {/* ── The running order: sessions, a format each ── */}
        {key === 'sessions' && (
          <div className="space-y-4">
            <SessionList
              sessions={sessions}
              onChange={setSessions}
              fieldSize={fieldCount}
              days={playingDays}
              renderVenue={(value, onChange) => (
                <VenuePicker courses={courses} value={value} onChange={onChange}
                  onCourseAdded={onCourseAdded} allowTbc={false} />
              )}
            />
            {sessionsProblem && sessions.length > 0 && (
              <p className="text-ink/65 text-[13px] leading-snug">{sessionsProblem}</p>
            )}
          </div>
        )}

        {/* ── Finalise the Overall ── */}
        {key === 'overall' && (
          <OverallSetup
            sessions={orderedSessions}
            ranks={ranks}
            onRanks={setOverallRanks}
            feeds={feeds}
            onFeeds={setFeeds}
            tagsOn={tags.on}
            entrants={overallEntrants}
          />
        )}

        {key === 'venues' && !continuous && (
          <div className="space-y-5">
            {coursesLoaded && courses.length === 0 && (
              <div className={`p-4 text-ink/65 text-sm text-center ${cardClass()}`}>
                The course list could not be loaded — a course can still be
                added by name from the picker.
              </div>
            )}

            {slots.length > 1 && (
              <div className={`flex items-start justify-between gap-4 p-4 ${cardClass()}`}>
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">
                    Same venue every {schedule === 'series' ? 'round' : 'day'}
                  </p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                    {schedule === 'series'
                      ? 'One course for the whole league. Turn off to pick each round’s, or leave some to be confirmed.'
                      : 'One course for the whole event — pick it once below.'}
                  </p>
                </div>
                <Toggle
                  checked={sameVenue}
                  onChange={setSameVenue}
                  label="Same venue throughout"
                />
              </div>
            )}

            {slots.length === 1 || sameVenue ? (
              <div>
                <label className={FIELD_LABEL}>Venue</label>
                <VenuePicker
                  courses={courses}
                  value={venues[0] ?? ''}
                  onChange={id => setVenue(0, id)}
                  onCourseAdded={onCourseAdded}
                  allowTbc={schedule === 'series'}
                />
                {schedule === 'series' && seriesPlan === 'ad_hoc' && (
                  <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                    For the first round. Each round after is presumed to be here too, and can be changed when it&apos;s added.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {slots.map((slot, i) => (
                  <div key={slot.date ?? i}>
                    <label className={FIELD_LABEL}>
                      {schedule === 'series'
                        ? `Round ${i + 1} · ${describeDay(slot.date, slot.dayIndex)}`
                        : describeDay(slot.date, slot.dayIndex)}
                    </label>
                    <VenuePicker
                      courses={courses}
                      value={venueFor(slot, i)}
                      onChange={id =>
                        schedule !== 'standalone' && slot.date
                          ? setDateVenue(slot.date, id)
                          : setVenue(i, id)}
                      onCourseAdded={onCourseAdded}
                      allowTbc={schedule === 'series'}
                    />
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ── 3 · Players ── */}
        {key === 'deadlines' && (
          <RoundDeadlines value={deadlines} onChange={setDeadlines} rounds={slots.length}
            names={deadlineNames} floors={deadlineFloors} start={startDate || null} />
        )}

        {key === 'field' && (
          <div className="space-y-4">
            <div>
              <label className={FIELD_LABEL}>How does the field get in?</label>
              <Chips options={PLAYER_ENTRIES} chosen={entry} onChoose={setEntry} />
              {entry && (
                <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                  {PLAYER_ENTRIES.find(e => e.key === entry)?.hint}
                </p>
              )}
            </div>

            {entry === 'self_join' && (
              <div className={`flex items-start justify-between gap-4 p-4 ${cardClass()}`}>
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">Require approval</p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                    New players wait for your nod before they&apos;re in the field.
                  </p>
                </div>
                <Toggle
                  checked={requireApproval}
                  onChange={setRequireApproval}
                  label="Require approval before a joined player is confirmed"
                />
              </div>
            )}

            <div className={`p-4 ${cardClass()}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">Are you playing?</p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                    {organiserPlaying
                      ? 'Put your own name first below — the rest of the field follows.'
                      : 'You run the event; the names below are the field.'}
                  </p>
                </div>
                <Toggle
                  checked={organiserPlaying}
                  onChange={setOrganiserPlaying}
                  label="The organiser is playing"
                />
              </div>
            </div>

            <TagsCard
              tags={tags}
              // Tags switched off take any tags board with them — there would be
              // nothing for it to rank. Switched on, nothing is added: the
              // organiser picks a tags board on the Finish step if they want one.
              setTags={next => { if (tags.on && !next.on) setBoards(b => withLeagueTagBoard(b, false)); setTags(next) }}
              counts={tagCounts(tags, players)}
              onRemove={key => setPlayers(prev => prev.map(p => (p.tag === key ? { ...p, tag: undefined } : p)))}
            />

            <p className="text-ink/65 text-sm">
              {entry === 'self_join'
                ? 'Add anyone now. Everyone else joins with the event code.'
                : 'Add the field. Anyone missed can join later with the event code.'}
            </p>

            {players.map((player, i) => (
              <div key={i} className={`p-4 ${cardClass()}`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="t-label text-ink/80">
                    {i === 0 && organiserPlaying ? 'Organiser — you' : `Player ${i + 1}`}
                  </span>
                  {i > 0 && (
                    <button
                      onClick={() => removePlayer(i)}
                      className="text-ink/65 hover:text-ink/80 transition-colors p-1"
                      aria-label="Remove player"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <input
                    type="text"
                    value={player.name}
                    onChange={e => updatePlayer(i, { name: e.target.value })}
                    onKeyDown={enterGoesTo(`league-hcp-${i}`)}
                    enterKeyHint="next"
                    placeholder="Full name"
                    className={i === duplicateIndex
                      ? FIELD.replace('border-line', 'border-rust/60')
                      : FIELD}
                  />
                  {i === duplicateIndex && (
                    <p className="text-rust-deep text-[13px] leading-snug">
                      {duplicateIssue}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <HandicapField
                      id={`league-hcp-${i}`}
                      value={player.handicap}
                      onChange={v => updatePlayer(i, { handicap: v })}
                      placeholder="Handicap"
                      rowClassName="flex-1 min-w-0"
                      className={`${FIELD} flex-1 min-w-0`}
                    />
                    <div className="flex gap-1.5 flex-shrink-0">
                      {(['M', 'F'] as const).map(g => (
                        <button
                          key={g}
                          onClick={() => updatePlayer(i, { gender: g })}
                          className={`${chipClass(player.gender === g)} w-12`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <PlayerTagChips tags={tags} value={player.tag} label={`${player.name.trim() || `Player ${i + 1}`}'s tag`}
                    onChange={tag => updatePlayer(i, { tag })} />
                </div>
              </div>
            ))}

            <button
              onClick={addPlayer}
              className="w-full py-4 border border-dashed border-line-strong rounded-xl text-ink/65 text-sm hover:border-line-strong hover:text-ink/80 transition-colors"
            >
              + Add another player
            </button>
          </div>
        )}

        {/* ── 4 · Finish ── */}
        {key === 'ready' && (
          <div className="space-y-6">
            {/* ── Where the scores come from ──
                Live on Green Dot, read from Golf Ireland, or both. Golf
                Ireland asks its own questions, in its own card. */}
            <div>
              <label className={FIELD_LABEL}>Where do the scores come from?</label>
              <div className="space-y-2">
                {SCORE_SOURCES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => setScoreSource(s.key)}
                    aria-pressed={scoreSource === s.key}
                    className={optionClass(scoreSource === s.key)}
                  >
                    <p className="text-[17px] font-medium leading-snug text-ink">
                      {s.label}
                    </p>
                    <p className="t-cap text-ink/65 mt-0.5">
                      {s.hint}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {readsGolfIreland(scoreSource) && (
              <div>
                <GolfIrelandRulesForm value={giRules} onChange={setGiRules} />
                {giIssue && (
                  <p className="text-rust-deep text-[13px] mt-3 leading-snug">{giIssue}</p>
                )}
              </div>
            )}

            {/* ── The leaderboards ──
                The same LeaderboardSetup Trip Setup runs, starting empty
                (Ross, 8 Nov 2026: set by hand, never pre-filled) — so
                creation offers exactly the competitions the platform can
                score, and Finish waits for at least one. Teams are
                apportioned after creation on the teams screen, the same
                as a trip, so a team board here starts unassigned. */}
            {continuous && (
              <div>
                <label className={FIELD_LABEL}>Which card counts in a period?</label>
                <div className="space-y-2">
                  {PERIOD_RULES.map(r => (
                    <button
                      key={r.key}
                      onClick={() => setPeriodRule(r.key)}
                      aria-pressed={periodRule === r.key}
                      className={optionClass(periodRule === r.key)}
                    >
                      <p className="text-[17px] font-medium leading-snug text-ink">{r.label}</p>
                      <p className="t-cap text-ink/65 mt-0.5">{r.hint}</p>
                    </button>
                  ))}
                </div>
                {periodRule === 'composite' && (
                  <p className="text-ink/65 text-[13px] mt-2 leading-snug">
                    On a strokes leaderboard a composite needs one course, so a player whose cards are on different courses keeps their best card.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className={FIELD_LABEL}>{isDynamic ? 'Secondary leaderboards' : 'Leaderboards'}</label>
              <p className="text-ink/65 text-[13px] mb-3 leading-snug">
                {isDynamic
                  ? 'The Overall is set. Add any other leaderboard you want beside it, or none.'
                  : 'How the field is ranked. Add at least one.'}
              </p>
              <LeaderboardSetup
                boards={boards}
                playerCount={players.filter(p => p.name.trim()).length}
                teamCount={0}
                askTeeTeams
                askTags
                onChange={setBoards}
              />
              {boards.length === 0 && !isDynamic && (
                <p className="t-cap text-ink/65 mt-3 leading-snug">
                  Add a leaderboard to finish — it is what the event is played for.
                </p>
              )}
            </div>

            {asksDayBoards && (
              <div>
                <label className={FIELD_LABEL}>
                  The leaderboard across the {schedule === 'series' ? 'rounds' : 'days'}
                </label>
                <div className="space-y-2">
                  {DAY_BOARDS.map(d => (
                    <button
                      key={d.key}
                      onClick={() => setDayBoards(d.key)}
                      aria-pressed={dayBoards === d.key}
                      className={optionClass(dayBoards === d.key)}
                    >
                      <p className="text-[17px] font-medium leading-snug text-ink">
                        {d.label}
                      </p>
                      <p className="t-cap text-ink/65 mt-0.5">
                        {d.hint}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Tee times ──
                Its own question (Ross, 26 Oct 2026): on, every round gets a
                tee sheet, and the two answers — who makes the sheets, who
                places players — are asked here rather than as toggles. */}
            {!continuous && (
              <TeeTimesQuestion
                on={teeTimes}
                onToggle={setTeeTimes}
                value={{ anyoneMakes: perms.set_tee_sheets, playersPick: perms.edit_tee_sheet }}
                onChange={v => setPerms({ ...perms, set_tee_sheets: v.anyoneMakes, edit_tee_sheet: v.playersPick })}
              />
            )}
            {/* A Matches session: the tee times — or the order of play —
                are where its matches are made (Ross, 9 Nov 2026, D42). */}
            {isDynamic && resolvedFormats(orderedSessions).some(f => f?.kind === 'matches') && (
              <div className={`p-4 ${cardClass('flat')}`}>
                <p className="text-ink text-sm font-medium">Tee times decide the matches.</p>
                <p className="text-ink/65 text-[13px] mt-1 leading-snug">
                  In a match play session, each tee time is one match: put one side on the left and the other on the right. Without tee times, you set the matches in the order of play.
                </p>
              </div>
            )}

            {/* ── How collaborative? ──
                One question, three toggles, all off until the organiser
                opts in — the registry in lib/eventPermissions.ts is the
                whole list, and the admin page edits the same answers. */}
            <div>
              <label className={FIELD_LABEL}>How collaborative should this event be?</label>
              <p className="text-ink/65 text-[13px] mb-3 leading-snug">
                Choose a style, or set each one. Editable in the organiser area.
              </p>
              <CollaborationQuestion
                value={perms}
                onChange={setPerms}
                registry={permissionsFor(schedule === 'series', false, continuous, isDynamic && orderedSessions.some((_, i) => resolvedFormats(orderedSessions)[i]?.kind === 'matches'))}
              />
            </div>

            <div className="pt-2 border-t border-line">
              <div className={`px-4 py-4 mb-3 ${cardClass()}`}>
                <p className="text-ink text-sm font-medium">Organiser PIN</p>
                <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                  Unlocks notices, starts and settings in the organiser area.
                </p>
              </div>

              <div className="space-y-3">
                <div className="px-4 py-3.5 bg-rust/10 border border-rust/40 rounded-xl">
                  <p className="text-rust-deep text-sm font-semibold leading-snug">
                    This can only be set now.
                  </p>
                  <p className="text-rust/70 text-[13px] leading-snug mt-1.5">
                    There is no way to add, change or remove your PIN later —
                    Write it down!
                  </p>
                </div>

                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))}
                  placeholder={`PIN (${MIN_PASSCODE}–${MAX_PASSCODE} digits)`}
                  maxLength={MAX_PASSCODE}
                  className={FIELD}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={passcodeConfirm}
                  onChange={e => setPasscodeConfirm(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter it again"
                  maxLength={MAX_PASSCODE}
                  className={FIELD}
                />
                {passcodeIssue && (passcode || passcodeConfirm) && (
                  <p className="text-rust-deep text-[13px] leading-snug">{passcodeIssue}</p>
                )}
                <PublicPinField value={publicPin} onChange={setPublicPin} issue={publicIssue} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-rust/10 border border-rust/30 rounded-xl">
            <p className="text-rust-deep text-sm">{error}</p>
          </div>
        )}

      </WizardShell>

      </div>
    </div>
  )
}
