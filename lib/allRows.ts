/**
 * Every row a query matches — past the 1,000 a Supabase select stops at.
 *
 * PostgREST hands back at most the project's "Max rows" (Project Settings →
 * API; 1,000 unless somebody changed it) and says nothing about the rest:
 * no error, no flag, the list simply comes back short. A leaderboard read
 * that way loses whichever scores happened to sort last — often most of a
 * round — on a trip of fourteen playing four rounds, and a run board loses
 * its oldest runs, so a challenge's totals stall while people keep running.
 *
 * The cost is shaped for the case that is every event so far. Under a page
 * it is exactly the one request it was before. Over, the first answer
 * carries the total (`count: 'exact'`, which the query must ask for), and
 * the remaining pages go out together rather than one after another — five
 * thousand rows costs one extra wait, not four.
 *
 * Three rules, each there because the cheap version gets it wrong:
 *
 * - **A short read is a failed read.** Any page failing fails the whole
 *   read, the way a Strava list cut short removes nothing. A board saying it
 *   could not load is honest; a board missing a round is not.
 * - **The page size is whatever the server actually sent**, never the 1,000
 *   asked for. A project whose Max rows is set lower still gets every row,
 *   rather than the first 500 of every 1,000.
 * - **The order must be total.** The query's `.order()` must end on columns
 *   that are unique together, or Postgres may hand one row to two pages and
 *   another to none. The rows are keyed on those same columns, so a write
 *   landing between pages leaves a duplicate that is dropped here — and if
 *   the count moved between pages the read is taken again, once.
 *
 * Pure: no client of its own, so the server pages and the browser's in-play
 * board share it. `lib/scoreReads.ts` holds the golf tables' orders and keys.
 */

/** What one page brings back — the shape every supabase-js select resolves to. */
type Page = {
  data: unknown[] | null
  error: { message: string } | null
  count?: number | null
}

/** A filtered, totally ordered query that still takes its `.range()`. */
export type RangeableQuery = {
  range(from: number, to: number): PromiseLike<Page>
}

export type AllRows<T> =
  | { data: T[]; error: null }
  | { data: null; error: { message: string } }

/** What is asked for per page. The server may send fewer; see the note above. */
export const PAGE_ROWS = 1000

/**
 * Pages in flight at once. Five thousand rows is one batch; only a read far
 * bigger than anything here queues, and then politely.
 */
export const PARALLEL_PAGES = 6

/**
 * Past this a read is refused rather than taken. Nothing the site holds per
 * event comes near it, so reaching it means a filter went missing — and
 * fetching an unfiltered table into a page is the failure to stop, not to
 * accommodate.
 */
export const MAX_ROWS = 100_000

const fail = <T>(error: { message: string }): AllRows<T> => ({ data: null, error })

/**
 * Read every row `query()` matches. `query` builds the query afresh each
 * call — a supabase-js builder is single-use, and each page is its own
 * request — with `count: 'exact'` in its select and an order ending on
 * unique columns. `key` names a row by those columns.
 */
export async function readAllRows<T>(
  query: () => RangeableQuery,
  key: (row: T) => string,
): Promise<AllRows<T>> {
  const first = await readOnce(query, key)
  if (!first.moved) return first.result
  // The table changed while it was being read. Once more settles it in
  // practice; a table changing under every read is a busy one, and the
  // de-duplicated second answer is as good as any single snapshot.
  return (await readOnce(query, key)).result
}

async function readOnce<T>(
  query: () => RangeableQuery,
  key: (row: T) => string,
): Promise<{ result: AllRows<T>; moved: boolean }> {
  const head = await query().range(0, PAGE_ROWS - 1)
  if (head.error) return { result: fail(head.error), moved: false }

  const rows = (head.data ?? []) as T[]
  const total = head.count
  if (typeof total !== 'number') {
    // A programming error, not a database one — said loudly, because the
    // fallback (assume a short page is the end) is the bug this exists for.
    return { result: fail({ message: "readAllRows needs count: 'exact' in the select" }), moved: false }
  }
  if (rows.length >= total) return { result: { data: rows, error: null }, moved: false }
  if (total > MAX_ROWS) {
    return { result: fail({ message: `refused to read ${total} rows (the ceiling is ${MAX_ROWS})` }), moved: false }
  }

  const step = rows.length
  if (step === 0) return { result: fail({ message: 'the first page came back empty' }), moved: false }

  const starts: number[] = []
  for (let from = step; from < total; from += step) starts.push(from)

  const pages: Page[] = []
  for (let i = 0; i < starts.length; i += PARALLEL_PAGES) {
    pages.push(...await Promise.all(
      starts.slice(i, i + PARALLEL_PAGES).map(from => query().range(from, from + step - 1)),
    ))
  }

  const failed = pages.find(p => p.error)
  if (failed?.error) return { result: fail(failed.error), moved: false }

  const seen = new Set<string>()
  const all: T[] = []
  for (const row of [rows, ...pages.map(p => (p.data ?? []) as T[])].flat()) {
    const k = key(row)
    if (seen.has(k)) continue
    seen.add(k)
    all.push(row)
  }

  const moved = all.length !== total || pages.some(p => p.count !== total)
  return { result: { data: all, error: null }, moved }
}
