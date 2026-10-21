import { cache } from 'react'
import { supabase } from '@/lib/supabase'

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
