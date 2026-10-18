// Green Dot Run — a run challenge's rules, the only copy.
//
// A run challenge is the second sport on the platform: an ongoing team
// competition over a period (a month, a quarter), where runs earn points and
// the points make a leaderboard. It rides on the same `trips` row every golf
// event does — the six-character code, the organiser PIN, the confirmation
// email, `teams` + `team_members` — told apart by `trips.kind = 'run'`
// (migration 052). Everything that is particular to running lives here.
//
// ── The model ──────────────────────────────────────────────────
//
// `trips.run_setup` (jsonb, migration 052) holds two things:
//
//   rules    how a run earns points — the challenge's currency. One set per
//            challenge: points per km, points for turning up, the shortest
//            run that counts, the most one day can earn, which activities
//            count at all.
//   boards   who is ranked, and how. Individuals, and teams (on their total
//            or their average per member). A list from day one, so a
//            sub-leaderboard later — "Week 2", a walking board — is a new
//            entry, never a restructure.
//
// Points are never stored. A board reads the runs and applies the rules
// every time it is drawn, so an organiser who changes a rule mid-challenge
// re-tells the whole board at once — the same posture as golf's handicap
// allowance, which is never written down reduced.
//
// ── Permissions ────────────────────────────────────────────────
//
// What the field may do for itself. Stored in `trips.event_permissions`
// beside golf's, under keys golf's parser never reads (and vice versa). The
// registry is separate from golf's on purpose: golf's are about courses and
// tee sheets and all default off; a run challenge's field normally joins
// itself, so two of its three start on.
//
// Pure. No I/O.

import { PRESET_COLORS } from './teamColors'
import { nameKey } from './roster'

/** The value `trips.kind` holds for a run challenge. */
export const RUN_KIND = 'run'

/** Is this trip row a run challenge? Fail-soft: anything else is golf. */
export function isRunChallenge(kind: unknown): boolean {
  return kind === RUN_KIND
}

// ─── Activities ────────────────────────────────────────────────

export type RunActivity = 'run' | 'trail_run' | 'treadmill' | 'walk' | 'hike'

/**
 * Every activity a challenge can count, in the order the form offers them.
 *
 * `strava` is the Strava `sport_type` each one arrives as, kept here so the
 * import (to come) maps through this list rather than a second copy of it.
 * Walks and hikes are offered but off by default: a running challenge that
 * counts a dog walk the same as a 5k is a choice, not an assumption.
 */
export const RUN_ACTIVITIES: {
  key: RunActivity
  label: string
  strava: string
  dflt: boolean
}[] = [
  { key: 'run',       label: 'Run',       strava: 'Run',        dflt: true },
  { key: 'trail_run', label: 'Trail run', strava: 'TrailRun',   dflt: true },
  { key: 'treadmill', label: 'Treadmill', strava: 'VirtualRun', dflt: true },
  { key: 'walk',      label: 'Walk',      strava: 'Walk',       dflt: false },
  { key: 'hike',      label: 'Hike',      strava: 'Hike',       dflt: false },
]

/** Which of our activities a Strava `sport_type` is — null if none counts. */
export function activityFromStrava(sportType: string): RunActivity | null {
  return RUN_ACTIVITIES.find(a => a.strava === sportType)?.key ?? null
}

// ─── Rules ─────────────────────────────────────────────────────

export type RunRules = {
  /** Points for every kilometre of a run that counts. */
  pointsPerKm: number
  /** Points for the run itself, however far — turning up is worth something. */
  pointsPerRun: number
  /** A run shorter than this earns nothing at all. */
  minKm: number
  /** The most points one person can earn in a day. Null is no limit. */
  dailyCap: number | null
  /** Which activities count. Never empty. */
  activities: RunActivity[]
}

/** The ceiling on either kind of points, per km or per run. */
export const MAX_POINTS = 100
/** The longest minimum distance a challenge can set. */
export const MAX_MIN_KM = 50
/** Bounds on a daily cap, when there is one. */
export const MIN_DAILY_CAP = 1
export const MAX_DAILY_CAP = 1000

/**
 * What a new challenge starts with: a point a kilometre, two for turning up,
 * a kilometre to count, no daily limit, running in all three forms.
 */
