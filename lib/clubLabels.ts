// Labels (D288, Ross, 22 Nov 2026) — the only copy of their rules.
//
// A label is a named colour a club makes in the Clubhouse (Events → Labels):
// who belongs, as groups of memberships, gender, an age band and a
// handicap band ("Men's": Men's Full; or Men's Senior; or Juniors under 18
// with a handicap up to 12). On a competition it decides who may enter —
// the competition keeps its own copy inside its entry rules (`LabelGate`,
// lib/clubMembership.ts, judged by `entryRefusal`) — and its colour travels
// with everything it is on: a card's left edge in a list, a soft wash at the
// top of the thing's own page.
//
// **Every event type has a default label** (Competition, Golf, Social…) so
// everything on the calendar has a colour; a club changes a default's name
// and colour in the same module. A default has no groups and gates nothing —
// only a label chosen for a competition decides who may enter.
//
// Colours are the eight team colours (lib/teamColors.ts): muted, told apart
// by lightness as well as hue, never emerald (action) or gold (winning).

import { PRESET_COLORS } from './teamColors'
import { EVENT_TYPES, type EventType } from './clubEvents'
import { labelGroupIssue, readLabelGroup, type LabelGate, type LabelGroup } from './clubMembership'

export const LABEL_COLOURS: readonly string[] = PRESET_COLORS
export const LABEL_NAME_MAX = 40
export const LABEL_GROUPS_MAX = 12

export interface ClubLabel {
  /** A stored label's id; a default not yet changed is `type:<TYPE>`. */
  id: string
  name: string
  colour: string
  groups: LabelGroup[]
  /** The event type this is the default label for, else null. */
  eventType: EventType | null
  position: number
}

/** Each type's own colour until the club changes it. */
const TYPE_COLOUR: Record<EventType, string> = {
  COMP: '#3D6FB6', // cobalt
  GOLF: '#6B7A2E', // olive
  SOCIAL: '#8A5BA8', // plum
  BUSINESS: '#4F6B7A', // slate
  SPORT: '#D9731E', // orange
  COURSE: '#C8453A', // brick
  MISC: '#C24D7C', // rose
}

/** A default label's id before it is stored. */
export function defaultLabelId(t: EventType): string {
  return `type:${t}`
}

/** The default labels, one a type, as they are before a club changes any. */
export function builtInDefaults(): ClubLabel[] {
  return EVENT_TYPES.map((t, i) => ({ id: defaultLabelId(t.code), name: t.label, colour: TYPE_COLOUR[t.code], groups: [], eventType: t.code, position: i }))
}

/** The club's labels with every type's default — its stored change, else the built-in — defaults first. */
export function withDefaults(stored: ClubLabel[]): ClubLabel[] {
  const defaults = builtInDefaults().map(d => stored.find(s => s.eventType === d.eventType) ?? d)
  const own = stored.filter(s => !s.eventType).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  return [...defaults, ...own]
}

/** A label as stored or posted, cleaned. */
export function readLabel(raw: unknown): ClubLabel {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const type = EVENT_TYPES.find(t => t.code === r.eventType)?.code ?? null
  const colour = typeof r.colour === 'string' && /^#[0-9A-Fa-f]{6}$/.test(r.colour) ? r.colour.toUpperCase() : LABEL_COLOURS[0]
  return {
    id: typeof r.id === 'string' ? r.id : '',
    name: typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ').slice(0, LABEL_NAME_MAX) : '',
    colour,
    // A default gates nothing: its groups are never kept.
    groups: type ? [] : (Array.isArray(r.groups) ? r.groups : []).slice(0, LABEL_GROUPS_MAX).map(readLabelGroup),
    eventType: type,
    position: typeof r.position === 'number' && Number.isInteger(r.position) ? r.position : 0,
  }
}

/** Why a label cannot be kept — or null. `known` the club's membership ids; `others` its other labels. */
export function labelIssue(l: ClubLabel, known: string[], others: Pick<ClubLabel, 'id' | 'name'>[]): string | null {
  if (!l.name) return 'Give the label a name.'
  if (!LABEL_COLOURS.includes(l.colour)) return 'Pick one of the colours.'
  if (others.some(o => o.id !== l.id && o.name.toLowerCase() === l.name.toLowerCase())) return 'Another label already has that name.'
  if (!l.eventType && !l.groups.length) return 'Say who the label is for — add a group.'
  for (const g of l.groups) {
    const why = labelGroupIssue(g, known)
    if (why) return why
  }
  return null
}

/** What a competition keeps of a label it carries. */
export function gateOf(l: ClubLabel): LabelGate {
  return { id: l.id, name: l.name, colour: l.colour, groups: l.groups }
}

/** The colour of something on the club's calendar: its own label's, else its type's default label's. */
export function colourFor(x: { labelId?: string | null; labelColour?: string | null; type: EventType }, labels: ClubLabel[]): string {
  if (x.labelColour) return x.labelColour
  const own = x.labelId ? labels.find(l => l.id === x.labelId) : undefined
  if (own) return own.colour
  return labels.find(l => l.eventType === x.type)?.colour ?? TYPE_COLOUR[x.type]
}

/** The labels a competition or event may carry: the club's own (never a type's default — that one it has already). */
export function pickableLabels(labels: ClubLabel[]): ClubLabel[] {
  return labels.filter(l => !l.eventType)
}
