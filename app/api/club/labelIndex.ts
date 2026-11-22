import { labelNeedsIndex, type EntryRules } from '@/lib/clubMembership'

// D288: a label's handicap band needs each person's index — read only when
// the competition's label asks for one, once per request, for the rows that
// are being judged. The stores answer through `indexesOf` (the Green Dot
// account's index today, app/api/club/labelsStore.ts — the one place another
// source can stand in later).

export type IndexesOf = (clubId: string, rows: { id: string; userId: string | null }[]) => Promise<Map<string, number | null>>

export function indexCache(rules: EntryRules | null | undefined, clubId: string, indexesOf?: IndexesOf) {
  const known = new Map<string, number | null>()
  const wanted = labelNeedsIndex(rules) && !!indexesOf
  return {
    /** Reads the index of any of these rows not read yet — nothing at all unless a label band asks. */
    async load(rows: { id: string; userId?: string | null }[]): Promise<void> {
      if (!wanted) return
      const fresh = rows.filter(r => !known.has(r.id)).map(r => ({ id: r.id, userId: r.userId ?? null }))
      if (!fresh.length) return
      const got = await indexesOf!(clubId, fresh).catch(() => new Map<string, number | null>())
      for (const r of fresh) known.set(r.id, got.get(r.id) ?? null)
    },
    /** A row's index, or null — not read or not known. */
    of(id: string | undefined): number | null {
      return id ? known.get(id) ?? null : null
    },
  }
}