export function defaultRules(): RunRules {
  return {
    pointsPerKm: 1,
    pointsPerRun: 2,
    minKm: 1,
    dailyCap: null,
    activities: RUN_ACTIVITIES.filter(a => a.dflt).map(a => a.key),
  }
}

/** One decimal place — enough for 0.5 points a km, and nothing spurious. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function clampNumber(raw: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return fallback
  return round1(Math.min(hi, Math.max(lo, n)))
}

/**
 * Read whatever a stored rules object holds. Every field is clamped into
 * range and anything missing or junk falls to its default, so a rule set is
 * always whole. Activities keep the registry's order whatever order they
 * were stored in, and an empty list — a challenge that counts nothing — is
 * read as the defaults rather than believed.
 */
export function parseRules(raw: unknown): RunRules {
  const d = defaultRules()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d
  const r = raw as Record<string, unknown>

  const stored = Array.isArray(r.activities) ? r.activities : []
  const activities = RUN_ACTIVITIES.map(a => a.key).filter(k => stored.includes(k))

  const capRaw = r.dailyCap
  const dailyCap = capRaw === null || capRaw === undefined || capRaw === ''
    ? null
    : clampNumber(capRaw, MIN_DAILY_CAP, MAX_DAILY_CAP, NaN)

  return {
    pointsPerKm: clampNumber(r.pointsPerKm, 0, MAX_POINTS, d.pointsPerKm),
    pointsPerRun: clampNumber(r.pointsPerRun, 0, MAX_POINTS, d.pointsPerRun),
    minKm: clampNumber(r.minKm, 0, MAX_MIN_KM, d.minKm),
    dailyCap: Number.isFinite(dailyCap) ? dailyCap : null,
    activities: activities.length > 0 ? activities : d.activities,
  }
}

/**
 * Why these rules cannot be saved, or null when they can. The form shows
 * this; parseRules is the backstop for anything that skips the form.
 */
export function rulesIssue(rules: RunRules): string | null {
  if (rules.activities.length === 0) return 'Pick at least one activity that counts.'
  if (rules.pointsPerKm <= 0 && rules.pointsPerRun <= 0) {
    return 'Runs need to earn something — set points per km, points per run, or both.'
  }
  return null
}

/**
 * The points one run earns, before any daily cap.
 *
 * Nothing for an activity the challenge does not count, nothing for a run
 * under the minimum; otherwise the distance at the per-km rate plus the
 * flat points for the run. The minimum is inclusive — a 1 km run counts
 * when the minimum is 1 km — because "1 km or more" is how anyone says it.
 */
export function runPoints(
  run: { km: number; activity: RunActivity },
  rules: RunRules,
): number {
  if (!rules.activities.includes(run.activity)) return 0
  if (!(run.km > 0) || run.km < rules.minKm) return 0
  return round1(run.km * rules.pointsPerKm + rules.pointsPerRun)
}

/**
 * One person's points for one day: every run's points added up, then held
 * to the daily cap if there is one. The cap is on the day, not on a run, so
 * a morning 10k and an evening 5k share it.
 */
export function dayPoints(
  runs: { km: number; activity: RunActivity }[],
  rules: RunRules,
): number {
  const total = round1(runs.reduce((sum, r) => sum + runPoints(r, rules), 0))
  return rules.dailyCap === null ? total : Math.min(total, rules.dailyCap)
}

/** "7", "7.5" — a number as a person writes it, no trailing ".0". */
export function formatPoints(n: number): string {
  return String(round1(n))
}

function plural(n: number, one: string, many: string): string {
  return `${formatPoints(n)} ${n === 1 ? one : many}`
}

/**
 * The rules as sentences — the hub, the organiser area and the creation
 * form's summary all print these, so they cannot describe the same rules
 * two ways. Each line stands alone.
 */
