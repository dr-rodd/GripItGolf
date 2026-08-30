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
