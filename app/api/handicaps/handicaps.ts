// The one writer of a handicap index (D179): every change goes through here,
// so the value and its log line are written together — from Me, the club's
// list, the card start sheet (stage (d2)), linking and unlinking a list row.
//
// Handed its store, so `test:clubs` runs it on a stand-in; ./store.ts is the
// service-role store. Server only.

import { linkPlan, sameIndex, type IndexOwner, type IndexSource } from '@/lib/handicapIndex'

export interface HandicapStore {
  /** An account's index, or null for none. */
  accountIndex(userId: string): Promise<number | null>
  /** Several accounts' at once, for a club's list. */
  accountIndexes(userIds: string[]): Promise<Map<string, number>>
  setAccountIndex(userId: string, value: number | null): Promise<void>
  /** A list row's own index, or null. */
  rowIndex(memberId: string): Promise<number | null>
  /** Every row of a club's list that holds its own index. */
  rowIndexesOf(clubId: string): Promise<Map<string, number>>
  setRowIndex(memberId: string, value: number | null): Promise<void>
  log(entry: {
    userId: string | null
    memberId: string | null
    oldIndex: number | null
    newIndex: number | null
    by: string | null
    source: IndexSource
    roundId?: string | null
  }): Promise<void>
}

/**
 * Sets one index — an account's, or a list row's own — and logs it. A value
 * the same as the stored one writes nothing. Answers what it was and is.
 */
export async function setIndex(
  store: HandicapStore,
  owner: IndexOwner,
  value: number | null,
  by: string | null,
  source: IndexSource,
  roundId: string | null = null,
): Promise<{ old: number | null; now: number | null; changed: boolean }> {
  const isAccount = 'userId' in owner
  const old = isAccount ? await store.accountIndex(owner.userId) : await store.rowIndex(owner.memberId)
  if (sameIndex(old, value)) return { old, now: old, changed: false }
  if (isAccount) await store.setAccountIndex(owner.userId, value)
  else await store.setRowIndex(owner.memberId, value)
  await store.log({
    userId: isAccount ? owner.userId : null,
    memberId: isAccount ? null : owner.memberId,
    oldIndex: old, newIndex: value, by, source, roundId,
  })
  return { old, now: value, changed: true }
}

/**
 * A list row has just been linked to an account (D179, `linkPlan`): the
 * account takes the row's index if it had none, the row's own copy goes
 * either way, and a difference is said once. Both changes logged.
 */
export async function linkIndex(store: HandicapStore, userId: string, memberId: string, clubName: string): Promise<string | null> {
  const [account, row] = await Promise.all([store.accountIndex(userId), store.rowIndex(memberId)])
  const plan = linkPlan(account, row, clubName)
  if (plan.setAccount !== undefined) await setIndex(store, { userId }, plan.setAccount, userId, 'link')
  if (plan.clearRow) await setIndex(store, { memberId }, null, userId, 'link')
  return plan.note
}

/**
 * A row's link is about to be cut (taken off the list): the row keeps a copy
 * of the account's index, so the club's list is never blank. Logged.
 */
export async function severIndex(store: HandicapStore, userId: string, memberId: string, by: string): Promise<void> {
  const account = await store.accountIndex(userId)
  if (account !== null) await setIndex(store, { memberId }, account, by, 'unlink')
}

/**
 * The one value for each row of a club's list: a linked row's account's, an
 * unlinked row's own. Accounts are asked in batches of two hundred, so a big
 * list never makes one over-long request.
 */
export async function listIndexes(
  store: HandicapStore,
  clubId: string,
  rows: { id: string; userId: string | null }[],
): Promise<Map<string, number | null>> {
  const linked = [...new Set(rows.filter(r => r.userId).map(r => r.userId as string))]
  const batches: string[][] = []
  for (let i = 0; i < linked.length; i += 200) batches.push(linked.slice(i, i + 200))
  const [own, ...parts] = await Promise.all([store.rowIndexesOf(clubId), ...batches.map(b => store.accountIndexes(b))])
  const accounts = new Map<string, number>(parts.flatMap(m => [...m]))
  return new Map(rows.map(r => [r.id, r.userId ? accounts.get(r.userId) ?? null : own.get(r.id) ?? null]))
}
