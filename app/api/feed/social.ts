// Comments, the dot, the Home dot and reports (D301, D303, D307).
//
// A comment, and a one-tap dot, on a card — only by somebody who may see the
// card, and a comment seen only by those who may (`mayViewChild`). The
// card's owner deletes any comment on it; an author deletes their own. A
// comment on your card puts a dot on Home until you look (`seen`), never an
// email. Report anything — a card, its status, a comment: a club card's
// report goes to that club's Clubhouse, anything else to Green Dot's /admin;
// a report hides nothing until somebody takes the item down.

import { clubMay, credentialsOf, type StoredCredentials } from '@/lib/clubMay'
import { REPORT_REASON_MAX, cleanText, commentIssue, COMMENT_MAX, mayView, reportDestination, talksOn } from '@/lib/feed'
import { done, fail, str, type FeedOutcome } from './outcome'
import { factsOf, threadOf, type Asker, type FeedStore, type ItemRow } from './feed'

export interface ReportRow {
  id: string; itemId: string; reason: string | null; createdAt: string
  item: { kind: string; name: string; text: string; event: string | null; removed: boolean }
  reporter: string
}

export interface SocialStore {
  /** `replyTo`: the reply on the same item it answers, and whose that was (D346). */
  insertComment(row: { parentId: string; authorId: string; tripId: string | null; clubId: string | null; name: string; text: string; at: string; replyTo?: { id: string; name: string } | null }): Promise<ItemRow>
  deleteItem(itemId: string): Promise<void>
  setDot(itemId: string, userId: string, on: boolean): Promise<void>
  /** A report; a second by the same person on the same item changes nothing. */
  insertReport(row: { itemId: string; reporterId: string; clubId: string | null; reason: string | null }): Promise<void>
  /** This account's place on a club's list, for the Clubhouse's reports — null when not on it. */
  clubCredentials(clubId: string, userId: string): Promise<StoredCredentials | null>
  isStaff(userId: string): Promise<boolean>
  reportsFor(clubId: string | null): Promise<ReportRow[]>
  /** Take the item down (or not), and close every open report on it. */
  resolveReports(itemId: string, by: string, outcome: 'removed' | 'dismissed', at: string): Promise<void>
}

/** The card an item is, or hangs off, with what deciding needs — null when there is none. */
async function cardOf(store: FeedStore, itemId: string): Promise<{ item: ItemRow; card: ItemRow } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null
  const [item] = await store.itemsByIds([itemId])
  if (!item) return null
  if (!item.parentId) return { item, card: item }
  const [card] = await store.itemsByIds([item.parentId])
  return card ? { item, card } : null
}

async function seeing(a: Asker, store: FeedStore, card: ItemRow): Promise<boolean> {
  const authors = card.authorId ? [card.authorId] : []
  const [friends, clubs, follows, audiences, juniors] = await Promise.all([
    store.friendIds(a.user.id), store.myClubs(a.user.id), store.follows(a.user.id), store.audiences(authors), store.juniors(authors),
  ])
  // In the event itself? Only asked where the card is an event's and not already seen as a friend's or a club's.
  const viewer = { userId: a.user.id, junior: a.junior, friends: new Set(friends), clubs: new Set(clubs.map(c => c.id)), events: new Set<string>(), follows: new Set(follows) }
  const facts = factsOf(card, audiences, juniors)
  if (mayView(facts, viewer)) return true
  if (!card.tripId) return false
  const today = new Date().toISOString().slice(0, 10)
  const comps = await store.recentComps(a.user.id, [...viewer.clubs], '2000-01-01', today)
  const playing = comps.some(c => c.tripId === card.tripId && c.playing)
  return playing && mayView(facts, { ...viewer, events: new Set([card.tripId]) })
}

