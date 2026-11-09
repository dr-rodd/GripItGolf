// What an event's field may do for itself — the only copy.
//
// One settings object per event, `trips.event_permissions` (jsonb,
// migration 049): a plain map of permission key to boolean, read whole
// through `parseEventPermissions`. The registry below is the entire
// definition of what permissions exist — key, plain-language label, hint
// and default — and everything else derives from it: the creation toggles,
// the admin page, the parser, the defaults. **Adding a permission is one
// line here**, never a schema change and never a restructure; an event
// stored before the new key existed simply reads the new default until its
// organiser says otherwise.
//
// Defaults lean conservative — off, the organiser opts in — because an
// event is organiser-run in a way a trip is not. The one exception is
// scoring a match play card, which is open by default (Ross, 25 Oct 2026):
// anybody can take a match live, and the organiser can keep it to the
// players. **Trips are
// untouched by all of this**: `allowsParticipant` answers true for
// anything that is not an event, so every trip keeps the open access it
// has always had, and no trip-scoped screen changes behaviour.
//
// The gate is a UI gate in the same honest sense as the organiser PIN
// (lib/passcode.ts): writes still go through the anon key and the trip
// code is still the platform's only access control. What these settings
// decide is what a participant's screens offer, which on a phone in a
// group is the whole of the experience.
//
// Pure. No I/O.

import { isEvent } from './eventHub'

export type EventPermissionKey =
  | 'add_courses'
  | 'add_players'
  | 'edit_scores'
  | 'edit_tee_sheet'
  | 'set_tee_sheets'
  | 'assign_tag'
  | 'add_rounds'
  | 'set_venues'
  | 'score_matches'
  | 'score_session_matches'
  | 'edit_handicaps'
  | 'submit_cards'

export const EVENT_PERMISSIONS: {
  key: EventPermissionKey
  label: string
  hint: string
  dflt: boolean
  /** What it lets the field do, for a style's advice: "Players can …", "Only you …". */
  does: string
  /**
   * Only means anything on a series, so only a series is asked it
   * (`permissionsFor`). Stored and parsed like every other key regardless —
   * the registry stays one list.
   */
  seriesOnly?: true
  /** Only means anything on a match play event (`permissionsFor`). */
  knockoutOnly?: true
  /** Only means anything on a continuous league of periods (`permissionsFor`). */
  periodsOnly?: true
  /** Only means anything on an event with a Dynamic Overall Leaderboard (`permissionsFor`). */
  sessionsOnly?: true
  /** Said under the toggle while it is off — what switching it off costs. */
  offWarning?: string
  /**
   * Its answer on a **Strict** event (Ross, 5 Nov 2026: "ynnyny" down the
   * match play list). **Relaxed** is every one on, so it needs no column.
   */
  strict: boolean
  /**
   * Asked as the event's tee times question rather than among the toggles
   * (`TEE_SHEET_PERMISSIONS`; Ross, 26 Oct 2026) — two answers that only
   * mean anything together with the sheets themselves.
   */
  teeSheet?: true
}[] = [
  { key: 'add_courses', dflt: false, does: 'add a missing course', strict: true,
    label: 'Participants can add new courses',
    hint: 'Let the field add a missing course to the platform.' },
  { key: 'add_players', dflt: false, does: 'add players to the field', strict: false,
    label: 'Participants can add new players',
    hint: 'Let anyone with the code put a new name on the roster.' },
  { key: 'edit_scores', dflt: false, does: 'fix a finished scorecard', strict: false,
    label: 'Participants can edit leaderboard entries',
    hint: 'Let players rework a finished scorecard; live scoring stays open either way.' },
  // Placing players — on by default, "medium security" (Ross, 26 Oct 2026):
  // each claimed player books themselves and anyone they bring, and may
  // move or remove only those (`tee_assignments.booked_by`, migration 065);
  // the organiser removes anybody. Off, the organiser places everybody and
  // the sheet is read-only to the rest (lib/teeSheet.ts `mayRemoveBooking`).
  { key: 'edit_tee_sheet', dflt: true, teeSheet: true, does: 'book their own tee times', strict: true,
    label: 'Players book their own tee times',
    hint: 'Each player books themselves and anyone they bring, and can change only those. Off, you place everyone and the sheet is read-only to the rest.' },
  // Making the sheets: off, the wizard asks for the PIN; on, anyone with
  // the code may make or change a round's sheet — a casual event nobody
  // runs, with an Edit button on the Tee times tab.
  { key: 'set_tee_sheets', dflt: false, teeSheet: true, does: 'open the tee sheets', strict: false,
    label: 'Anyone can open the tee sheets',
    hint: 'For a casual event nobody runs: open or change a round\'s tee sheet without the PIN.' },
  // Joining a tag is a different verb from forming a team: a tag board's
  // `teamPick: 'self'` cousin lets the field CREATE teams on that board's
  // sheet, while this only lets a claimed player join one of the tags the
  // organiser has already made (lib/tagBoards.ts). Both stay, deliberately.
  { key: 'assign_tag', dflt: false, does: 'pick their own tag', strict: true,
    label: 'Participants can pick their own tag',
    hint: 'Let claimed players join one of your tags for the event.' },
  // A league's rounds can arrive as they are played: somebody adds the
  // day's round on the Scoring tab when the group turns up. The organiser
  // can always do it with the PIN; this lets the field do it without.
  { key: 'add_rounds', dflt: false, seriesOnly: true, does: 'add the next round', strict: false,
    label: 'Participants can add the next round',
    hint: 'Let anyone add the league\'s next round on the Scoring tab, without the PIN.' },
  // A round may be made with its venue to be confirmed, and it cannot be
  // played until somebody chooses one — on the Scoring tab or the hub.
  { key: 'set_venues', dflt: false, seriesOnly: true, does: 'choose a round\'s venue', strict: false,
    label: 'Participants can choose a round\'s venue',
    hint: 'Let anyone pick a venue still to be confirmed, without the PIN.' },
  // A match play card: on, anybody with the code can take a match live and
  // score every hole; off, only the players in it, and the organiser with
  // the admin PIN. The one permission on by default.
  { key: 'score_matches', dflt: true, knockoutOnly: true, does: 'score any match', strict: false,
    label: 'Participants can score any match',
    hint: 'Let anyone take a match live and score it. Off, only its players can — and you, with the PIN.' },
  // A session's matches (Ross, 9 Nov 2026, D45) — its own permission, apart
  // from the Knockout's: Strict, a match is scored by its players and the
  // organiser; Relaxed, by anyone with the code.
  { key: 'score_session_matches', dflt: true, sessionsOnly: true, does: 'score any session match', strict: false,
    label: 'Participants can score any session match',
    hint: 'Let anyone take a session’s match live and score it. Off, only its players can — and you, with the PIN.' },
  // A player's own handicap — on by default (Ross, 4 Nov 2026): each player
  // fills theirs in on claiming a name left without one, or joining, and
  // amends it on their match page until the match is under way. Off, the
  // handicaps are the organiser's alone (Trip Setup, with the PIN), which
  // has a cost the toggle says.
  { key: 'edit_handicaps', dflt: true, does: 'set their own handicaps', strict: true,
    label: 'Participants can set their own handicaps',
    hint: 'Each player fills in their own handicap, and can change it until they play.',
    offWarning: 'Only you can change a handicap. Players who join by invite link will need you to set theirs, and anyone without a handicap can’t start a round.' },
  // A continuous league's cards (Ross, 8 Nov 2026): on, anybody in the field
  // starts a card inside an open period, on a course the league allows —
  // the league is cards handed in by its players. Off, the organiser
  // starts each one with the PIN; the players still score their own.
  { key: 'submit_cards', dflt: true, periodsOnly: true, does: 'start a card in a period', strict: false,
    label: 'Participants can start their own cards',
    hint: 'Let anyone in the field start a card inside an open period, without the PIN.' },
]

