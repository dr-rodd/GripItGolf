// What a member posts on their own, and the card sheet's holes (Streams v2,
// D325–D330): a status into friends.stream or a match stream they follow,
// the club's official word into club.stream, deleting either, following a
// match stream, and a card's holes for the sheet. Every rule is lib/feed.ts's;
// who may post for a club is lib/clubMay.ts's (`post_club_stream`).

import { clubMay, credentialsOf } from '@/lib/clubMay'
import { isClubEventType } from '@/lib/clubEvents'
import {
  OWN_STATUS_MAX, cleanPost, cleanText, isGroupStream, isMatchStream, mayView, ownStatusIssue, postIssue, readLink, talksOn,
} from '@/lib/feed'
import { done, fail, str, type FeedOutcome } from './outcome'
import { factsOf, matchStreamsOf, viewerOf, type Asker, type FeedStore } from './feed'
import { groupToPostIn } from './groups'

/** Said while 104 is not in: the new kinds have nowhere to be kept. */
export const STREAMS_NOT_READY = 'Posting isn’t set up yet.'

export async function runOwn(action: string, input: Record<string, unknown>, a: Asker, store: FeedStore, now: Date): Promise<FeedOutcome | null> {
  const me = a.user.id

  // D328, D343: a status on its own — a stream group the member is in, or a match stream followed. Never club.stream or comp.stream.
  if (action === 'status.post') {
    if (!(await store.v2())) return fail(503, STREAMS_NOT_READY)
    const text = cleanText(input.text, OWN_STATUS_MAX)
    const why = ownStatusIssue(text)
    if (why) return fail(400, why)
    const stream = str(input.stream) || 'friends'
    if (isGroupStream(stream)) {
      const why = await groupToPostIn(store, me, stream.toLowerCase())
      if (why) return fail(why.includes('members') ? 403 : 503, why)
    } else if (stream !== 'friends') {
      if (!isMatchStream(stream)) return fail(400, 'A post goes to a group you’re in or a match stream you follow.')
      if (!(await matchStreamsOf(store, me)).includes(stream.toLowerCase())) return fail(403, 'That match’s stream is for its clubs’ members.')
    }
    const name = (await store.names([me])).get(me)?.name ?? 'A member'
    const row = await store.insertOwn({ kind: 'status', authorId: me, clubId: null, stream: isGroupStream(stream) || isMatchStream(stream) ? stream.toLowerCase() : stream, text, link: null, data: { name }, at: now.toISOString() })
    return done({ id: row.id })
  }

  // D325: the club's official word — its Officers and Clubhouse holders.
  if (action === 'post.club') {
    if (!(await store.v2())) return fail(503, STREAMS_NOT_READY)
    const clubId = str(input.clubId)
    const [row, staff, clubs] = await Promise.all([store.clubCredentials(clubId, me), store.isStaff(me), store.myClubs(me)])
    const club = clubs.find(c => c.id === clubId)
    if (!clubMay('post_club_stream', { row: row ? credentialsOf(row) : null, staff }) || (!club && !staff)) {
      return fail(403, 'Only the club’s Officers and Clubhouse post to club.stream.')
    }
    const text = cleanPost(input.text)
    const why = postIssue(text)
    if (why) return fail(400, why)
    const link = readLink(input.link)
    if ('issue' in link) return fail(400, link.issue)
    const title = cleanText(input.title, 80)
    // A club event broadcast (D325): its type rides along, so a member who turned that type off does not see it.
    const eventType = isClubEventType(input.eventType) ? input.eventType : null
    const name = (await store.names([me])).get(me)?.name ?? 'The club'
    const item = await store.insertOwn({
      kind: 'post', authorId: me, clubId, stream: null, text, link: link.link,
      data: { name, club: club?.name ?? null, text, ...(title ? { title } : {}), ...(eventType ? { eventType } : {}) }, at: now.toISOString(),
    })
    return done({ id: item.id })
  }

  // A status or a post taken down: its author; a club post, the club's Officers and Clubhouse too (D325).
  if (action === 'item.delete') {
    const [item] = await store.itemsByIds([str(input.itemId)].filter(x => /^[0-9a-f-]{36}$/i.test(x)))
    if (!item || item.parentId || (item.kind !== 'status' && item.kind !== 'post')) return fail(404, 'That has gone.')
    let may = item.authorId === me
    if (!may && item.kind === 'post' && item.clubId) {
      const [row, staff] = await Promise.all([store.clubCredentials(item.clubId, me), store.isStaff(me)])
      may = clubMay('post_club_stream', { row: row ? credentialsOf(row) : null, staff })
    }
    if (!may) return fail(403, item.kind === 'post' ? 'Only its poster, or the club’s Officers and Clubhouse, take a post down.' : 'Only its author deletes a status.')
    await store.deleteItem(item.id)
    return done()
  }

  // D326, D332: following a match stream — none exist until interclub teams do.
  if (action === 'follow') {
    if (!(await store.v2())) return fail(503, STREAMS_NOT_READY)
    const stream = str(input.stream)
    const on = input.on !== false
    if (!isMatchStream(stream)) return fail(400, 'Which match stream?')
    if (on && !(await store.followable(stream))) return fail(404, 'That match stream isn’t there.')
    await store.setFollow(me, stream, on)
    return done({ on })
  }

  // D330: a card's holes for the sheet — only to somebody who may see the card.
  if (action === 'card.detail') {
    const [card] = await store.itemsByIds([str(input.itemId)].filter(x => /^[0-9a-f-]{36}$/i.test(x)))
    if (!card || card.kind !== 'card' || card.removedAt || !card.roundId || !card.playerId) return fail(404, 'That card isn’t there any more.')
    if (!(await mayDetail(a, store, card))) return fail(404, 'That card isn’t there any more.')
    const detail = await store.cardDetail(card.roundId, card.playerId)
    return done({ detail })
  }

  return null
}

/** The sheet follows the card's own visibility (D305) — and the event's own players may always read it. */
async function mayDetail(a: Asker, store: FeedStore, card: Parameters<typeof factsOf>[0]): Promise<boolean> {
  if (!talksOn(card.kind)) return false
  const authors = card.authorId ? [card.authorId] : []
  const [{ viewer }, audiences, juniors] = await Promise.all([viewerOf(a, store), store.audiences(authors), store.juniors(authors)])
  const facts = factsOf(card, audiences, juniors)
  if (mayView(facts, viewer)) return true
  if (!card.tripId) return false
  const comps = await store.recentComps(a.user.id, [...viewer.clubs], '2000-01-01', new Date().toISOString().slice(0, 10))
  return comps.some(c => c.tripId === card.tripId && c.playing) && mayView(facts, { ...viewer, events: new Set([card.tripId]) })
}