export async function runSocial(action: string, input: Record<string, unknown>, a: Asker, store: FeedStore & SocialStore, now: Date): Promise<FeedOutcome | null> {
  const me = a.user.id

  if (action === 'comments') {
    const found = await cardOf(store, str(input.itemId))
    if (!found || found.card.removedAt || !(await seeing(a, store, found.card))) return fail(404, 'That card isn’t there any more.')
    const children = await store.childrenOf([found.card.id])
    const comments = threadOf(children.filter(c => c.kind === 'comment' && !c.removedAt), found.card.authorId === me, me)
    return done({ comments })
  }

  if (action === 'comment') {
    const text = cleanText(input.text, COMMENT_MAX)
    const why = commentIssue(text)
    if (why) return fail(400, why)
    const found = await cardOf(store, str(input.itemId))
    if (!found || found.item.parentId || !talksOn(found.item.kind) || found.card.removedAt || !(await seeing(a, store, found.card))) return fail(404, 'That card isn’t there any more.')
    // D346: a reply to a reply — one on the same item, still there.
    let replyTo: { id: string; name: string } | null = null
    const toId = str(input.replyTo)
    if (toId) {
      const [to] = /^[0-9a-f-]{36}$/i.test(toId) ? await store.itemsByIds([toId]) : []
      if (!to || to.kind !== 'comment' || to.parentId !== found.card.id || to.removedAt) return fail(404, 'That reply has gone — reply to the card instead.')
      replyTo = { id: to.id, name: str(to.data.name) || 'A member' }
    }
    const name = (await store.names([me])).get(me)?.name ?? 'A member'
    const c = await store.insertComment({ parentId: found.card.id, authorId: me, tripId: found.card.tripId, clubId: found.card.clubId, name, text, at: now.toISOString(), replyTo })
    // D329: a comment lifts its item to the top of every stream it is in; a dot does not.
    if (await store.v2()) await store.bump(found.card.id, c.createdAt)
    return done({ comment: { id: c.id, name, text, at: c.createdAt, mine: true, replyTo: replyTo?.id ?? null, replyName: replyTo?.name ?? null, canDelete: true, canReport: false } })
  }

  if (action === 'comment.delete') {
    const found = await cardOf(store, str(input.id))
    if (!found || found.item.kind !== 'comment') return fail(404, 'That comment has gone.')
    // Its author, or the owner of the card it is on (D301).
    if (found.item.authorId !== me && found.card.authorId !== me) return fail(403, 'Only its author, or the card’s owner, deletes a comment.')
    await store.deleteItem(found.item.id)
    return done()
  }

  if (action === 'dot') {
    const found = await cardOf(store, str(input.itemId))
    if (!found || found.item.parentId || !talksOn(found.item.kind) || found.card.removedAt || !(await seeing(a, store, found.card))) return fail(404, 'That card isn’t there any more.')
    await store.setDot(found.card.id, me, input.on !== false)
    return done({ on: input.on !== false })
  }

  if (action === 'seen') {
    await store.saveSettings(me, { commentsSeenAt: now.toISOString() })
    return done()
  }

  if (action === 'report') {
    const found = await cardOf(store, str(input.itemId))
    if (!found || !(await seeing(a, store, found.card))) return fail(404, 'That isn’t there any more.')
    if (found.item.authorId === me) return fail(400, 'That’s yours — delete it instead.')
    const dest = reportDestination(found.item, found.item.parentId ? found.card : null)
    const reason = cleanText(input.reason, REPORT_REASON_MAX) || null
    await store.insertReport({ itemId: found.item.id, reporterId: me, clubId: dest === 'green_dot' ? null : dest.clubId, reason })
    return done({ to: dest === 'green_dot' ? 'green_dot' : 'club' })
  }

  // The Clubhouse's reports (D303): its holders, and Green Dot staff.
  if (action === 'reports.club' || action === 'reports.resolve') {
    const clubId = str(input.clubId)
    const [row, staff] = await Promise.all([store.clubCredentials(clubId, me), store.isStaff(me)])
    if (!clubMay('open_clubhouse', { row: row ? credentialsOf(row) : null, staff })) return fail(403, 'Only the club’s Clubhouse sees its reports.')
    if (action === 'reports.club') return done({ reports: await store.reportsFor(clubId) })
    const outcome = input.outcome === 'removed' ? 'removed' : input.outcome === 'dismissed' ? 'dismissed' : null
    if (!outcome) return fail(400, 'Take it down, or leave it up?')
    const open = await store.reportsFor(clubId)
    const report = open.find(r => r.itemId === str(input.itemId))
    if (!report) return fail(404, 'That report has been dealt with.')
    await store.resolveReports(report.itemId, me, outcome, now.toISOString())
    return done()
  }

  return null
}
