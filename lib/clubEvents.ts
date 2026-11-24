// A club's calendar beyond its competitions — the only copy of the rules
// (Clubhouse stage c1; Ross, 17 Nov 2026).
//
// Every event under a club has a **type**: Competition (golf members book —
// a club competition, a trips row), or one of the club's own events
// (`club_events`, migration 095): Golf (on the calendar, not booked here —
// interclubs, societies, formats Green Dot does not run), Social, Club
// business (the AGM, committees), Other sport (tennis, bridge), Course
// (closures, maintenance), Miscellaneous. A calendar file says them as COMP
// GOLF SOCIAL BUSINESS SPORT COURSE MISC.
//
// Who sees what, decided on the server, never by a screen:
//   * **Visibility**, per event: Members, or Office only — the Clubhouse
//     alone, never the members app, not even an Officer without Clubhouse.
//     **Office only is never for golf** (Ross: anything that affects the
//     tee sheets is the members'): Competition, Golf and Course are always
//     Members.
//   * **What the club shows its members**, per type (Club settings, "Show
//     to members", on by default) — the same three always shown.
//   * **What a member asks to see** ("From my clubs, show me", their
//     account) — every type but Competition, which always shows.
//
// Pure. No I/O.

export type EventType = 'COMP' | 'GOLF' | 'SOCIAL' | 'BUSINESS' | 'SPORT' | 'COURSE' | 'MISC'
/** A type a club's own event (not a competition) may have. */
export type ClubEventType = Exclude<EventType, 'COMP'>
export type Visibility = 'members' | 'office'

/** Every type, in the order screens list them, with its words. */
export const EVENT_TYPES: readonly { code: EventType; label: string; plural: string }[] = [
  { code: 'COMP', label: 'Competition', plural: 'Competitions' },
  { code: 'GOLF', label: 'Golf', plural: 'Golf' },
  { code: 'SOCIAL', label: 'Social', plural: 'Social' },
  { code: 'BUSINESS', label: 'Club business', plural: 'Club business' },
  { code: 'SPORT', label: 'Other sport', plural: 'Other sport' },
  { code: 'COURSE', label: 'Course', plural: 'Course' },
  { code: 'MISC', label: 'Miscellaneous', plural: 'Miscellaneous' },
]
export const CLUB_EVENT_TYPES: readonly ClubEventType[] = ['GOLF', 'SOCIAL', 'BUSINESS', 'SPORT', 'COURSE', 'MISC']

/** Types that touch the golf — always the members', never Office only, never hidden by the club. */
export const GOLF_TYPES: readonly EventType[] = ['COMP', 'GOLF', 'COURSE']
/** Types an event may be Office only for, and a club may choose not to show its members. */
export const OFFICE_TYPES: readonly ClubEventType[] = ['SOCIAL', 'BUSINESS', 'SPORT', 'MISC']
/** Types a member may choose not to see — every type but Competition. */
export const MEMBER_FILTER_TYPES: readonly ClubEventType[] = CLUB_EVENT_TYPES

export function typeLabel(t: EventType): string {
  return EVENT_TYPES.find(x => x.code === t)?.label ?? 'Event'
}
export function isEventType(v: unknown): v is EventType {
  return typeof v === 'string' && EVENT_TYPES.some(t => t.code === v)
}
export function isClubEventType(v: unknown): v is ClubEventType {
  return typeof v === 'string' && (CLUB_EVENT_TYPES as readonly string[]).includes(v)
}
export function mayBeOffice(t: EventType): boolean {
  return (OFFICE_TYPES as readonly string[]).includes(t)
}

