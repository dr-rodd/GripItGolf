import { cache } from 'react'
import { supabase } from '@/lib/supabase'
import { teeSheetInUse } from '@/lib/eventHub'

/**
 * The trip's kind, once per request — the one copy of this lookup.
 *
 * Asked on its own rather than folded into each page's main select, because
 * those selects name their columns and a named `kind` on a database that has
 * not run migration 046 fails the *whole* query — the page dies to learn a
 * fact it could live without. This asks separately and fails soft: no
 * column, no row, no answer all come back null, and null is a trip.
 *
 * `cache` makes it one query per request however many callers ask — the
 * layout for the tab bar, a page for its own furniture — and a caller
 * should ask *in parallel* with its main query (`Promise.all`), never
 * before it: the whole point of the shape is that it adds no round trip.
 */
export const fetchTripKind = cache(async (tripCode: string): Promise<string | null> => {
  const { data } = await supabase
    .from('trips')
    .select('kind')
    .eq('trip_code', tripCode)
    .single()
  return (data as { kind?: string } | null)?.kind ?? null
})

/**
 * The event's public PIN hash, or null when it has none (lib/publicPin.ts).
 * Its own query and fail-soft for the same reason as the kind: before
 * migration 060 the column is not there, and no column is no lock.
 */
export const fetchEntryLock = cache(async (tripCode: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('trips')
    .select('public_passcode_hash')
    .eq('trip_code', tripCode)
    .maybeSingle()
  if (error) return null
  return (data as { public_passcode_hash?: string | null } | null)?.public_passcode_hash ?? null
})

/**
 * Whether the event is match play — the bar's middle tab is then the
 * Bracket. Only the setup's `format` key is asked for, so the draw plan
 * riding in the same column never crosses the wire; fail-soft like the
 * kind (before migration 047 there is no column, and no column is no).
 */
export const fetchIsKnockout = cache(async (tripCode: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('trips')
    .select('format:bracket_setup->>format')
    .eq('trip_code', tripCode)
    .maybeSingle()
  if (error) return false
  return (data as { format?: string | null } | null)?.format === 'match_play'
})

/**
 * What the bar's fourth tab could be on an event (lib/eventHub.ts
 * `eventFourthTab`): whether any round starts from a tee sheet, and whether
 * the event records stats. One request, the rounds embedded — their start
 * formats and nothing else — and fail-soft like the rest: a failed read is
 * neither, and the bar is four.
 */
export const fetchTabExtras = cache(async (tripCode: string): Promise<{ teeTimes: boolean; stats: boolean }> => {
  const { data, error } = await supabase
    .from('trips')
    .select('track_stats, rounds(start_format)')
    .eq('trip_code', tripCode)
    .maybeSingle()
  if (error || !data) return { teeTimes: false, stats: false }
  const row = data as { track_stats?: boolean | null; rounds?: { start_format: string | null }[] | null }
  return {
    teeTimes: teeSheetInUse((row.rounds ?? []).map(r => r.start_format)),
    stats: row.track_stats === true,
  }
})