export function describeRules(rules: RunRules): string[] {
  const lines: string[] = []
  const minPart = rules.minKm > 0 ? ` of ${formatPoints(rules.minKm)} km or more` : ''

  if (rules.pointsPerKm > 0) lines.push(`${plural(rules.pointsPerKm, 'point', 'points')} per km.`)
  if (rules.pointsPerRun > 0) {
    lines.push(`${plural(rules.pointsPerRun, 'point', 'points')} for every run${minPart}.`)
  } else if (rules.minKm > 0) {
    lines.push(`Runs under ${formatPoints(rules.minKm)} km don't count.`)
  }
  if (rules.dailyCap !== null) {
    lines.push(`Up to ${plural(rules.dailyCap, 'point', 'points')} a day.`)
  }
  const labels = RUN_ACTIVITIES.filter(a => rules.activities.includes(a.key)).map(a => a.label)
  lines.push(`Counts: ${labels.join(', ')}.`)
  return lines
}

/**
 * The rules as a board's facts — "1 point per km · 2 points a run · 1 km
 * minimum". A board reminds; the sentences above are the form's, which
 * explains (refresh plan, 4.5 and 4.9). What counts is left to the
 * sentences: a list of activities is not a fact that fits on a line.
 */
export function ruleFacts(rules: RunRules): string[] {
  const facts: string[] = []
  if (rules.pointsPerKm > 0) facts.push(`${plural(rules.pointsPerKm, 'point', 'points')} per km`)
  if (rules.pointsPerRun > 0) facts.push(`${plural(rules.pointsPerRun, 'point', 'points')} a run`)
  if (rules.minKm > 0) facts.push(`${formatPoints(rules.minKm)} km minimum`)
  if (rules.dailyCap !== null) facts.push(`Up to ${plural(rules.dailyCap, 'point', 'points')} a day`)
  return facts
}

/**
 * A worked example for the form — what a 5 km run earns under these rules,
 * so the numbers being typed mean something before anyone has run.
 */
export function exampleLine(rules: RunRules): string {
  const counted = rules.activities[0] ?? 'run'
  const pts = runPoints({ km: 5, activity: counted }, rules)
  const capped = rules.dailyCap !== null ? Math.min(pts, rules.dailyCap) : pts
  return `A 5 km run earns ${plural(capped, 'point', 'points')}.`
}

// ─── Boards ────────────────────────────────────────────────────

export type TeamScore = 'average' | 'total'

export const TEAM_SCORES: { key: TeamScore; label: string; hint: string }[] = [
  { key: 'average', label: 'Average per member',
    hint: 'Fair when teams are different sizes — everyone on the team counts, runs or not.' },
  { key: 'total', label: 'Team total',
    hint: 'Every point counts — bigger teams have the edge.' },
]

export type RunBoard = {
  id: string
  audience: 'individual' | 'team'
  /** Team boards only. Absent reads as average. */
  teamScore?: TeamScore
}

export type RunSetup = {
  rules: RunRules
  boards: RunBoard[]
}

/** Every challenge starts with two boards: the runners, and the teams. */
export function defaultBoards(teamScore: TeamScore = 'average'): RunBoard[] {
  return [
    { id: 'individual', audience: 'individual' },
    { id: 'teams', audience: 'team', teamScore },
  ]
}

function parseBoards(raw: unknown): RunBoard[] {
  if (!Array.isArray(raw)) return defaultBoards()
  const seen = new Set<string>()
  const out: RunBoard[] = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue
    const r = b as Record<string, unknown>
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null
    if (!id || seen.has(id)) continue
    if (r.audience === 'individual') {
      out.push({ id, audience: 'individual' })
    } else if (r.audience === 'team') {
      out.push({ id, audience: 'team', teamScore: r.teamScore === 'total' ? 'total' : 'average' })
    } else continue
    seen.add(id)
  }
  return out.length > 0 ? out : defaultBoards()
}

/**
 * Read `trips.run_setup` whole. Never null: a run challenge with nothing
 * stored is a challenge at its defaults, and a damaged field falls to its
 * own default without taking the rest with it.
 */
export function parseRunSetup(raw: unknown): RunSetup {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  return { rules: parseRules(r.rules), boards: parseBoards(r.boards) }
}

/** How a team board ranks, in words — the home page's rules card. */
export function describeTeamScore(score: TeamScore | undefined): string {
  return score === 'total'
    ? 'Teams are ranked on their total.'
    : 'Teams are ranked on their average per member.'
}

/** The same, as a board's fact. Absent is average. */
export function teamScoreFact(score: TeamScore | undefined): string {
  return score === 'total' ? 'Team total' : 'Average per runner'
}