/** One of the club's own events, as the Clubhouse and the members app read it. */
export interface ClubNote {
  id: string
  /** The calendar file's Ref, when it came in on one. */
  ref: string | null
  title: string
  type: ClubEventType
  /** YYYY-MM-DD. */
  startsOn: string
  /** YYYY-MM-DD, or null for a one-day event. */
  endsOn: string | null
  /** "19:30", or null. */
  startTime: string | null
  endTime: string | null
  place: string | null
  notes: string | null
  visibility: Visibility
  /**
   * Golf and Course only (migration 096): the event takes the casual tee
   * sheet for its times — all day without them (lib/clubTeeSheet.ts). A
   * corporate outing, a society, a course closure.
   */
  blocksSheet: boolean
  /** D288, migration 101: the label it carries — none is its type's default label. Absent before 101. */
  labelId?: string | null
  /** D292: its label's colour (else its type's), set by the server for the members app. */
  colour?: string
  /**
   * D277, migration 099: the room an event is in, or — a Golf or Course
   * event — the course it is on (null: Course 1). Absent before 099. An
   * event in neither keeps `place`, its free text ("Other").
   */
  locationId?: string | null
  locationCourseId?: string | null
}

/** Types whose events may block the casual tee sheet. */
export const BLOCK_TYPES: readonly ClubEventType[] = ['GOLF', 'COURSE']
export function mayBlockSheet(t: EventType): boolean {
  return (BLOCK_TYPES as readonly string[]).includes(t)
}

export const NOTE_TITLE_MAX = 80
export const NOTE_PLACE_MAX = 80
export const NOTE_NOTES_MAX = 1000
const DAY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

const tidy = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/[ \t]+/g, ' ')
  return t ? t.slice(0, max) : null
}
const realDay = (d: string) => DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d)

/** An event as it arrives from a form or a file — anything, tidied; `noteIssue` says whether it can be kept. */
export function readClubNote(raw: unknown): Omit<ClubNote, 'id' | 'ref'> & { id: string | null; ref: string | null } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const type = isClubEventType(r.type) ? r.type : ('' as ClubEventType)
  const clock = (v: unknown) => (typeof v === 'string' && CLOCK.test(v.trim().slice(0, 5)) ? v.trim().slice(0, 5) : typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    id: typeof r.id === 'string' && r.id ? r.id : null,
    ref: tidy(r.ref, 40),
    title: tidy(r.title, NOTE_TITLE_MAX + 1) ?? '',
    type,
    startsOn: typeof r.startsOn === 'string' ? r.startsOn.trim() : '',
    endsOn: typeof r.endsOn === 'string' && r.endsOn.trim() ? r.endsOn.trim() : null,
    startTime: clock(r.startTime),
    endTime: clock(r.endTime),
    place: tidy(r.place, NOTE_PLACE_MAX + 1),
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, NOTE_NOTES_MAX + 1) : null,
    visibility: r.visibility === 'office' ? 'office' : 'members',
    blocksSheet: r.blocksSheet === true,
    locationId: typeof r.locationId === 'string' && r.locationId ? r.locationId : null,
    locationCourseId: typeof r.locationCourseId === 'string' && r.locationCourseId ? r.locationCourseId : null,
    labelId: typeof r.labelId === 'string' && r.labelId && !r.labelId.startsWith('type:') ? r.labelId : null,
  }
}

