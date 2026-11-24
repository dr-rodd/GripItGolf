// The feed's writers (D302): every item is written here, on the service
// role, from what the database already says — never from what a phone
// claims (D305). Each is idempotent (`feed_items.key`) and fail-soft: a feed
// item is never in the way of a card being signed, a result recorded or a
// handicap changed, and before migration 102 every one does nothing.
//
//   * a signed card — outside a club competition on its commit (after its
//     card summary, `writeRoundSummaries`'s `afterWrite`), inside one only
//     once its marker co-signs (`writeSignedCard`, from /api/card/sign);
//   * its highlights — eagle or better, a hole in one, a personal best;
//   * a leaderboard move in a club competition — a signed card putting its
//     player into the top three;
//   * a match result — a knockout's, from the phone that recorded it
//     (`writeMatchResult`, /api/feed/match), read back from the bracket;
//   * a handicap cut (`writeCut`, from the one index writer) and a win
//     (`writeWins`, at Certify; a knockout's final in `writeMatchResult`).
//
// Nothing is written for a player without an account, or a junior (D304).

import type { createAdminClient } from '@/lib/supabase-admin'
import {
  MOVE_TOP, cardFacts, cardHighlights, cutLine, matchLine, moveLine, wonLine,
  type CardHoleFacts, type Highlight,
} from '@/lib/feed'
import type { HoleStat } from '@/lib/holeStats'
import { feedReady, juniorProfile, juniorsByMembership, namesOf } from './store'

type Db = ReturnType<typeof createAdminClient>

const quiet = (what: string) => (e: unknown) => { console.error(`feed ${what} failed:`, e) }

// ─── Who a player is ────────────────────────────────────────────

/**
 * Each player's Green Dot account: linked to the player (D134), or the
 * account on the club's list row the player was made from (D163).
 */
export async function accountsOfPlayers(db: Db, playerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (playerIds.length === 0) return out
  const [linked, made] = await Promise.all([
    db.from('account_players').select('player_id, user_id').in('player_id', playerIds),
    db.from('players').select('id, club_member_id').in('id', playerIds).not('club_member_id', 'is', null),
  ])
  for (const r of (linked.data ?? []) as { player_id: string; user_id: string }[]) out.set(r.player_id, r.user_id)
  const rowIds = ((made.data ?? []) as { id: string; club_member_id: string }[]).filter(p => !out.has(p.id))
  if (rowIds.length) {
    const rows = await db.from('club_members').select('id, user_id').in('id', rowIds.map(p => p.club_member_id)).is('removed_at', null)
    const userOf = new Map(((rows.data ?? []) as { id: string; user_id: string | null }[]).map(r => [r.id, r.user_id]))
    for (const p of rowIds) { const u = userOf.get(p.club_member_id); if (u) out.set(p.id, u) }
  }
  return out
}

/** Of these accounts, the juniors (D304): a Junior membership, or a D108 profile. */
async function juniorsOf(db: Db, userIds: string[]): Promise<Set<string>> {
  const byMembership = await juniorsByMembership(db, userIds)
  const rest = userIds.filter(u => !byMembership.has(u))
  const profiles = await Promise.all(rest.map(async u => [u, await juniorProfile(db, u)] as const))
  return new Set([...byMembership, ...profiles.filter(([, j]) => j).map(([u]) => u)])
}

/** The club an event's items belong to: a verified club it is under and not unlinked from (D285). */
async function clubOfTrip(db: Db, tripId: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db.from('trip_private').select('club_id, club_unlinked_at, clubs(name, verified_at)').eq('trip_id', tripId).maybeSingle()
  if (error || !data) return null
  const p = data as unknown as { club_id: string | null; club_unlinked_at?: string | null; clubs: { name: string; verified_at: string | null } | { name: string; verified_at: string | null }[] | null }
  const c = Array.isArray(p.clubs) ? p.clubs[0] : p.clubs
  return p.club_id && !p.club_unlinked_at && c?.verified_at ? { id: p.club_id, name: c.name } : null
}

async function tripOf(db: Db, tripId: string): Promise<{ code: string; name: string; competition: string | null } | null> {
  const { data } = await db.from('trips').select('trip_code, name, competition').eq('id', tripId).maybeSingle()
  const t = data as { trip_code: string; name: string; competition: string | null } | null
  return t ? { code: t.trip_code, name: t.name, competition: t.competition } : null
}

