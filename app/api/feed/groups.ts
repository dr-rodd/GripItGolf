// Stream groups (D343; Ross, 25 Nov 2026: "allowing users to create stream
// groups and add friends to the group stream. Users can then post in the
// stream" — and "Stream settings — allow admins to make other admins"). A
// member makes a group and names it, adding their own friends; whoever made
// it is its first admin. Admins add their own friends, take people out,
// rename it and make other admins; anybody may leave, and a group left with
// no admin hands it to its longest-standing member (`leavePlan`). Every rule
// is lib/feed.ts's; this applies them to a store. Server only (105).

import {
  GROUPS_MAX, addIssue, cleanText, GROUP_NAME_MAX, groupNameIssue, leavePlan,
} from '@/lib/feed'
import { done, fail, type FeedOutcome } from './outcome'
import type { Asker, FeedStore } from './feed'

export interface GroupRow { id: string; name: string; createdBy: string | null; createdAt: string }
export interface GroupMemberRow { userId: string; admin: boolean; addedBy: string | null; joinedAt: string }

export interface GroupsStore {
  /** Whether migration 105 is in. */
  groupsReady(): Promise<boolean>
  /** The groups this account is in, with whether it is an admin there and how many are in each. */
  groupsOf(userId: string): Promise<(GroupRow & { admin: boolean; members: number })[]>
  group(groupId: string): Promise<GroupRow | null>
  groupMembers(groupId: string): Promise<GroupMemberRow[]>
  /** Everybody sharing any group with this account. */
  groupmates(userId: string): Promise<string[]>
  makeGroup(name: string, by: string, at: string): Promise<string>
  addGroupMembers(groupId: string, rows: { userId: string; admin: boolean; addedBy: string | null }[], at: string): Promise<void>
  removeGroupMember(groupId: string, userId: string): Promise<void>
  setGroupAdmin(groupId: string, userId: string, admin: boolean): Promise<void>
  renameGroup(groupId: string, name: string): Promise<void>
  deleteGroup(groupId: string): Promise<void>
}

/** Said while 105 is not in. */
export const GROUPS_NOT_READY = 'Groups aren’t set up yet.'

// An account's or a group's id as handed in — compared against the friends and members read on the server, never trusted beyond that.
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-z-]{1,64}$/i.test(v) ? v.toLowerCase() : null)
const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(uuid).filter((x): x is string => !!x))] : [])

export async function runGroups(action: string, input: Record<string, unknown>, a: Asker, store: FeedStore, now: Date): Promise<FeedOutcome | null> {
  if (!action.startsWith('group')) return null
  const me = a.user.id
  if (!(await store.groupsReady())) return action === 'groups' ? done({ ready: false, groups: [] }) : fail(503, GROUPS_NOT_READY)
  const at = now.toISOString()

  if (action === 'groups') {
    const groups = await store.groupsOf(me)
    return done({ ready: true, groups: groups.map(g => ({ id: g.id, name: g.name, admin: g.admin, members: g.members })) })
  }

  const friends = async () => new Set(await store.friendIds(me))

  if (action === 'group.create') {
    const name = cleanText(input.name, GROUP_NAME_MAX)
    const why = groupNameIssue(name)
    if (why) return fail(400, why)
    if ((await store.groupsOf(me)).length >= GROUPS_MAX) return fail(400, `You can be in ${GROUPS_MAX} groups at most.`)
    const adding = ids(input.members).filter(id => id !== me)
    if (adding.length) {
      const issue = addIssue({ adderFriends: await friends(), members: [me], adding })
      if (issue) return fail(400, issue)
    }
    const id = await store.makeGroup(name.trim(), me, at)
    await store.addGroupMembers(id, [{ userId: me, admin: true, addedBy: me }, ...adding.map(userId => ({ userId, admin: false, addedBy: me }))], at)
    return done({ id })
  }

  const groupId = uuid(input.groupId)
  const group = groupId ? await store.group(groupId) : null
  if (!groupId || !group) return fail(404, 'That group has gone.')
  const members = await store.groupMembers(groupId)
  const mine = members.find(m => m.userId === me)
  if (!mine) return fail(403, 'That group is for its members.')

  if (action === 'group.read') {
    const names = await store.names(members.map(m => m.userId))
    const fr = mine.admin ? [...(await friends())].filter(id => !members.some(m => m.userId === id)) : []
    const frNames = fr.length ? await store.names(fr) : new Map()
    const person = (id: string, n: Map<string, { name: string; club: string | null }>) => ({ id, name: n.get(id)?.name ?? 'A Green Dot member', club: n.get(id)?.club ?? null })
    return done({
      group: { id: group.id, name: group.name },
      admin: mine.admin,
      members: members
        .map(m => ({ ...person(m.userId, names), admin: m.admin, me: m.userId === me }))
        .sort((x, y) => Number(y.admin) - Number(x.admin) || x.name.localeCompare(y.name)),
      canAdd: fr.map(id => person(id, frNames)).sort((x, y) => x.name.localeCompare(y.name)),
    })
  }

  if (action === 'group.leave') {
    const plan = leavePlan(members, me)
    if (plan.deleteGroup) { await store.deleteGroup(groupId); return done({ deleted: true }) }
    await store.removeGroupMember(groupId, me)
    if (plan.promote) await store.setGroupAdmin(groupId, plan.promote, true)
    return done({ deleted: false })
  }

  // Everything else is an admin's (Ross: "allow admins to make other admins").
  if (!mine.admin) return fail(403, 'Only the group’s admins change it.')

  if (action === 'group.rename') {
    const name = cleanText(input.name, GROUP_NAME_MAX)
    const why = groupNameIssue(name)
    if (why) return fail(400, why)
    await store.renameGroup(groupId, name.trim())
    return done()
  }

  if (action === 'group.add') {
    const adding = ids(input.userIds)
    const issue = addIssue({ adderFriends: await friends(), members: members.map(m => m.userId), adding })
    if (issue) return fail(400, issue)
    await store.addGroupMembers(groupId, adding.map(userId => ({ userId, admin: false, addedBy: me })), at)
    return done()
  }

  const target = uuid(input.userId)
  const them = target ? members.find(m => m.userId === target) : null
  if (!target || !them) return fail(404, 'They aren’t in the group.')

  if (action === 'group.remove') {
    if (target === me) return fail(400, 'Leave the group instead.')
    await store.removeGroupMember(groupId, target)
    return done()
  }

  if (action === 'group.admin') {
    const on = input.on !== false
    if (!on && members.filter(m => m.admin && m.userId !== target).length === 0) return fail(400, 'A group needs an admin — make somebody else one first.')
    await store.setGroupAdmin(groupId, target, on)
    return done({ on })
  }

  return fail(400, 'Unknown request.')
}

/** The stream key of a group this account may post in, or why not. */
export async function groupToPostIn(store: FeedStore, userId: string, key: string): Promise<string | null> {
  if (!(await store.groupsReady())) return GROUPS_NOT_READY
  const id = key.slice('group:'.length)
  const members = await store.groupMembers(id)
  return members.some(m => m.userId === userId) ? null : 'That group is for its members.'
}
