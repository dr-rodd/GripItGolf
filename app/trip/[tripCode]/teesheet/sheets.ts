import { supabase } from '@/lib/supabase'

/**
 * Each round's tee-sheet settings as stored — the one read of them, for
 * the home screen, the Tee times tab, the organiser area and the wizard.
 *
 * Two queries side by side, each fail-soft on its own: the wizard's rules
 * (`rounds.tee_sheet`, migration 064) and the settings a sheet made before
 * the wizard still reads (`tee_interval_mins`, `tee_group_size`, migration
 * 050). Named together, a database without 064 would lose the older two
 * as well. What a round's sheet then *is* — vacant, active or legacy — is
 * lib/teeSheet.ts `roundSheet`'s to decide.
 */
export type StoredSheet = { rules: unknown; intervalMins: unknown; groupSize: unknown }

export async function readSheetSettings(tripId: string): Promise<Map<string, StoredSheet>> {
  const [rulesRes, oldRes] = await Promise.all([
    supabase.from('rounds').select('id, tee_sheet').eq('trip_id', tripId),
    supabase.from('rounds').select('id, tee_interval_mins, tee_group_size').eq('trip_id', tripId),
  ])
  const out = new Map<string, StoredSheet>()
  const at = (id: string) => {
    let s = out.get(id)
    if (!s) { s = { rules: null, intervalMins: null, groupSize: null }; out.set(id, s) }
    return s
  }
  for (const r of (rulesRes.data ?? []) as { id: string; tee_sheet?: unknown }[]) {
    at(r.id).rules = r.tee_sheet ?? null
  }
  for (const r of (oldRes.data ?? []) as { id: string; tee_interval_mins?: unknown; tee_group_size?: unknown }[]) {
    const s = at(r.id)
    s.intervalMins = r.tee_interval_mins ?? null
    s.groupSize = r.tee_group_size ?? null
  }
  return out
}