// ─── Permissions ───────────────────────────────────────────────

export type RunPermissionKey = 'join_self' | 'create_teams' | 'log_runs'

/**
 * What a run challenge's field may do for itself — the one registry, which
 * the creation toggles, the organiser area, the parser and the defaults all
 * walk. A new permission is one line here.
 */
export const RUN_PERMISSIONS: {
  key: RunPermissionKey
  label: string
  hint: string
  dflt: boolean
}[] = [
  { key: 'join_self', dflt: true,
    label: 'Participants can join by themselves',
    hint: 'Anyone with the code can add their name and pick a team — off, they can only claim a name you added.' },
  { key: 'create_teams', dflt: false,
    label: 'Participants can start a new team',
    hint: 'Let someone joining start a team of their own — off, they join one of yours.' },
  { key: 'log_runs', dflt: true,
    label: 'Participants can log runs by hand',
    hint: 'Let players type a run in themselves — off, runs only arrive from a connected Strava account.' },
]

export type RunPermissions = Record<RunPermissionKey, boolean>

export function defaultRunPermissions(): RunPermissions {
  return Object.fromEntries(
    RUN_PERMISSIONS.map(p => [p.key, p.dflt]),
  ) as RunPermissions
}

/**
 * Read `trips.event_permissions` for a run challenge. Run keys holding a
 * real boolean are honoured; golf's keys, junk and absence are not — those
 * fall to the run defaults.
 */
export function parseRunPermissions(raw: unknown): RunPermissions {
  const out = defaultRunPermissions()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  for (const p of RUN_PERMISSIONS) {
    if (typeof r[p.key] === 'boolean') out[p.key] = r[p.key] as boolean
  }
  return out
}

/** What creation writes: the map when any answer differs, else nothing. */
export function storedRunPermissions(perms: RunPermissions): RunPermissions | null {
  return RUN_PERMISSIONS.some(p => perms[p.key] !== p.dflt) ? perms : null
}

// ─── Creating one ──────────────────────────────────────────────

/** The most teams a challenge starts with — a whole office, comfortably. */
export const MAX_RUN_TEAMS = 50
export const MAX_TEAM_NAME = 40
/** A challenge runs for a year at most. */
export const MAX_CHALLENGE_DAYS = 366

function dayNumber(d: string): number | null {
  const [y, m, dd] = d.split('-').map(Number)
  if (!y || !m || !dd) return null
  return Date.UTC(y, m - 1, dd) / 86_400_000
}

/** Why these dates will not do, or null. Both are required. */
export function challengeDatesIssue(start: string, end: string): string | null {
  if (!start || !end) return 'Pick a start and a finish date.'
  const a = dayNumber(start)
  const b = dayNumber(end)
  if (a === null || b === null) return 'Pick a start and a finish date.'
  if (b < a) return 'The finish cannot come before the start.'
  if (b - a + 1 > MAX_CHALLENGE_DAYS) return 'A challenge can run for a year at most.'
  return null
}

/**
 * Where the challenge stands today, in a few words: "Starts in 5 days",
 * "Day 3 of 30", "Finished". `today` is a plain date string, so a challenge
 * that finishes today is still on until the day is out. Empty when the
 * dates cannot say.
 */
export function describeProgress(
  start: string | null | undefined,
  end: string | null | undefined,
  today: string,
): string {
  const a = start ? dayNumber(start) : null
  const b = end ? dayNumber(end) : null
  const t = dayNumber(today)
  if (a === null || b === null || t === null) return ''
  if (t < a) return t + 1 === a ? 'Starts tomorrow' : `Starts in ${a - t} days`
  if (t > b) return 'Finished'
  return `Day ${t - a + 1} of ${b - a + 1}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A day as a runner reads it: "Mon 30 Nov". Spelt out by hand rather than
 * by `toLocaleDateString`, whose punctuation depends on the ICU data of
 * whatever renders it — Node's says "Mon, 30 Nov" — so a client component
 * drawn on the server and then in the browser could disagree with itself.
 */
export function describeDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(day.getTime())) return date
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`
}

function teamKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Why this list of team names will not do, or null. Blank rows are ignored
 * — a form always has one spare — but at least one real name is needed, so
 * the first person to join has a team to join.
 */
export function teamNamesIssue(names: string[]): string | null {
  const real = names.map(n => n.trim()).filter(Boolean)
  if (real.length === 0) return 'Add at least one team.'
  if (real.length > MAX_RUN_TEAMS) return `A challenge can start with up to ${MAX_RUN_TEAMS} teams.`
  if (real.some(n => n.length > MAX_TEAM_NAME)) {
    return `Team names can be up to ${MAX_TEAM_NAME} characters.`
  }
  const seen = new Set<string>()
  for (const n of real) {
    const k = teamKey(n)
    if (seen.has(k)) return `There are two teams called ${n.trim()} — each needs its own name.`
    seen.add(k)
  }
  return null
}

// ─── Joining, and the teams after creation ─────────────────────
//
// Everyone runs for a team. A runner joins with the code: claims a name the
// organiser added, or adds their own (when `join_self` is on), and picks a
// team — or starts one, when `create_teams` is on. Nobody finishes joining
// without a team. After that, moving people between teams is the
// organiser's (or anyone holding the PIN).

/** The longest name a runner can give. */
export const MAX_RUNNER_NAME = 60

/**
 * Why this runner's name will not do, or null. `roster` is everyone already
 * in the challenge; `exceptId` is the runner being renamed, so keeping a
 * name unchanged is not a clash with itself. Names are compared the way the
 * database's unique index compares them (lib/roster.ts's `nameKey`), so
 * whatever passes here is refused there only by a race.
 */
export function runnerNameIssue(
  name: string,
  roster: { id?: string; name: string }[],
  exceptId?: string | null,
): string | null {
  const n = name.trim()
  if (!n) return 'Add a name.'
  if (n.length > MAX_RUNNER_NAME) return `Names can be up to ${MAX_RUNNER_NAME} characters.`
  const key = nameKey(n)
  if (roster.some(p => p.id !== exceptId && nameKey(p.name) === key)) {
    return `${n} is already in this challenge.`
  }
  return null
}

/**
 * Why this one team name will not do, or null — a team being added (no
 * `exceptId`) or renamed. Adding is also held to the team ceiling.
 */
export function teamNameIssue(
  name: string,
  teams: { id: string; name: string }[],
  exceptId?: string | null,
): string | null {
  const n = name.trim()
  if (!n) return 'Give the team a name.'
  if (n.length > MAX_TEAM_NAME) return `Team names can be up to ${MAX_TEAM_NAME} characters.`
  const key = teamKey(n)
  if (teams.some(t => t.id !== exceptId && teamKey(t.name) === key)) {
    return `There's already a team called ${n}.`
  }
  if (!exceptId && teams.length >= MAX_RUN_TEAMS) {
    return `A challenge can have up to ${MAX_RUN_TEAMS} teams.`
  }
  return null
}

/** The colour a new team takes: the next in the palette, by count. */
export function nextTeamColor(teamCount: number): string {
  return PRESET_COLORS[((teamCount % PRESET_COLORS.length) + PRESET_COLORS.length) % PRESET_COLORS.length]
}

/**
 * Whether a team can be removed: only an empty one. Everyone runs for a
 * team, so deleting one with runners in it would leave them on none — move
 * them first.
 */
export function canRemoveTeam(memberCount: number): boolean {
  return memberCount === 0
}

/** Is the challenge over? The finish day itself still counts. */
export function challengeFinished(end: string | null | undefined, today: string): boolean {
  if (!end) return false
  const b = dayNumber(end)
  const t = dayNumber(today)
  return b !== null && t !== null && t > b
}

/**
 * What the join screen can offer, from the permissions and the roster:
 * claiming a name the organiser added, adding a new one, starting a team.
 * `closed` when the challenge has finished — a finished challenge takes no
 * new runners — and `nothing` when there is no way in at all, so the screen
 * can say who to ask rather than showing an empty page.
 */
