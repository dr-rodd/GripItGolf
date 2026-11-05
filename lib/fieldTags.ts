// Tags made with the field, at creation — the only copy of their rules
// (Ross, 5 Nov 2026: "Enable tags" in the field step, off to start with).
//
// A tag is the event's umbrella grouping — a club, a category, a department
// — that lasts the whole event (lib/tagBoards.ts). Made here, a tag is named
// and coloured, players are given one as they are typed in, and the event is
// created with them: a team on the main sheet each (`TAG_SET`), its players
// its members, so everything that already reads tags — the organiser's tags
// portal, the dots beside names, a tags leaderboard — reads these with
// nothing changed. Pure; app/dashboard/create/fieldTagsWrite.ts writes.

import { PRESET_COLORS } from './teamColors'
import { isMatchTally, matchTallyBoard, type Leaderboard } from './leaderboards'

export type FieldTag = { key: string; name: string; colour: string }

/** The form's tags: switched on or not, and the tags themselves. */
export type FieldTags = { on: boolean; tags: FieldTag[] }

export const NO_FIELD_TAGS: FieldTags = { on: false, tags: [] }

/** What tags are for, said under the switch — Ross's words. */
export const TAGS_INTRO =
  'Group players together with a common label, category or department. Useful for teams leaderboards ' +
  'where the players aren’t playing together. Create a secondary leaderboard to rank the field ' +
  'performance by their Tags.'

/** The most tags an event is made with here — more come in the organiser area. */
export const MAX_FIELD_TAGS = 12

/** A new, unnamed tag in the next colour not yet taken. */
export function newTag(tags: readonly FieldTag[]): FieldTag {
  const used = new Set(tags.map(t => t.colour))
  const colour = PRESET_COLORS.find(c => !used.has(c)) ?? PRESET_COLORS[tags.length % PRESET_COLORS.length]
  let n = tags.length + 1
  while (tags.some(t => t.key === `tag-${n}`)) n++
  return { key: `tag-${n}`, name: '', colour }
}

/** Tags switched on: two to start with, since a tag is one of several. */
export function switchedOn(t: FieldTags): FieldTags {
  if (t.tags.length > 0) return { ...t, on: true }
  const first = newTag([])
  return { on: true, tags: [first, newTag([first])] }
}

/** The tags the event is made with — none while switched off. */
export function activeTags(t: FieldTags): FieldTag[] {
  return t.on ? t.tags : []
}

const norm = (s: string) => s.trim().toLowerCase()

/** Why the tags cannot be made as they stand, or null. */
export function fieldTagsIssue(t: FieldTags): string | null {
  if (!t.on) return null
  if (t.tags.length === 0) return 'Add a tag, or switch tags off.'
  if (t.tags.some(x => !x.name.trim())) return 'Give every tag a name.'
  const seen = new Set<string>()
  for (const x of t.tags) {
    if (seen.has(norm(x.name))) return `Two tags are called ${x.name.trim()}.`
    seen.add(norm(x.name))
  }
  return null
}

/** A player's tag, where it is one of the active tags — else none. */
export function tagOfPlayer(t: FieldTags, tag: string | undefined): FieldTag | null {
  return activeTags(t).find(x => x.key === tag) ?? null
}

/** How many players carry each tag, for the line under it. */
export function tagCounts(t: FieldTags, players: readonly { name: string; tag?: string }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of activeTags(t)) out[x.key] = 0
  for (const p of players) if (p.name.trim() && p.tag && p.tag in out) out[p.tag]++
  return out
}

/**
 * What creation writes: a team on the main sheet per tag, and a membership
 * for each named player carrying one — by the ids the form gives the
 * players and the tags.
 */
export function tagWrites(
  t: FieldTags,
  players: readonly { name: string; tag?: string }[],
  playerId: (name: string) => string | undefined,
  tagId: (key: string) => string,
): { teams: { id: string; name: string; color: string }[]; members: { team_id: string; player_id: string }[] } {
  const tags = activeTags(t)
  if (tags.length === 0) return { teams: [], members: [] }
  const teams = tags.map(x => ({ id: tagId(x.key), name: x.name.trim(), color: x.colour }))
  const members: { team_id: string; player_id: string }[] = []
  for (const p of players) {
    const tag = tagOfPlayer(t, p.tag)
    const id = p.name.trim() ? playerId(p.name) : undefined
    if (tag && id) members.push({ team_id: tagId(tag.key), player_id: id })
  }
  return { teams, members }
}

/**
 * The boards with the tags tally added or taken away as tags are switched
 * on or off in the field step — on, a match play event gets its secondary
 * leaderboard, wins and losses by tag (`matchTallyBoard`); off, it goes.
 * Only the switch moves it, so a tally the organiser took off stays off.
 */
export function withTagTally(boards: readonly Leaderboard[], on: boolean): Leaderboard[] {
  const has = boards.some(isMatchTally)
  if (on && !has) return [...boards, matchTallyBoard()]
  if (!on && has) return boards.filter(b => !isMatchTally(b))
  return [...boards]
}
