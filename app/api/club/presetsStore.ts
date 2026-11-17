import type { createAdminClient } from '@/lib/supabase-admin'
import { readEntryRules } from '@/lib/clubMembership'
import { readTeePlan, type Preset } from '@/lib/clubPresets'
import { NotesNotReady, missing095 } from './notesStore'

// A club's event presets (`club_presets`, migration 095), read fail-soft:
// before it a club has none, and saving one says "not set up yet".

type Db = ReturnType<typeof createAdminClient>
type PresetRow = {
  id: string; code: string; name: string; used_for: string | null; scoring: 'stableford' | 'strokes'; allowance: number
  entry_rules: unknown; tee_plan: unknown; is_default: boolean
}
const COLS = 'id, code, name, used_for, scoring, allowance, entry_rules, tee_plan, is_default'
const asPreset = (r: PresetRow): Preset => ({
  id: r.id, code: r.code, name: r.name, usedFor: r.used_for, scoring: r.scoring === 'strokes' ? 'strokes' : 'stableford',
  allowance: r.allowance, entry: readEntryRules(r.entry_rules), plan: readTeePlan(r.tee_plan), isDefault: r.is_default,
})

/** The club's presets in their order — null before 095. */
export async function readPresets(db: Db, clubId: string): Promise<Preset[] | null> {
  const { data, error } = await db.from('club_presets').select(COLS).eq('club_id', clubId).order('position').order('name')
  if (error) { if (missing095(error)) return null; throw error }
  return ((data ?? []) as PresetRow[]).map(asPreset)
}

/** A preset kept; the default moved to it when it is the default. 'clash' when its code or name is another's. */
export async function savePreset(db: Db, clubId: string, p: Omit<Preset, 'id'> & { id: string | null }, position: number): Promise<string | 'clash'> {
  if (p.isDefault) {
    const off = await db.from('club_presets').update({ is_default: false }).eq('club_id', clubId).eq('is_default', true)
    if (off.error) { if (missing095(off.error)) throw new NotesNotReady(); throw off.error }
  }
  const row = {
    club_id: clubId, code: p.code, name: p.name, used_for: p.usedFor, scoring: p.scoring, allowance: p.allowance,
    entry_rules: p.entry, tee_plan: p.plan, is_default: p.isDefault, position, updated_at: new Date().toISOString(),
  }
  const { data, error } = p.id
    ? await db.from('club_presets').update(row).eq('id', p.id).eq('club_id', clubId).select('id').maybeSingle()
    : await db.from('club_presets').insert(row).select('id').single()
  if (error?.code === '23505') return 'clash'
  if (error) { if (missing095(error)) throw new NotesNotReady(); throw error }
  return (data as { id: string } | null)?.id ?? 'clash'
}

export async function deletePreset(db: Db, clubId: string, id: string): Promise<void> {
  const { error } = await db.from('club_presets').delete().eq('id', id).eq('club_id', clubId)
  if (error) { if (missing095(error)) throw new NotesNotReady(); throw error }
}
