// A golfer's career, read on the server (Ross, 26 Nov 2026) — the stats page
// on Home and in a club (app/components/stats/CareerStats.tsx) asks once,
// after it paints. Every round the account's linked players have a signed
// card in, every year, with its strokes gained (migration 107, fail-soft),
// the event's name and code, and whether it was a club competition; and, on
// a tap, one of those rounds' scorecards — the feed's one read of a card
// (`readCardDetail`), only ever the account's own.
//
// The logic is `runCareer` on an injected store; `route.ts` is the plumbing.

import type { AuthUser } from '@/lib/account'
import { isAccount } from '@/lib/account'
import type { CareerRow } from '@/lib/careerStats'
import type { CardDetail } from '../feed/feed'

/** The most rounds a career page reads — years of golf for anybody. */
export const CAREER_ROWS = 1000

export interface CareerStore {
  userFromToken(token: string): Promise<AuthUser | null>
  /** The account's players (`account_players`). */
  playersOf(userId: string): Promise<string[]>
  rows(playerIds: string[]): Promise<{ rows: CareerRow[]; courses: Record<string, string> }>
  index(userId: string): Promise<number | null>
  card(roundId: string, playerId: string): Promise<CardDetail | null>
}

export type CareerOutcome = { status: number; body: Record<string, unknown> }

const fail = (status: number, error: string): CareerOutcome => ({ status, body: { ok: false, error } })

export async function runCareer(input: { token: string | null; action: unknown; roundId?: unknown }, store: CareerStore): Promise<CareerOutcome> {
  if (!input.token) return fail(401, 'Sign in to your Green Dot account first.')
  const user = await store.userFromToken(input.token)
  if (!isAccount(user)) return fail(403, 'This phone is not signed in.')
  const players = await store.playersOf(user.id)

  if (input.action === 'career') {
    const [read, index] = await Promise.all([
      players.length ? store.rows(players) : Promise.resolve({ rows: [] as CareerRow[], courses: {} }),
      store.index(user.id).catch(() => null),
    ])
    return { status: 200, body: { ok: true, rows: read.rows, courses: read.courses, index } }
  }

  if (input.action === 'card') {
    if (typeof input.roundId !== 'string' || !input.roundId) return fail(400, 'Which round?')
    // Only a round the account itself has a summary in, read for its own player.
    const { rows } = players.length ? await store.rows(players) : { rows: [] as CareerRow[] }
    const mine = rows.find(r => r.round_id === input.roundId)
    if (!mine?.player_id) return fail(404, 'That round isn’t one of yours.')
    const detail = await store.card(mine.round_id, mine.player_id)
    return { status: 200, body: { ok: true, detail } }
  }

  return fail(400, 'Unknown action.')
}

type Db = ReturnType<typeof import('@/lib/supabase-admin').createAdminClient>

/** Missing table or column: a migration not pasted yet. */
const notThere = (e: { code?: string } | null) => !!e && ['42P01', '42703', 'PGRST205', 'PGRST204'].includes(e.code ?? '')

const BASE = 'round_id, player_id, trip_id, played_on, holes, gross, par, points, origin, club_id, course_id, putts, putts_holes, fairways_hit, fairways_tried, gir, gir_holes, eagles, birdies, pars, bogeys, doubles'

export async function careerStore(db: Db): Promise<CareerStore> {
  const { asUser } = await import('../account/store')
  const { handicapStore } = await import('../handicaps/store')
  const { readCardDetail } = await import('../feed/cardDetail')
  return {
    async userFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      return error ? null : asUser(data.user)
    },
    async playersOf(userId) {
      const { data, error } = await db.from('account_players').select('player_id').eq('user_id', userId)
      if (error) return []
      return ((data ?? []) as { player_id: string }[]).map(r => r.player_id)
    },
    async rows(playerIds) {
      const ask = (cols: string) => db.from('card_summaries').select(cols)
        .in('player_id', playerIds).order('played_on', { ascending: false }).limit(CAREER_ROWS)
      // 107 adds `sg`; before it the rows read without (a dash on screen).
      let res = await ask(`${BASE}, sg`)
      if (res.error && notThere(res.error)) res = await ask(BASE)
      if (res.error) return { rows: [], courses: {} }
      const rows0 = (res.data ?? []) as unknown as CareerRow[]
      const courseIds = [...new Set(rows0.map(r => r.course_id).filter(Boolean))] as string[]
      const tripIds = [...new Set(rows0.map(r => r.trip_id))]
      const tripsAsk = (cols: string) => db.from('trips').select(cols).in('id', tripIds)
      const [courses, trips0] = await Promise.all([
        courseIds.length ? db.from('courses').select('id, name').in('id', courseIds) : Promise.resolve({ data: [] }),
        tripIds.length ? tripsAsk('id, name, trip_code, competition') : Promise.resolve({ data: [], error: null }),
      ])
      // `trips.competition` is 089's: before it nothing is a club competition.
      const trips = trips0.error && notThere(trips0.error) ? await tripsAsk('id, name, trip_code') : trips0
      const tripOf = new Map(((trips.data ?? []) as unknown as { id: string; name: string; trip_code: string; competition?: string | null }[]).map(t => [t.id, t]))
      const rows = rows0.map(r => {
        const t = tripOf.get(r.trip_id)
        return { ...r, event_name: t?.name ?? null, event_code: t?.trip_code ?? null, competition: t?.competition === 'club' }
      })
      return { rows, courses: Object.fromEntries(((courses.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])) }
    },
    index: userId => handicapStore(db).accountIndex(userId),
    card: (roundId, playerId) => readCardDetail(db, roundId, playerId),
  }
}
