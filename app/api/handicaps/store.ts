import type { createAdminClient } from '@/lib/supabase-admin'
import type { HandicapStore } from './handicaps'

// The handicap index's service-role store (D179, migration 089). A read fails
// soft — before 089 there is no table, and nobody has an index; a write
// before it throws, which the caller says calmly.

type Db = ReturnType<typeof createAdminClient>

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

export function handicapStore(db: Db): HandicapStore {
  return {
    async accountIndex(userId) {
      const { data, error } = await db.from('account_handicaps').select('handicap_index').eq('user_id', userId).maybeSingle()
      return error || !data ? null : num((data as { handicap_index: unknown }).handicap_index)
    },
    async accountIndexes(userIds) {
      const { data, error } = await db.from('account_handicaps').select('user_id, handicap_index').in('user_id', userIds)
      if (error || !data) return new Map()
      return new Map((data as { user_id: string; handicap_index: unknown }[]).map(r => [r.user_id, Number(r.handicap_index)]))
    },
    async setAccountIndex(userId, value) {
      const { error } = value === null
        ? await db.from('account_handicaps').delete().eq('user_id', userId)
        : await db.from('account_handicaps').upsert({ user_id: userId, handicap_index: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
    },
    async rowIndex(memberId) {
      const { data, error } = await db.from('club_members').select('handicap_index').eq('id', memberId).maybeSingle()
      return error || !data ? null : num((data as { handicap_index: unknown }).handicap_index)
    },
    async rowIndexesOf(clubId) {
      // Past Supabase's 1,000-row page: a big club's list kept its index
      // blank past the thousandth row before this read in pages.
      const out = new Map<string, number>()
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from('club_members').select('id, handicap_index').eq('club_id', clubId)
          .not('handicap_index', 'is', null).order('id').range(from, from + 999)
        if (error || !data) return out
        for (const r of data as { id: string; handicap_index: unknown }[]) out.set(r.id, Number(r.handicap_index))
        if (data.length < 1000) return out
      }
    },
    async setRowIndex(memberId, value) {
      const { error } = await db.from('club_members').update({ handicap_index: value }).eq('id', memberId)
      if (error) throw error
    },
    async log(e) {
      const { error } = await db.from('handicap_changes').insert({
        user_id: e.userId, club_member_id: e.memberId, old_index: e.oldIndex, new_index: e.newIndex,
        changed_by: e.by, source: e.source, round_id: e.roundId ?? null,
      })
      if (error) throw error
    },
  }
}
