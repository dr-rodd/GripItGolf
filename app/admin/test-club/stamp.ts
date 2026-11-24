// Dating the test club's feed items to the moment they happened (D313, and
// Streams v2's last activity — D329). An item made today for a round played
// last week is restamped to that round; with migration 104 its last activity
// (`bumped_at`) follows, and a card's last activity is never earlier than the
// latest comment on it. Before 104 only `created_at` is written. Server only.

import type { createAdminClient } from '@/lib/supabase-admin'

type Db = ReturnType<typeof createAdminClient>
type Filter = (q: ReturnType<ReturnType<Db['from']>['update']>) => ReturnType<ReturnType<Db['from']>['update']>

/** Never a moment still to come. */
export function notAfterNow(at: Date | string): string {
  const t = typeof at === 'string' ? Date.parse(at) : at.getTime()
  return new Date(Math.min(t, Date.now())).toISOString()
}

/** Restamp the items a filter picks: made, and last active, at `at`. */
export async function stampItems(db: Db, at: string, pick: Filter): Promise<void> {
  const both = await pick(db.from('feed_items').update({ created_at: at, bumped_at: at }))
  if (both.error) await pick(db.from('feed_items').update({ created_at: at }))
}

/** An item's last activity lifted to its latest comment, where that is later (D329) — nothing before 104. */
export async function rebump(db: Db, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  const [{ data: items, error }, { data: kids }] = await Promise.all([
    db.from('feed_items').select('id, created_at, bumped_at').in('id', itemIds),
    db.from('feed_items').select('parent_id, created_at').eq('kind', 'comment').in('parent_id', itemIds).is('removed_at', null),
  ])
  if (error) return
  const latest = new Map<string, string>()
  for (const k of (kids ?? []) as { parent_id: string; created_at: string }[]) {
    if ((latest.get(k.parent_id) ?? '') < k.created_at) latest.set(k.parent_id, k.created_at)
  }
  for (const it of (items ?? []) as { id: string; created_at: string; bumped_at: string | null }[]) {
    const want = [it.created_at, latest.get(it.id) ?? ''].sort().pop() as string
    if (it.bumped_at !== want) await db.from('feed_items').update({ bumped_at: want }).eq('id', it.id)
  }
}