async function roundFacts(db: Db, roundId: string): Promise<{ tripId: string; date: string | null; courseId: string | null; course: string | null } | null> {
  const { data } = await db.from('rounds').select('trip_id, scheduled_date, course_id, courses(name)').eq('id', roundId).maybeSingle()
  const r = data as unknown as { trip_id: string; scheduled_date: string | null; course_id: string | null; courses: { name: string } | { name: string }[] | null } | null
  if (!r) return null
  const c = Array.isArray(r.courses) ? r.courses[0] : r.courses
  return { tripId: r.trip_id, date: r.scheduled_date, courseId: r.course_id, course: c?.name ?? null }
}

/** Earlier complete 18-hole grosses at this course on any of the account's players — a personal best's bar. */
async function earlierGrosses(db: Db, userId: string, courseId: string | null, roundId: string, date: string | null): Promise<number[]> {
  if (!courseId) return []
  const [linked, rows] = await Promise.all([
    db.from('account_players').select('player_id').eq('user_id', userId),
    db.from('club_members').select('id').eq('user_id', userId),
  ])
  const ids = ((linked.data ?? []) as { player_id: string }[]).map(r => r.player_id)
  const rowIds = ((rows.data ?? []) as { id: string }[]).map(r => r.id)
  if (rowIds.length) {
    const made = await db.from('players').select('id').in('club_member_id', rowIds)
    ids.push(...((made.data ?? []) as { id: string }[]).map(p => p.id))
  }
  if (ids.length === 0) return []
  let q = db.from('card_summaries').select('gross').in('player_id', [...new Set(ids)]).eq('course_id', courseId)
    .eq('holes', 18).not('gross', 'is', null).neq('round_id', roundId)
  if (date) q = q.lte('played_on', date)
  const { data, error } = await q.limit(500)
  if (error) return []
  return ((data ?? []) as { gross: number }[]).map(r => r.gross)
}

// ─── Writing ────────────────────────────────────────────────────

type ItemWrite = {
  key: string; kind: string; author_id: string | null; parent_id?: string | null
  trip_id: string | null; round_id?: string | null; player_id?: string | null; club_id: string | null
  data: Record<string, unknown>; held?: boolean
}

/** Upserted on its key; a status or audience already on the row is never touched. Answers the row's id. */
async function put(db: Db, row: ItemWrite): Promise<string | null> {
  const { data, error } = await db.from('feed_items').upsert({ held: false, ...row }, { onConflict: 'key' }).select('id').maybeSingle()
  if (error) throw error
  return (data as { id: string } | null)?.id ?? null
}

async function dropKeys(db: Db, keys: string[]) {
  if (keys.length === 0) return
  const { error } = await db.from('feed_items').delete().in('key', keys)
  if (error) throw error
}

async function writeHighlights(db: Db, cardId: string, base: Omit<ItemWrite, 'key' | 'kind' | 'data'>, keyBase: string, list: Highlight[]) {
  const keep = list.map(h => `${keyBase}:${h.type}`)
  for (const h of list) await put(db, { ...base, parent_id: cardId, key: `${keyBase}:${h.type}`, kind: 'highlight', data: { type: h.type, line: h.line } })
  // A highlight the card no longer earns (a corrected score) goes.
  let q = db.from('feed_items').delete().eq('parent_id', cardId).eq('kind', 'highlight')
  if (keep.length) q = q.not('key', 'in', `(${keep.map(k => `"${k}"`).join(',')})`)
  const { error } = await q
  if (error) throw error
}

export const cardKey = (roundId: string, playerId: string) => `card:${roundId}:${playerId}`

/** One signed card into the feed, with its highlights. */
async function writeCard(db: Db, o: {
  roundId: string; playerId: string; authorId: string; name: string; holes: CardHoleFacts[]
  round: NonNullable<Awaited<ReturnType<typeof roundFacts>>>; trip: { code: string; name: string }
  club: { id: string; name: string } | null; marker?: string | null; place?: number | null
}): Promise<void> {
  const f = cardFacts(o.holes)
  if (f.holes === 0) return
  const key = cardKey(o.roundId, o.playerId)
  const base = { author_id: o.authorId, trip_id: o.round.tripId, round_id: o.roundId, player_id: o.playerId, club_id: o.club?.id ?? null }
  const id = await put(db, {
    ...base, key, kind: 'card',
    data: {
      name: o.name, event: o.trip.name, code: o.trip.code, course: o.round.course, club: o.club?.name ?? null,
      date: o.round.date, gross: f.gross, points: f.points, holes: f.holes,
      ...(o.marker ? { marker: o.marker } : {}), ...(o.place ? { place: o.place } : {}),
    },
  })
  if (!id) return
  const earlier = await earlierGrosses(db, o.authorId, o.round.courseId, o.roundId, o.round.date)
  await writeHighlights(db, id, base, `hl:${o.roundId}:${o.playerId}`, cardHighlights(f, earlier, o.round.course))
}

