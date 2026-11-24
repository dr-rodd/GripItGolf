// A week's Streams v2 talk (D333): characters made friends, the club's
// notices in club.stream, statuses on their own in friends.stream, and talk
// under a club match play's result in comp.stream — every one through the
// feed's own route as the character, exactly as a phone does it, so the
// rules (who may post for the club, who may see what) are met the same way.
// Each looks first, so loading twice changes nothing; each is dated to its
// moment (./stamp.ts). Characters only (D314): readWeek has refused anybody
// else before this runs. Server only.

import type { createAdminClient } from '@/lib/supabase-admin'
import { irishInstant } from '@/lib/irishTime'
import { testEmail, type Character, type WeekOwn, type WeekPost, type WeekResult, type WeekTalk } from '@/lib/testClub'
import { POST as feedRoute } from '@/app/api/feed/route'
import { callAs, characterToken } from './characterCalls'
import { notAfterNow, rebump, stampItems } from './stamp'

type Db = ReturnType<typeof createAdminClient>

interface Ctx {
  db: Db
  club: { id: string; slug: string }
  cast: readonly Character[]
  rowOf: ReadonlyMap<string, string>
  userOf: ReadonlyMap<string, string>
}

const ask = async (o: Ctx, key: string, body: Record<string, unknown>) => {
  const who = o.cast.find(c => c.key === key)!
  return callAs(feedRoute, '/api/feed', await characterToken(testEmail(who.username, o.club.slug)), body)
}
const nameOf = (o: Ctx, key: string) => o.cast.find(c => c.key === key)?.name ?? key

/** Two characters made friends: asked and accepted, as on a phone. Already friends, nothing happens. */
export async function befriend(o: Ctx, pairs: readonly [string, string][]): Promise<{ made: number; lines: string[] }> {
  const lines: string[] = []
  let made = 0
  for (const [a, b] of pairs) {
    const ua = o.userOf.get(a), ub = o.userOf.get(b), rowB = o.rowOf.get(b)
    if (!ua || !ub || !rowB) continue
    const [lo, hi] = ua < ub ? [ua, ub] : [ub, ua]
    const { data: row } = await o.db.from('friendships').select('accepted, requested_by').eq('user_a', lo).eq('user_b', hi).maybeSingle()
    const was = row as { accepted?: boolean; requested_by?: string } | null
    if (was?.accepted) continue
    if (!was) {
      const r = await ask(o, a, { action: 'request', rowId: rowB })
      if (r.status !== 200) { lines.push(`${nameOf(o, a)} and ${nameOf(o, b)} not made friends — ${String(r.body.error ?? r.status)}`); continue }
    }
    // Whoever was asked accepts.
    const askedBy = was?.requested_by ?? ua
    const r = askedBy === ua ? await ask(o, b, { action: 'respond', id: ua, accept: true }) : await ask(o, a, { action: 'respond', id: ub, accept: true })
    if (r.status === 200) made++
    else lines.push(`${nameOf(o, b)} did not accept ${nameOf(o, a)} — ${String(r.body.error ?? r.status)}`)
  }
  return { made, lines }
}

/** When something was said: its day and time, Irish, never still to come. */
function momentOf(day: string, time: string | undefined, fallback: string): string {
  const at = irishInstant(day, time ?? fallback)
  return notAfterNow(at ?? new Date())
}

/** The talk under an item, each comment looked for first, dated a few minutes apart after `from`. */
async function talkUnder(o: Ctx, itemId: string, talk: readonly WeekTalk[], from: string, label: string): Promise<{ posted: number; lines: string[] }> {
  const lines: string[] = []
  let posted = 0
  for (const [i, t] of talk.entries()) {
    const author = o.userOf.get(t.by)
    if (!author) continue
    const { data: there } = await o.db.from('feed_items').select('id').eq('parent_id', itemId).eq('kind', 'comment')
      .eq('author_id', author).filter('data->>text', 'eq', t.text).limit(1)
    if ((there ?? []).length) continue
    const r = await ask(o, t.by, { action: 'comment', itemId, text: t.text })
    if (r.status !== 200) { lines.push(`${label}: ${nameOf(o, t.by)}’s comment not posted — ${String(r.body.error ?? r.status)}`); continue }
    posted++
    const id = (r.body.comment as { id?: string } | undefined)?.id
    if (id) await o.db.from('feed_items').update({ created_at: notAfterNow(new Date(Date.parse(from) + (i + 1) * 11 * 60_000)) }).eq('id', id)
  }
  await rebump(o.db, [itemId])
  return { posted, lines }
}

