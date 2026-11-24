// A test club competition's statuses, comments and dots (D313), posted
// through the feed's own route as the characters — a status by the card's
// own player, a comment and a dot by whoever the file says — exactly as a
// phone posts them, so the feed's rules (who may see a card, who may
// comment) are met the same way. Comments are dated the competition's
// afternoon. Each one looks first: a status already saying it, a comment
// already there from that author with those words, a dot already on — so
// posting again changes nothing. Server only.

import type { createAdminClient } from '@/lib/supabase-admin'
import { irishInstant } from '@/lib/irishTime'
import { dotPlan, testEmail, type Banter, type Character, type PlaySpec } from '@/lib/testClub'
import { POST as feedRoute } from '@/app/api/feed/route'
import { callAs, characterToken } from './characterCalls'
import { findComp } from './play'

type Db = ReturnType<typeof createAdminClient>

export async function postBanter(o: {
  db: Db
  club: { id: string; slug: string }
  cast: readonly Character[]
  rowOf: ReadonlyMap<string, string>
  userOf: ReadonlyMap<string, string>
  spec: PlaySpec
  banter: Banter | undefined
  deadline: number
}): Promise<{ done: boolean; posted: number; lines: string[] }> {
  const { db, spec } = o
  const lines: string[] = []
  let posted = 0
  const comp = await findComp(db, o.club.id, spec.key)
  if (!comp) return { done: true, posted, lines }
  const byKey = new Map(o.cast.map(c => [c.key, c]))
  const tokenOf = (k: string) => characterToken(testEmail(byKey.get(k)!.username, o.club.slug))
  const late = () => Date.now() > o.deadline

  // Each character's card in the feed, by key.
  const { data: playerRows } = await db.from('players').select('id, club_member_id').eq('trip_id', comp.tripId)
  const playerOfRow = new Map(((playerRows ?? []) as { id: string; club_member_id: string | null }[]).filter(p => p.club_member_id).map(p => [p.club_member_id!, p.id]))
  const playerOf = (k: string) => { const row = o.rowOf.get(k); return row ? playerOfRow.get(row) ?? null : null }
  const played = spec.groups.flat().filter(k => playerOf(k))
  const keys = played.map(k => `card:${comp.roundId}:${playerOf(k)}`)
  const { data: itemRows } = keys.length ? await db.from('feed_items').select('id, key, status').in('key', keys).is('removed_at', null) : { data: [] }
  const itemByKey = new Map(((itemRows ?? []) as { id: string; key: string; status: string | null }[]).map(i => [i.key, i]))
  const cardOf = (k: string) => { const p = playerOf(k); return p ? itemByKey.get(`card:${comp.roundId}:${p}`) ?? null : null }

  // ── Statuses, by the card's own player ──
  for (const [k, text] of Object.entries(o.banter?.statuses ?? {})) {
    if (late()) return { done: false, posted, lines }
    const card = cardOf(k)
    if (!card || card.status === text) continue
    const r = await callAs(feedRoute, '/api/feed', await tokenOf(k), { action: 'card.status', code: comp.code, roundId: comp.roundId, playerId: playerOf(k), text })
    if (r.status === 200) posted++
    else lines.push(`${spec.name}: ${byKey.get(k)!.name}’s status not posted — ${String(r.body.error ?? r.status)}`)
  }

  // ── Comments, dated that afternoon ──
  for (const [i, c] of (o.banter?.comments ?? []).entries()) {
    if (late()) return { done: false, posted, lines }
    const card = cardOf(c.on)
    const author = o.userOf.get(c.by)
    if (!card || !author) continue
    const { data: there } = await db.from('feed_items').select('id').eq('parent_id', card.id).eq('kind', 'comment')
      .eq('author_id', author).filter('data->>text', 'eq', c.text).limit(1)
    if ((there ?? []).length) continue
    const r = await callAs(feedRoute, '/api/feed', await tokenOf(c.by), { action: 'comment', itemId: card.id, text: c.text })
    if (r.status !== 200) { lines.push(`${spec.name}: ${byKey.get(c.by)!.name} on ${byKey.get(c.on)!.name} not posted — ${String(r.body.error ?? r.status)}`); continue }
    posted++
    const id = (r.body.comment as { id?: string } | undefined)?.id
    const minutes = 15 * 60 + 30 + i * 9
    const at = irishInstant(spec.day, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
    if (id && at) await db.from('feed_items').update({ created_at: at.toISOString() }).eq('id', id)
  }

  // ── Dots, by each character's comment rate ──
  for (const d of dotPlan(o.cast, played, spec.key)) {
    if (late()) return { done: false, posted, lines }
    const card = cardOf(d.on)
    const author = o.userOf.get(d.by)
    if (!card || !author) continue
    const { data: there } = await db.from('feed_dots').select('item_id').eq('item_id', card.id).eq('user_id', author).limit(1)
    if ((there ?? []).length) continue
    const r = await callAs(feedRoute, '/api/feed', await tokenOf(d.by), { action: 'dot', itemId: card.id, on: true })
    if (r.status === 200) posted++
  }
  return { done: true, posted, lines }
}