/**
 * A round's signed cards outside a club competition (D302): written after
 * the round's card summaries, from the same holes — every player with an
 * account and a finished card, each once; a card no longer signed (a void)
 * taken out. A club competition's are `writeSignedCard`'s alone.
 */
export async function syncRoundCards(db: Db, roundId: string, stats: readonly HoleStat[]): Promise<void> {
  if (!(await feedReady(db))) return
  const round = await roundFacts(db, roundId)
  if (!round) return
  const trip = await tripOf(db, round.tripId)
  if (!trip || trip.competition === 'club') return
  const byPlayer = new Map<string, HoleStat[]>()
  for (const s of stats) {
    if (s.live || s.roundId !== roundId) continue
    byPlayer.set(s.playerId, [...(byPlayer.get(s.playerId) ?? []), s])
  }
  const signed = [...byPlayer.keys()]
  const accounts = await accountsOfPlayers(db, signed)
  const juniors = await juniorsOf(db, [...new Set(accounts.values())])
  const [club, players] = await Promise.all([
    clubOfTrip(db, round.tripId),
    signed.length ? db.from('players').select('id, name').in('id', signed) : Promise.resolve({ data: [] }),
  ])
  const nameOf = new Map(((players.data ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
  const kept: string[] = []
  for (const playerId of signed) {
    const authorId = accounts.get(playerId)
    if (!authorId || juniors.has(authorId)) continue
    const holes = (byPlayer.get(playerId) ?? []).map(h => ({ number: h.holeNumber, par: h.par, gross: h.noReturn ? null : h.gross, noReturn: h.noReturn, points: h.points }))
    await writeCard(db, { roundId, playerId, authorId, name: nameOf.get(playerId) ?? 'A member', holes, round, trip, club })
    kept.push(playerId)
  }
  // A card voided since: its item goes (a held status waiting for a card stays until the cleanup).
  let q = db.from('feed_items').delete().eq('round_id', roundId).eq('kind', 'card').eq('held', false)
  if (kept.length) q = q.not('player_id', 'in', `(${kept.join(',')})`)
  const { error } = await q
  if (error) throw error
}

/** `syncRoundCards`, never in the way. */
export function feedAfterSummaries(db: Db, roundId: string, stats: readonly HoleStat[]): Promise<void> {
  return syncRoundCards(db, roundId, stats).catch(quiet('round cards'))
}

/**
 * A club competition's card, once both signatures are in (D302): the player's
 * approval and the marker's co-sign. Then the competition's places are read
 * again — every card item's place refreshed, and a leaderboard move written
 * when this card puts its player into the top three.
 */
export async function writeSignedCard(db: Db, o: {
  tripId: string; code: string; roundId: string; playerId: string; authorId: string | null
  name: string; marker: string | null; holes: CardHoleFacts[]
}): Promise<void> {
  try {
    if (!o.authorId || !(await feedReady(db))) return
    if ((await juniorsOf(db, [o.authorId])).has(o.authorId)) return
    const [round, trip, club] = await Promise.all([roundFacts(db, o.roundId), tripOf(db, o.tripId), clubOfTrip(db, o.tripId)])
    if (!round || !trip) return
    await writeCard(db, { roundId: o.roundId, playerId: o.playerId, authorId: o.authorId, name: o.name, holes: o.holes, round, trip, club, marker: o.marker })
    await refreshPlaces(db, o.code, o.roundId, { mover: o.playerId, club, tripId: o.tripId, authorId: o.authorId, name: o.name })
  } catch (e) { quiet('signed card')(e) }
}

/** The competition's places onto its card items; a top-three arrival as a leaderboard move. */
async function refreshPlaces(db: Db, code: string, roundId: string, move?: { mover: string; club: { id: string } | null; tripId: string; authorId: string; name: string }) {
  const { readQualifierFinish } = await import('../club/matchPlayDraw')
  const finish = await readQualifierFinish(code).catch(() => null)
  if (!finish) return
  const placeOf = new Map(finish.map(f => [f.playerId, f.place]))
  const { data } = await db.from('feed_items').select('id, player_id, data').eq('round_id', roundId).eq('kind', 'card')
  for (const r of (data ?? []) as { id: string; player_id: string | null; data: Record<string, unknown> | null }[]) {
    const place = r.player_id ? placeOf.get(r.player_id) ?? null : null
    if ((r.data?.place ?? null) === place) continue
    const next = { ...(r.data ?? {}) }
    if (place) next.place = place
    else delete next.place
    await db.from('feed_items').update({ data: next }).eq('id', r.id)
  }
  if (!move) return
  const place = placeOf.get(move.mover)
  if (!place || place > MOVE_TOP) return
  const tied = finish.filter(f => f.place === place).length > 1
  await put(db, {
    key: `move:${roundId}:${move.mover}`, kind: 'board_move', author_id: move.authorId,
    trip_id: move.tripId, round_id: roundId, player_id: move.mover, club_id: move.club?.id ?? null,
    data: { name: move.name, line: moveLine(move.name, place, tied), place, code },
  })
}

/**
 * Certify (D302): the final places onto the cards, and a win for whoever
 * finished first (a tie, each of them). Reopening takes the wins away again.
 */
export async function writeWins(db: Db, code: string): Promise<void> {
  try {
    if (!(await feedReady(db))) return
    const { data: trip } = await db.from('trips').select('id, name').eq('trip_code', code).maybeSingle()
    const t = trip as { id: string; name: string } | null
    if (!t) return
    const { data: rounds } = await db.from('rounds').select('id').eq('trip_id', t.id)
    for (const r of (rounds ?? []) as { id: string }[]) await refreshPlaces(db, code, r.id)
    const { readQualifierFinish } = await import('../club/matchPlayDraw')
    const finish = await readQualifierFinish(code).catch(() => null)
    const winners = (finish ?? []).filter(f => f.place === 1).map(f => f.playerId)
    await writeWinsFor(db, t, winners)
  } catch (e) { quiet('wins')(e) }
}

export async function dropWins(db: Db, code: string): Promise<void> {
  try {
    if (!(await feedReady(db))) return
    const { data: trip } = await db.from('trips').select('id').eq('trip_code', code).maybeSingle()
    const id = (trip as { id: string } | null)?.id
    if (!id) return
    await db.from('feed_items').delete().eq('trip_id', id).like('key', 'won:%')
  } catch (e) { quiet('wins dropped')(e) }
}

async function writeWinsFor(db: Db, trip: { id: string; name: string }, winners: string[]) {
  if (winners.length === 0) return
  const accounts = await accountsOfPlayers(db, winners)
  const juniors = await juniorsOf(db, [...new Set(accounts.values())])
  const [club, players] = await Promise.all([clubOfTrip(db, trip.id), db.from('players').select('id, name').in('id', winners)])
  const nameOf = new Map(((players.data ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
  for (const playerId of winners) {
    const authorId = accounts.get(playerId)
    if (!authorId || juniors.has(authorId)) continue
    const name = nameOf.get(playerId) ?? 'A member'
    await put(db, {
      key: `won:${trip.id}:${playerId}`, kind: 'highlight', author_id: authorId,
      trip_id: trip.id, player_id: playerId, club_id: club?.id ?? null,
      data: { type: 'won', name, line: wonLine(name, trip.name) },
    })
  }
}

/** A handicap index that came down (D302) — one item a day an account, the latest figure. */
export async function writeCut(db: Db, userId: string, now: number, at: Date): Promise<void> {
  try {
    if (!(await feedReady(db))) return
    if ((await juniorsOf(db, [userId])).has(userId)) return
    const name = (await namesOf(db, [userId])).get(userId)?.name ?? 'A member'
    await put(db, {
      key: `cut:${userId}:${at.toISOString().slice(0, 10)}`, kind: 'highlight', author_id: userId,
      trip_id: null, club_id: null, data: { type: 'handicap_cut', name, line: cutLine(name, now), index: now },
    })
  } catch (e) { quiet('handicap cut')(e) }
}

/**
 * A knockout match's result (D300, D302), read back from the bracket — the
 * phone that recorded it only says which match. A result taken back takes
 * its item away. Nothing is written while any player in it is a junior, or
 * one with an account has chosen Only me. A final won is a win too.
 */
export async function writeMatchResult(db: Db, matchId: string): Promise<void> {
  try {
    if (!(await feedReady(db))) return
    const { data } = await db.from('matchplay_matches')
      .select('id, trip_id, round_number, round_name, entrant_type, player_a_id, player_b_id, team_a_id, team_b_id, winner_player_id, winner_team_id, result, next_match_id')
      .eq('id', matchId).maybeSingle()
    const m = data as {
      id: string; trip_id: string; round_number: number; round_name: string; entrant_type: string | null
      player_a_id: string | null; player_b_id: string | null; team_a_id: string | null; team_b_id: string | null
      winner_player_id: string | null; winner_team_id: string | null; result: string | null; next_match_id: string | null
    } | null
    const key = `match:${matchId}`
    if (!m) return dropKeys(db, [key])
    const pairs = m.entrant_type === 'pair'
    const sideA = pairs ? m.team_a_id : m.player_a_id
    const sideB = pairs ? m.team_b_id : m.player_b_id
    const winner = pairs ? m.winner_team_id : m.winner_player_id
    if (!winner || !sideA || !sideB) {
      await dropKeys(db, [key])
      if (!m.next_match_id) await db.from('feed_items').delete().eq('trip_id', m.trip_id).like('key', 'won:%')
      return
    }
    const loser = winner === sideA ? sideB : sideA
    const playersOf = async (side: string): Promise<string[]> => {
      if (!pairs) return [side]
      const { data: ms } = await db.from('team_members').select('player_id').eq('team_id', side)
      return ((ms ?? []) as { player_id: string }[]).map(r => r.player_id)
    }
    const [won, lost] = await Promise.all([playersOf(winner), playersOf(loser)])
    const everyone = [...won, ...lost]
    const accounts = await accountsOfPlayers(db, everyone)
    const linked = [...new Set(accounts.values())]
    const [juniors, settings, players, trip, club] = await Promise.all([
      juniorsOf(db, linked),
      linked.length ? db.from('feed_settings').select('user_id, audience').in('user_id', linked) : Promise.resolve({ data: [] }),
      db.from('players').select('id, name').in('id', everyone),
      tripOf(db, m.trip_id),
      clubOfTrip(db, m.trip_id),
    ])
    const privateOne = ((settings.data ?? []) as { audience: string }[]).some(s => s.audience === 'me')
    if (juniors.size > 0 || privateOne || !trip) return dropKeys(db, [key])
    const nameOf = new Map(((players.data ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
    const names = (ids: string[]) => ids.map(id => nameOf.get(id) ?? 'A player').join(' & ')
    const authorId = won.map(p => accounts.get(p)).find(Boolean) ?? lost.map(p => accounts.get(p)).find(Boolean) ?? null
    await put(db, {
      key, kind: 'match_result', author_id: authorId, trip_id: m.trip_id, club_id: club?.id ?? null,
      data: { name: names(won), line: matchLine(names(won), names(lost), m.result), round: m.round_name, event: trip.name, code: trip.code },
    })
    if (!m.next_match_id) await writeWinsFor(db, { id: m.trip_id, name: trip.name }, won)
  } catch (e) { quiet('match result')(e) }
}

/** The nightly tidy (D305): items past FEED_KEEP_DAYS, held statuses whose card never came, resolved reports. */
export async function tidyFeed(db: Db, now: Date, o: { keepDays: number; heldHours: number; reportDays: number }): Promise<{ items: number; held: number; reports: number } | null> {
  if (!(await feedReady(db))) return null
  const before = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const [items, held, reports] = await Promise.all([
    db.from('feed_items').delete({ count: 'exact' }).lt('created_at', before(o.keepDays * 86_400_000)).is('parent_id', null),
    db.from('feed_items').delete({ count: 'exact' }).eq('held', true).lt('created_at', before(o.heldHours * 3_600_000)),
    db.from('feed_reports').delete({ count: 'exact' }).not('resolved_at', 'is', null).lt('resolved_at', before(o.reportDays * 86_400_000)),
  ])
  return { items: items.count ?? 0, held: held.count ?? 0, reports: reports.count ?? 0 }
}