/**
 * The permissions worth asking about on this event — every one, less those
 * that only mean something on a series, or on match play, when it is not
 * one, and less the two the tee times question asks. The creation toggles,
 * the admin page and its summary line all read this, so a permission is
 * never offered where it would do nothing, nor twice.
 */
export function permissionsFor(series: boolean, knockout = false, periods = false, sessions = false): typeof EVENT_PERMISSIONS {
  return EVENT_PERMISSIONS.filter(p =>
    (series || !p.seriesOnly) && (knockout || !p.knockoutOnly) && (periods || !p.periodsOnly)
    && (sessions || !p.sessionsOnly) && !p.teeSheet)
}

/** The tee times question's two answers, in the order they are asked. */
export const TEE_SHEET_PERMISSIONS = EVENT_PERMISSIONS.filter(p => p.teeSheet)

/**
 * The tee times question's two answers as stored — on an event, and on a
 * trip too (Ross, 26 Oct 2026: tee times reached trips "under similar
 * conditions"). Read straight from the column for both, never through
 * `allowsParticipant`, which opens every gate on a trip: a trip's lead
 * player answers this question like an organiser does, and the defaults
 * (the organiser opens the sheets and places the players) hold until they
 * do. On a trip with no passcode "the organiser" is anybody, the soft
 * lock's fail-open.
 */
export function teeSheetAccess(raw: unknown): { anyoneOpens: boolean; playersPick: boolean } {
  const p = parseEventPermissions(raw)
  return { anyoneOpens: p.set_tee_sheets, playersPick: p.edit_tee_sheet }
}

export type EventPermissions = Record<EventPermissionKey, boolean>

// ─── Strict or relaxed (Ross, 5 Nov 2026) ──────────────────────
//
// The collaboration question answered in one tap, before any toggle: a
// **Relaxed** event the field runs with the organiser (every permission
// asked, on), a **Strict** one the organiser runs (each permission's
// `strict` answer — a missing course and their own handicap and tag the
// field's, the field, the results and a league's rounds the organiser's).
// Choosing one says what it means in a few lines; the toggles stay one tap
// away for anybody who wants their own mix. Only the toggles asked are
// touched — the tee times question keeps its own answers. Leagues answer it
// the same way, their rounds and venues among the strict "only you"s.