/** A notice from the club in club.stream (D325), and the talk under it. */
export async function postNotice(o: Ctx, p: WeekPost): Promise<{ posted: number; lines: string[] }> {
  const author = o.userOf.get(p.by)
  if (!author) return { posted: 0, lines: [] }
  const at = momentOf(p.day, p.time, '09:30')
  const { data: there } = await o.db.from('feed_items').select('id').eq('kind', 'post').eq('club_id', o.club.id)
    .eq('author_id', author).filter('data->>text', 'eq', p.text).is('removed_at', null).limit(1)
  let id = ((there ?? []) as { id: string }[])[0]?.id ?? null
  let posted = 0
  if (!id) {
    const r = await ask(o, p.by, { action: 'post.club', clubId: o.club.id, title: p.title ?? '', text: p.text, link: p.link ?? '' })
    if (r.status !== 200) return { posted: 0, lines: [`${p.title ?? 'A notice'}: not posted — ${String(r.body.error ?? r.status)}`] }
    id = String(r.body.id ?? '')
    posted++
    await stampItems(o.db, at, q => q.eq('id', id as string))
  }
  const t = await talkUnder(o, id, p.comments ?? [], at, p.title ?? 'A notice')
  return { posted: posted + t.posted, lines: t.lines }
}

/** A status on its own in friends.stream (D328), and the talk under it. */
export async function postOwn(o: Ctx, s: WeekOwn): Promise<{ posted: number; lines: string[] }> {
  const author = o.userOf.get(s.by)
  if (!author) return { posted: 0, lines: [] }
  const at = momentOf(s.day, s.time, '19:00')
  const { data: there } = await o.db.from('feed_items').select('id').eq('kind', 'status').eq('author_id', author)
    .eq('status', s.text).is('removed_at', null).limit(1)
  let id = ((there ?? []) as { id: string }[])[0]?.id ?? null
  let posted = 0
  if (!id) {
    const r = await ask(o, s.by, { action: 'status.post', text: s.text, stream: 'friends' })
    if (r.status !== 200) return { posted: 0, lines: [`${nameOf(o, s.by)}’s status: not posted — ${String(r.body.error ?? r.status)}`] }
    id = String(r.body.id ?? '')
    posted++
    await stampItems(o.db, at, q => q.eq('id', id as string))
  }
  const t = await talkUnder(o, id, s.comments ?? [], at, `${nameOf(o, s.by)}’s status`)
  return { posted: posted + t.posted, lines: t.lines }
}

/**
 * Talk under a club match play's result in comp.stream (D332): the latest
 * one its winner won here — or, with no winner named, the club's latest
 * result, kept once chosen (the first comment found under one marks it).
 */
export async function talkOnResult(o: Ctx, x: WeekResult): Promise<{ posted: number; lines: string[] }> {
  const winner = x.winner ? o.userOf.get(x.winner) : null
  if (x.winner && !winner) return { posted: 0, lines: [] }
  let q = o.db.from('feed_items').select('id, created_at').eq('kind', 'match_result').eq('club_id', o.club.id).is('removed_at', null)
  if (winner) q = q.eq('author_id', winner)
  const { data: found } = await q.order('created_at', { ascending: false }).limit(20)
  const results = (found ?? []) as { id: string; created_at: string }[]
  // Loaded again after a newer result: the talk stays under the one it was first put under.
  const first = x.comments[0] && o.userOf.get(x.comments[0].by)
  let item = results[0]
  if (first && results.length > 1) {
    const { data: under } = await o.db.from('feed_items').select('parent_id').eq('kind', 'comment').eq('author_id', first)
      .filter('data->>text', 'eq', x.comments[0].text).in('parent_id', results.map(r => r.id)).limit(1)
    const at = ((under ?? []) as { parent_id: string }[])[0]?.parent_id
    item = results.find(r => r.id === at) ?? item
  }
  const label = x.winner ? `${nameOf(o, x.winner)}’s result` : 'The latest match play result'
  if (!item) return { posted: 0, lines: [`${label}: none here yet — nothing to talk under.`] }
  return talkUnder(o, item.id, x.comments, item.created_at, label)
}