export function joinChoices(
  perms: RunPermissions,
  roster: { claimed: boolean }[],
  finished: boolean,
): { closed: boolean; claim: boolean; addSelf: boolean; startTeam: boolean; nothing: boolean } {
  if (finished) return { closed: true, claim: false, addSelf: false, startTeam: false, nothing: false }
  const claim = roster.length > 0
  const addSelf = perms.join_self
  return { closed: false, claim, addSelf, startTeam: perms.create_teams, nothing: !claim && !addSelf }
}

// ─── Logging a run ─────────────────────────────────────────────
//
// A run typed in by hand: an activity the challenge counts, the day it was
// run, how far, and (optionally) how long. The form checks it as it is
// typed and the server route checks it again before it is saved — both
// through `runEntryIssue`, so the two can never disagree about what is
// allowed.

/** The longest single run that can be typed in. Ultras aside, this is a typo. */
export const MAX_RUN_KM = 100
/** The longest time a run can take, in minutes — a day. */
export const MAX_RUN_MINUTES = 24 * 60

export type RunEntry = {
  activity: RunActivity
  /** The day it was run, YYYY-MM-DD. */
  date: string
  km: number
  /** How long it took, or null when not given. */
  minutes: number | null
}

/** Two decimal places for a distance — ten metres is as fine as anyone types. */
export function roundKm(km: number): number {
  return Math.round(km * 100) / 100
}

