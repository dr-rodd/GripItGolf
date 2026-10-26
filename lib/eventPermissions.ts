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

export const EVENT_PERMISSIONS: {
  key: EventPermissionKey
  label: string
  hint: string
  dflt: boolean
  /**
   * Only means anything on a series, so only a series is asked it
   * (`permissionsFor`). Stored and parsed like every other key regardless —
   * the registry stays one list.
   */
  seriesOnly?: true
  /** Only means anything on a match play event (`permissionsFor`). */
  knockoutOnly?: true
  /**
   * Asked as the event's tee times question rather than among the toggles
   * (`TEE_SHEET_PERMISSIONS`; Ross, 26 Oct 2026) — two answers that only
   * mean anything together with the sheets themselves.
   */
  teeSheet?: true
}[] = [
  { key: 'add_courses', dflt: false,
    label: 'Participants can add new courses',
    hint: 'Let the field add a missing course to the platform.' },
  { key: 'add_players', dflt: false,
    label: 'Participants can add new players',
    hint: 'Let anyone with the code put a new name on the roster.' },
  { key: 'edit_scores', dflt: false,
    label: 'Participants can edit leaderboard entries',
    hint: 'Let players rework a finished scorecard; live scoring stays open either way.' },
  // Placing players: off, the organiser places everybody and the sheet is
  // read-only to the rest; on, each claimed player picks their own time
  // from what is free (lib/teeSheet.ts).
  { key: 'edit_tee_sheet', dflt: false, teeSheet: true,
    label: 'Players pick their own tee time',
    hint: 'Each player chooses a free time on the sheet. Off, you place everyone and the sheet is read-only to the rest.' },
  // Making the sheets: off, the wizard asks for the PIN; on, anyone with
  // the code may make or change a round's sheet — a casual event nobody
  // runs, with an Edit button on the Tee times tab.
  { key: 'set_tee_sheets', dflt: false, teeSheet: true,
    label: 'Anyone can make the tee sheets',
    hint: 'For a casual event nobody runs: make or change a round\'s tee sheet without the PIN.' },
  // Joining a tag is a different verb from forming a team: a tag board's
  // `teamPick: 'self'` cousin lets the field CREATE teams on that board's
  // sheet, while this only lets a claimed player join one of the tags the
  // organiser has already made (lib/tagBoards.ts). Both stay, deliberately.
  { key: 'assign_tag', dflt: false,
    label: 'Participants can pick their own side',
    hint: 'Let claimed players join one of your sides on the teams screen.' },
  // A league's rounds can arrive as they are played: somebody adds the
  // day's round on the Scoring tab when the group turns up. The organiser
  // can always do it with the PIN; this lets the field do it without.
  { key: 'add_rounds', dflt: false, seriesOnly: true,
    label: 'Participants can add the next round',
    hint: 'Let anyone add the league\'s next round on the Scoring tab, without the PIN.' },
  // A round may be made with its venue to be confirmed, and it cannot be
  // played until somebody chooses one — on the Scoring tab or the hub.
  { key: 'set_venues', dflt: false, seriesOnly: true,
    label: 'Participants can choose a round\'s venue',
    hint: 'Let anyone pick a venue still to be confirmed, without the PIN.' },
  // A match play card: on, anybody with the code can take a match live and
  // score every hole; off, only the players in it, and the organiser with
  // the admin PIN. The one permission on by default.
  { key: 'score_matches', dflt: true, knockoutOnly: true,
    label: 'Participants can score any match',
    hint: 'Let anyone take a match live and score it. Off, only its players can — and you, with the PIN.' },
]

/**
 * The permissions worth asking about on this event — every one, less those
 * that only mean something on a series, or on match play, when it is not
 * one, and less the two the tee times question asks. The creation toggles,
 * the admin page and its summary line all read this, so a permission is
 * never offered where it would do nothing, nor twice.
 */
export function permissionsFor(series: boolean, knockout = false): typeof EVENT_PERMISSIONS {
  return EVENT_PERMISSIONS.filter(p =>
    (series || !p.seriesOnly) && (knockout || !p.knockoutOnly) && !p.teeSheet)
}

/** The tee times question's two answers, in the order they are asked. */
export const TEE_SHEET_PERMISSIONS = EVENT_PERMISSIONS.filter(p => p.teeSheet)

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

/** "2 of 3 on" — the admin card's one-line summary, over what this event is asked. */
export function describePermissions(
  perms: EventPermissions,
  registry: readonly { key: EventPermissionKey }[] = EVENT_PERMISSIONS,
): string {
  const on = registry.filter(p => perms[p.key]).length
  if (on === 0) return 'Organiser-run — participants play, you manage.'
  if (on === 1 && registry.length > 1 && registry.some(p => p.key === 'score_matches' && perms[p.key])) {
    return 'Organiser-run — anyone can score a match.'
  }
  return `${on} of ${registry.length} participant permissions on.`
}
