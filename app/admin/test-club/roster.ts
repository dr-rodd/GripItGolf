// The test club's cast as the database holds it now (D312): each character's
// account and place on the club's list, and the club's memberships by name —
// what a week's loader needs and the reseed has in hand while it runs.
// Server only.

import type { createAdminClient } from '@/lib/supabase-admin'

type Db = ReturnType<typeof createAdminClient>

export interface Roster {
  /** Character key → place on the club's list. */
  rowOf: Map<string, string>
  /** Character key → Green Dot account. */
  userOf: Map<string, string>
  /** Membership name → id. */
  cats: Map<string, string>
}

export async function readRoster(db: Db, clubId: string): Promise<Roster> {
  const [{ data: accounts }, { data: cats }] = await Promise.all([
    db.from('test_accounts').select('user_id, character_key').eq('club_id', clubId),
    db.from('club_categories').select('id, name').eq('club_id', clubId),
  ])
  const userOf = new Map(((accounts ?? []) as { user_id: string; character_key: string }[]).map(a => [a.character_key, a.user_id]))
  const { data: rows } = userOf.size
    ? await db.from('club_members').select('id, user_id').eq('club_id', clubId).in('user_id', [...userOf.values()])
    : { data: [] }
  const keyOfUser = new Map([...userOf].map(([k, u]) => [u, k]))
  const rowOf = new Map<string, string>()
  for (const r of (rows ?? []) as { id: string; user_id: string }[]) {
    const k = keyOfUser.get(r.user_id)
    if (k) rowOf.set(k, r.id)
  }
  return { rowOf, userOf, cats: new Map(((cats ?? []) as { id: string; name: string }[]).map(c => [c.name, c.id])) }
}
