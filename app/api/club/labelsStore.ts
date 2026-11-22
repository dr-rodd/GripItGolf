import type { createAdminClient } from '@/lib/supabase-admin'
import { readLabel, gateOf, type ClubLabel } from '@/lib/clubLabels'
import { readEntryRules } from '@/lib/clubMembership'
import { listIndexes } from '../handicaps/handicaps'
import { handicapStore } from '../handicaps/store'

// A club's labels (D288) on the service role — migration 101, read
// fail-soft: before it there are none, and every event wears its type's
// built-in colour (lib/clubLabels.ts `withDefaults`).
//
// A competition keeps its own copy of the label it carries inside its entry
// rules (`trip_private.entry_rules.label`), so the five places that judge
// who may enter read it with the rules they already read. **This file is
// the one writer that keeps those copies in step**: a label changed is
// written into every competition carrying it, a label deleted taken out.

type Db = ReturnType<typeof createAdminClient>

/** A table or column 101 makes, not there yet. */
export function missing101(e: { code?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || e.code === 'PGRST204')
}

/** Labels are not set up yet (before 101). */
export class LabelsNotReady extends Error {
  constructor() { super('club_labels is missing (migration 101)'); this.name = 'LabelsNotReady' }
}

type Row = { id: string; name: string; colour: string; groups: unknown; event_type: string | null; position: number }
const asLabel = (r: Row): ClubLabel => ({ ...readLabel({ id: r.id, name: r.name, colour: r.colour, groups: r.groups, eventType: r.event_type, position: r.position }), id: r.id })

/** The club's stored labels — null before 101. */
export async function readLabels(db: Db, clubId: string): Promise<ClubLabel[] | null> {
  const { data, error } = await db.from('club_labels').select('id, name, colour, groups, event_type, position').eq('club_id', clubId).order('position').order('name')
  if (error) { if (missing101(error)) return null; throw error }
  return ((data ?? []) as Row[]).map(asLabel)
}

/**
 * A label kept — a new one, a change, or a type's default changed for the
 * first time (stored by its type, one a type). The id, or 'clash' when its
 * name is another's. Its competitions follow.
 */
export async function saveLabel(db: Db, clubId: string, l: ClubLabel): Promise<string | 'clash'> {
  const row = { club_id: clubId, name: l.name, colour: l.colour, groups: l.groups, event_type: l.eventType, position: l.position, updated_at: new Date().toISOString() }
  const stored = l.id && !l.id.startsWith('type:')
  const res = stored
    ? await db.from('club_labels').update(row).eq('id', l.id).eq('club_id', clubId).select('id').maybeSingle()
    : l.eventType
      ? await db.from('club_labels').upsert(row, { onConflict: 'club_id,event_type' }).select('id').single()
      : await db.from('club_labels').insert(row).select('id').single()
  if (res.error) {
    if (res.error.code === '23505') return 'clash'
    if (missing101(res.error)) throw new LabelsNotReady()
    throw res.error
  }
  if (!res.data) throw new Error('That label isn’t the club’s.')
  const id = (res.data as { id: string }).id
  if (!l.eventType) await syncCompetitions(db, clubId, id, { ...l, id })
  return id
}

/** A label taken away: its competitions let in as their own rules say; its club events wear their type's colour. */
export async function deleteLabel(db: Db, clubId: string, id: string): Promise<void> {
  await syncCompetitions(db, clubId, id, null)
  const { error } = await db.from('club_labels').delete().eq('id', id).eq('club_id', clubId)
  if (error) { if (missing101(error)) throw new LabelsNotReady(); throw error }
}

/** Every competition of the club carrying this label, its copy rewritten (or taken out). */
async function syncCompetitions(db: Db, clubId: string, id: string, l: ClubLabel | null): Promise<void> {
  const { data, error } = await db.from('trip_private').select('trip_id, entry_rules').eq('club_id', clubId).filter('entry_rules->label->>id', 'eq', id)
  if (error) return // before 094 there are no rules to carry a label
  for (const p of (data ?? []) as { trip_id: string; entry_rules: unknown }[]) {
    const rules = readEntryRules(p.entry_rules) ?? {}
    const next = l ? { ...rules, label: gateOf(l) } : (({ label: _gone, ...rest }) => rest)(rules)
    await db.from('trip_private').update({ entry_rules: Object.keys(next).length ? next : null }).eq('trip_id', p.trip_id)
  }
}

/**
 * Entry rules about to be written, their label made the club's own as it
 * stands now (D288) — never a copy a form carried in. A label that is not
 * the club's, or is gone, is dropped; before 101 there are no labels to keep.
 */
export async function freshEntry<T extends { label?: { id: string } } | null | undefined>(db: Db, clubId: string, entry: T): Promise<T> {
  if (!entry?.label) return entry
  const { data, error } = await db.from('club_labels').select('id, name, colour, groups, event_type, position').eq('id', entry.label.id).eq('club_id', clubId).maybeSingle()
  const row = error ? null : (data as Row | null)
  const { label: _old, ...rest } = entry as NonNullable<T> & { label: unknown }
  if (!row || row.event_type) return (Object.keys(rest).length ? rest : null) as T
  return { ...rest, label: gateOf(asLabel(row)) } as unknown as T
}

/**
 * The handicap index of each of these list rows, by row id (D288) — the
 * Green Dot account's for a linked row, the row's own otherwise
 * (lib/handicapIndex.ts). **The one place a label's handicap band reads an
 * index from**: a source like Golf Ireland's (docs/golf-ireland.md) stands in
 * here, and nothing that judges entry changes.
 */
export async function indexesOf(db: Db, clubId: string, rows: { id: string; userId: string | null }[]): Promise<Map<string, number | null>> {
  if (!rows.length) return new Map()
  return listIndexes(handicapStore(db), clubId, rows).catch(() => new Map(rows.map(r => [r.id, null])))
}