export type CollabStyle = 'relaxed' | 'strict'

export const COLLAB_STYLES: { key: CollabStyle; label: string; hint: string; vibe: string }[] = [
  { key: 'relaxed', label: 'Relaxed', hint: 'The field runs it with you.',
    vibe: 'For friends and societies who trust each other: everybody pitches in, and nothing waits on you.' },
  { key: 'strict', label: 'Strict', hint: 'You run it. Players look after their own details.',
    vibe: 'For a competition with something on it: the field and the results are yours.' },
]

const styleValue = (style: CollabStyle, p: { strict: boolean }) => style === 'relaxed' || p.strict

/** The answers with a style applied to the permissions asked here — the rest kept as they are. */
export function withCollabStyle(
  perms: EventPermissions, style: CollabStyle, registry: readonly (typeof EVENT_PERMISSIONS)[number][],
): EventPermissions {
  const out = { ...perms }
  for (const p of registry) out[p.key] = styleValue(style, p)
  return out
}

/** Which style the answers asked here are, or null for a mix of the organiser's own. */
export function collabStyleOf(
  perms: EventPermissions, registry: readonly (typeof EVENT_PERMISSIONS)[number][],
): CollabStyle | null {
  return COLLAB_STYLES.find(s => registry.every(p => perms[p.key] === styleValue(s.key, p)))?.key ?? null
}

/** "a, b and c" */
const listed = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * What a style means, in a few lines: the feel of it, what the field can
 * do, what only the organiser does — over the permissions asked here, so a
 * league says its rounds and a match play event its matches.
 */
export function collabAdvice(
  style: CollabStyle, registry: readonly (typeof EVENT_PERMISSIONS)[number][],
): string[] {
  const s = COLLAB_STYLES.find(x => x.key === style)!
  const can = registry.filter(p => styleValue(style, p)).map(p => p.does)
  const yours = registry.filter(p => !styleValue(style, p)).map(p => p.does)
  return [
    s.vibe,
    ...(can.length ? [`Players can ${listed(can)}.`] : []),
    ...(yours.length ? [`Only you can ${listed(yours)}, with the PIN.`] : []),
    style === 'relaxed'
      ? `The PIN still keeps ${registry.some(p => p.knockoutOnly) ? 'the draw, ' : ''}notices and settings yours.`
      : 'Anything here can be changed later in the organiser area.',
  ]
}

/** Every permission at its registry default — a fresh, conservative event. */
export function defaultPermissions(): EventPermissions {
  return Object.fromEntries(
    EVENT_PERMISSIONS.map(p => [p.key, p.dflt]),
  ) as EventPermissions
}

/**
 * Read whatever `trips.event_permissions` holds. Registry keys with a real
 * boolean are honoured; everything else — absent keys, an un-migrated
 * column, junk — falls to the default. Never null: an event with nothing
 * stored is simply an event at its defaults, which is what conservative
 * defaults are for.
 */
export function parseEventPermissions(raw: unknown): EventPermissions {
  const out = defaultPermissions()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  for (const p of EVENT_PERMISSIONS) {
    if (typeof r[p.key] === 'boolean') out[p.key] = r[p.key] as boolean
  }
  return out
}

/**
 * May a participant do this here? The one copy of "trips are untouched":
 * anything that is not an event answers yes, exactly as it always did; an
 * event answers from its stored settings. `raw` is the column as fetched —
 * parsing lives inside so no caller can half-parse.
 */
export function allowsParticipant(
  kind: unknown,
  raw: unknown,
  key: EventPermissionKey,
): boolean {
  if (!isEvent(kind)) return true
  return parseEventPermissions(raw)[key]
}

/**
 * What creation writes: the map when any answer differs from the defaults,
 * null when none does. Nothing chosen writes nothing — so event creation
 * still works before migration 049 has run, and only an organiser who
 * actually opened something up needs the column. The admin page always
 * writes the whole map, because by then the column is the point.
 */
export function storedPermissions(perms: EventPermissions): EventPermissions | null {
  return EVENT_PERMISSIONS.some(p => perms[p.key] !== p.dflt) ? perms : null
}

/**
 * The permissions that start on, said by name in the summary rather than
 * counted — an event at its defaults is still organiser-run.
 */
const OPEN_BY_DEFAULT: Partial<Record<EventPermissionKey, string>> = {
  edit_handicaps: 'players set their own handicaps',
  score_matches: 'anyone can score a match',
  score_session_matches: 'anyone can score a session match',
}

/** "2 of 3 on" — the admin card's one-line summary, over what this event is asked. */
export function describePermissions(
  perms: EventPermissions,
  registry: readonly { key: EventPermissionKey }[] = EVENT_PERMISSIONS,
): string {
  const on = registry.filter(p => perms[p.key])
  if (on.every(p => OPEN_BY_DEFAULT[p.key])) {
    const open = on.map(p => OPEN_BY_DEFAULT[p.key]!)
    return open.length === 0
      ? 'Organiser-run — participants play, you manage.'
      : `Organiser-run — ${open.join(', and ')}.`
  }
  return `${on.length} of ${registry.length} participant permissions on.`
}
