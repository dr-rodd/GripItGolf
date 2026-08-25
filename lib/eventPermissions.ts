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
// Defaults lean conservative — everything off, the organiser opts in —
// because an event is organiser-run in a way a trip is not. **Trips are
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
  | 'assign_tag'

export const EVENT_PERMISSIONS: {
  key: EventPermissionKey
  label: string
  hint: string
  dflt: boolean
}[] = [
  { key: 'add_courses', dflt: false,
    label: 'Participants can add new courses',
    hint: 'Let the field add a course to the platform if theirs is missing.' },
  { key: 'add_players', dflt: false,
    label: 'Participants can add new players',
    hint: 'Let anyone with the code put a new name on the roster — off, they can only claim a name you added.' },
  { key: 'edit_scores', dflt: false,
    label: 'Participants can edit leaderboard entries',
    hint: 'Let players rework a whole scorecard from the summary screen — hole-by-hole scoring stays open either way.' },
  { key: 'edit_tee_sheet', dflt: false,
    label: 'Participants can edit the tee sheet',
    hint: 'Let the field put names into open slots and take their own out — off, the sheet is read-only and you place everyone.' },
  // Joining a tag is a different verb from forming a team: a tag board's
  // `teamPick: 'self'` cousin lets the field CREATE teams on that board's
  // sheet, while this only lets a claimed player join one of the tags the
  // organiser has already made (lib/tagBoards.ts). Both stay, deliberately.
  { key: 'assign_tag', dflt: false,
    label: 'Participants can pick their own tag',
    hint: 'Let a claimed player join one of your tags from the teams screen — off, you assign every tag yourself.' },
]

export type EventPermissions = Record<EventPermissionKey, boolean>

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

/** "2 of 3 on" — the admin card's one-line summary. */
export function describePermissions(perms: EventPermissions): string {
  const on = EVENT_PERMISSIONS.filter(p => perms[p.key]).length
  if (on === 0) return 'Organiser-run — participants play, you manage.'
  return `${on} of ${EVENT_PERMISSIONS.length} participant permissions on.`
}