/** A day number plus n days, as YYYY-MM-DD. */
export function addDays(date: string, n: number): string {
  const d = dayNumber(date)
  if (d === null) return date
  return new Date((d + n) * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Read a run off a request body. Shape only — numbers are numbers, the
 * activity is one we know, the date looks like a date — or null. Whether
 * the run is allowed is `runEntryIssue`'s question.
 */
export function parseRunEntry(raw: unknown): RunEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const activity = RUN_ACTIVITIES.find(a => a.key === r.activity)?.key
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null
  const km = typeof r.km === 'number' ? r.km : typeof r.km === 'string' ? Number(r.km) : NaN
  const minRaw = r.minutes
  const minutes = minRaw === null || minRaw === undefined || minRaw === ''
    ? null
    : typeof minRaw === 'number' ? minRaw : Number(minRaw)
  if (!activity || !date || !Number.isFinite(km)) return null
  if (minutes !== null && !Number.isFinite(minutes)) return null
  return { activity, date, km: roundKm(km), minutes: minutes === null ? null : Math.round(minutes) }
}

/**
 * Why this run cannot be saved, or null when it can.
 *
 * `latest` is the last day a run can be logged for — today, as the person
 * logging sees it. The server passes a day beyond its own today, because a
 * phone in a timezone ahead of the server's is already on tomorrow.
 */
export function runEntryIssue(
  e: RunEntry,
  ctx: { start: string | null; end: string | null; latest: string; activities: RunActivity[] },
): string | null {
  if (!ctx.activities.includes(e.activity)) return 'That activity does not count in this challenge.'
  const day = dayNumber(e.date)
  if (day === null) return 'Pick the day you ran.'
  const start = ctx.start ? dayNumber(ctx.start) : null
  const end = ctx.end ? dayNumber(ctx.end) : null
  const latest = dayNumber(ctx.latest)
  if (start !== null && day < start) return 'That day is before the challenge started.'
  if (end !== null && day > end) return 'That day is after the challenge finished.'
  if (latest !== null && day > latest) return 'That day has not happened yet.'
  if (!(e.km > 0)) return 'Add how far you went.'
  if (e.km > MAX_RUN_KM) return `A single run can be up to ${MAX_RUN_KM} km.`
  if (e.minutes !== null && (e.minutes < 1 || e.minutes > MAX_RUN_MINUTES)) {
    return 'The time should be between a minute and a day.'
  }
  return null
}

/** "5:30 /km" — the pace of a run with a time, or null without one. */
export function describePace(km: number, minutes: number | null): string | null {
  if (minutes === null || !(km > 0)) return null
  const secsPerKm = Math.round((minutes * 60) / km)
  const m = Math.floor(secsPerKm / 60)
  const s = secsPerKm % 60
  return `${m}:${String(s).padStart(2, '0')} /km`
}

/** "1h 05m" or "42m" — a run's time as a person writes it. */
export function describeDuration(minutes: number | null): string | null {
  if (minutes === null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

// ─── Editing the rules ─────────────────────────────────────────
//
// The points rules as a form holds them — numbers as typed, so a box can be
// half-finished without the rules jumping about — and the one translation
// back into rules. Creation and the organiser area both edit through this,
// so the two forms can never read the same box two ways.

export type RulesDraft = {
  perKm: string
  perRun: string
  minKm: string
  capOn: boolean
  cap: string
  activities: RunActivity[]
  teamScore: TeamScore
}

/** A draft holding exactly what a stored setup says. */
export function draftFromSetup(setup: RunSetup): RulesDraft {
  const r = setup.rules
  const team = setup.boards.find(b => b.audience === 'team')
  return {
    perKm: formatPoints(r.pointsPerKm),
    perRun: formatPoints(r.pointsPerRun),
    minKm: formatPoints(r.minKm),
    capOn: r.dailyCap !== null,
    cap: r.dailyCap !== null ? formatPoints(r.dailyCap) : '20',
    activities: [...r.activities],
    teamScore: team?.teamScore ?? 'average',
  }
}

/** The rules a draft says, clamped like anything read from storage. */
export function rulesFromDraft(d: RulesDraft): RunRules {
  return parseRules({
    pointsPerKm: d.perKm,
    pointsPerRun: d.perRun,
    minKm: d.minKm,
    dailyCap: d.capOn ? d.cap : null,
    activities: d.activities,
  })
}

/** Why a draft cannot be saved, or null. */
export function draftIssue(d: RulesDraft): string | null {
  const issue = rulesIssue(rulesFromDraft(d))
  if (issue) return issue
  if (d.capOn && !(Number(d.cap) >= MIN_DAILY_CAP)) return 'Set the daily limit, or switch it off.'
  return null
}

/**
 * A setup with these rules and this team comparison, keeping every board
 * already there — a sub-leaderboard added later must not be lost to a
 * rules edit. Only team boards take the comparison.
 */
export function setupWithDraft(setup: RunSetup, d: RulesDraft): RunSetup {
  return {
    rules: rulesFromDraft(d),
    boards: setup.boards.map(b => b.audience === 'team' ? { ...b, teamScore: d.teamScore } : b),
  }
}

// ─── When a challenge closes ───────────────────────────────────
//
// A Strava connection lasts for the challenge, not for ever (Strava's API
// Policy keeps a stored copy of anyone's runs to seven days and to the
// purpose it was given for). So a challenge has a shape in time:
//
//   upcoming  before the start
//   live      start to finish — runs count, Strava keeps them arriving
//   closing   the finish has passed; for FINAL_GRACE_DAYS late uploads and
//             edits still reach the board, and the organiser can still
//             extend the finish
//   final     the team standings are frozen, every Strava run in it is
//             deleted and every Strava link to it ended — the frozen team
//             result is what stays
//
// Extending the finish is allowed until the challenge is final, and moves
// everything with it.

/** Days after the finish during which late runs still arrive. */
export const FINAL_GRACE_DAYS = 3

/** The day after which a challenge finished on `end` is frozen. */
export function closesOn(end: string): string {
  return addDays(end, FINAL_GRACE_DAYS)
}

export type ChallengePhase = 'upcoming' | 'live' | 'closing' | 'final'

export function challengePhase(
  start: string | null | undefined,
  end: string | null | undefined,
  today: string,
  finalised: boolean,
): ChallengePhase {
  if (finalised) return 'final'
  if (end && today > end) return 'closing'
  if (start && today < start) return 'upcoming'
  return 'live'
}

/** Is it time to freeze this challenge? Past its grace days and not frozen yet. */
export function dueForFinal(end: string | null | undefined, today: string, finalised: boolean): boolean {
  return !finalised && !!end && today > closesOn(end)
}

/**
 * A creation failure, told plainly. The two that mean "migration 052 has
 * not been run" — the kind check refusing 'run', or the setup column not
 * existing — say so; anything else is handed back for the caller's
 * general wording.
 */
export function migrationMissing(err: unknown): boolean {
  const msg = (err as { message?: string } | null)?.message ?? ''
  return /trips_kind_check|run_setup/i.test(msg)
}

export const MIGRATION_MISSING_MESSAGE =
  'Running needs a database update that has not been applied yet (migration 052).'