/** Why an event cannot be kept, in a sentence — or null. */
export function noteIssue(n: ReturnType<typeof readClubNote>): string | null {
  if (!n.title) return 'Give the event a title.'
  if (n.title.length > NOTE_TITLE_MAX) return `Keep the title under ${NOTE_TITLE_MAX} characters.`
  if (!isClubEventType(n.type)) return 'Choose what kind of event it is.'
  if (!realDay(n.startsOn)) return 'Pick the day.'
  if (n.endsOn !== null && (!realDay(n.endsOn) || n.endsOn < n.startsOn)) return 'The last day is on or after the first.'
  if (n.startTime !== null && !CLOCK.test(n.startTime)) return 'A start time is HH:MM.'
  if (n.endTime !== null && !CLOCK.test(n.endTime)) return 'An end time is HH:MM.'
  if (n.endTime !== null && n.startTime === null) return 'An end time needs a start time.'
  if (n.startTime && n.endTime && (n.endsOn ?? n.startsOn) === n.startsOn && n.endTime <= n.startTime) return 'It ends after it starts.'
  if (n.place && n.place.length > NOTE_PLACE_MAX) return `Keep where under ${NOTE_PLACE_MAX} characters.`
  if (n.notes && n.notes.length > NOTE_NOTES_MAX) return `Keep the notes under ${NOTE_NOTES_MAX} characters.`
  if (n.visibility === 'office' && !mayBeOffice(n.type)) return `${typeLabel(n.type)} events are always shown to members — anything that touches the golf is.`
  if (n.blocksSheet && !mayBlockSheet(n.type)) return 'Only a Golf or Course event takes the tee sheet.'
  if (n.blocksSheet && n.visibility === 'office') return 'An event that takes the tee sheet is shown to members.'
  if (n.locationId && n.locationCourseId) return 'An event is in one place.'
  if (n.locationCourseId && n.type !== 'GOLF' && n.type !== 'COURSE') return 'Only a Golf or Course event is on a course.'
  return null
}

/** The types a club does not show its members, as stored — never a golf type. */
export function readHiddenTypes(raw: unknown): ClubEventType[] {
  return Array.isArray(raw) ? OFFICE_TYPES.filter(t => raw.includes(t)) : []
}

/** The types a member has asked not to see, as stored — never Competition. */
export function readMemberHidden(raw: unknown): ClubEventType[] {
  return Array.isArray(raw) ? MEMBER_FILTER_TYPES.filter(t => raw.includes(t)) : []
}

/** Whether the members app shows a club event to a member: theirs to see, the club showing it, and the member wanting it. */
export function memberSees(n: Pick<ClubNote, 'type' | 'visibility'>, clubHidden: readonly ClubEventType[], mineHidden: readonly ClubEventType[] = []): boolean {
  if (n.visibility === 'office') return false
  if (clubHidden.includes(n.type)) return false
  return !mineHidden.includes(n.type)
}

/** "7:30 pm to 10:00 pm", "From 7:30 pm", or null — Irish wall clocks as given. */
export function noteTimeLine(n: Pick<ClubNote, 'startTime' | 'endTime'>): string | null {
  const say = (c: string) => {
    const [h, m] = c.split(':').map(Number)
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
  }
  if (!n.startTime) return null
  return n.endTime ? `${say(n.startTime)} to ${say(n.endTime)}` : `From ${say(n.startTime)}`
}

/** Whether a club event is on, to come, or over, against today's Irish date. */
export function noteWhen(n: Pick<ClubNote, 'startsOn' | 'endsOn'>, today: string): 'now' | 'upcoming' | 'past' {
  if ((n.endsOn ?? n.startsOn) < today) return 'past'
  return n.startsOn <= today ? 'now' : 'upcoming'
}

// ─── An event broadcast to club.stream (D325) ───────────────────

/** The types whose "Post to club.stream" tick starts on for a new event (Ross: non-competition activity). */
export const ANNOUNCE_TYPES: readonly ClubEventType[] = ['SOCIAL', 'BUSINESS', 'SPORT', 'MISC']

/** Whether an event may be broadcast at all: never Office only — the members never see it (D234). */
export function mayAnnounce(n: Pick<ClubNote, 'visibility'>): boolean {
  return n.visibility !== 'office'
}

/**
 * The post a club event makes in club.stream (D325): its title as the
 * heading, then when and where on one line, then its notes. `dates` is the
 * site's own date words (lib/clubs.ts `clubEventDates`), handed in so this
 * file needs no other.
 */
export function announcement(n: Pick<ClubNote, 'title' | 'startTime' | 'endTime' | 'notes'>, dates: string, place: string | null): { title: string; text: string } {
  const when = [dates, noteTimeLine(n)].filter(Boolean).join(', ')
  const line = [when, place].filter(Boolean).join(' · ')
  return { title: n.title, text: [line, (n.notes ?? '').trim()].filter(Boolean).join('\n\n') }
}
