import type { createAdminClient } from '@/lib/supabase-admin'
import { voidScorecard } from '@/lib/scorecardVoid'
import { why } from '@/lib/writeFailure'
import { asRow, rowCols, withTicks, type RowRow } from '../club/store'
import { summaryDeps } from '../stats/store'
import { writeRoundSummaries } from '../stats/summaries'
import { dropWins, writeWins } from '../feed/write'
import { signStore } from './store'
import type { CertifyStore } from './certify'
import { readRoundLock } from './signatures'
import { afterQualifierCertified } from '../club/qualifierField'
import { makeDueDraw } from '../match/dueDraws'
export { certifiedRounds } from './signatures'

// Certify, Reopen and No return on the service role (stage (d4)). Every read
// of migration 091 fails soft to "not ready" — before it nothing can be
// certified, and every round scores as it did.

type Db = ReturnType<typeof createAdminClient>

export function certifyStore(db: Db): CertifyStore {
  const s = signStore(db)
  return {
    userFromToken: t => s.userFromToken(t),
    competition: c => s.competition(c),
    myRow: (c, u) => s.myRow(c, u),
    rowsByIds: (c, ids) => s.rowsByIds(c, ids),
    players: t => s.players(t),
    bookings: r => s.bookings(r),
    signatures: r => s.signatures(r),
    async rowsByAccounts(clubId, userIds) {
      if (userIds.length === 0) return []
      const { data, error } = await withTicks(t => db.from('club_members').select(rowCols(t)).eq('club_id', clubId).in('user_id', userIds))
      return error ? [] : ((data ?? []) as unknown as RowRow[]).map(asRow)
    },
    async liveCards(roundId) {
      const { data: live } = await db.from('live_rounds').select('id, round_id, status').eq('round_id', roundId)
      const cards = (live ?? []) as { id: string; round_id: string; status: string }[]
      if (cards.length === 0) return []
      const { data: locks } = await db.from('live_player_locks').select('live_round_id, player_id').in('live_round_id', cards.map(c => c.id))
      const ls = (locks ?? []) as { live_round_id: string; player_id: string }[]
      return cards.map(c => ({ id: c.id, roundId: c.round_id, status: c.status, playerIds: ls.filter(l => l.live_round_id === c.id).map(l => l.player_id) }))
    },
    roundLock: roundId => readRoundLock(db, roundId),
    async dayChanges({ userIds, memberIds, from, to }) {
      const ors = [
        ...(userIds.length ? [`user_id.in.(${userIds.join(',')})`] : []),
        ...(memberIds.length ? [`club_member_id.in.(${memberIds.join(',')})`] : []),
      ]
      if (ors.length === 0) return []
      const { data, error } = await db.from('handicap_changes')
        .select('user_id, club_member_id, old_index, new_index, changed_by, source, changed_at')
        .or(ors.join(',')).gte('changed_at', from).lt('changed_at', to).order('changed_at')
      if (error) return []
      return ((data ?? []) as { user_id: string | null; club_member_id: string | null; old_index: number | null; new_index: number | null; changed_by: string | null; source: string; changed_at: string }[])
        .map(r => ({
          userId: r.user_id, memberId: r.club_member_id,
          oldIndex: r.old_index === null ? null : Number(r.old_index), newIndex: r.new_index === null ? null : Number(r.new_index),
          at: r.changed_at, by: r.changed_by, source: r.source,
        }))
    },
    async insertNoReturn(roundId, playerId, by) {
      const { error } = await db.from('round_no_returns').upsert({ round_id: roundId, player_id: playerId, by_user: by }, { onConflict: 'round_id,player_id' })
      if (error) throw error
    },
    async deleteNoReturn(roundId, playerId) {
      const { error } = await db.from('round_no_returns').delete().eq('round_id', roundId).eq('player_id', playerId)
      if (error) throw error
    },
    async voidCard(liveRoundId, roundId) {
      const failure = await voidScorecard(liveRoundId, roundId, db)
      if (failure) throw new Error(`Could not void the card${why(failure)}`)
    },
    async setCertified(roundId, at) {
      const { error } = await db.from('rounds').update({ certified_at: at }).eq('id', roundId)
      if (error) throw error
    },
    async logCertification(roundId, action, by, at) {
      const { error } = await db.from('round_certifications').insert({ round_id: roundId, action, by_user: by, at })
      if (error) throw error
    },
    async writeSummaries(code, roundId) {
      await writeRoundSummaries(code, roundId, summaryDeps(db), new Date())
    },
    async afterReopened(code) {
      await dropWins(db, code)
    },
    async dropSummaries(roundId) {
      const { error } = await db.from('card_summaries').delete().eq('round_id', roundId)
      if (error && !['42P01', 'PGRST205'].includes(error.code ?? '')) throw error
    },
    // Stage 5: a club match play qualifying from this competition makes its field and draw.
    async afterCertified(code) {
      // D302: the final places on the cards, and the winner's win, in the feed.
      await writeWins(db, code)
      const now = new Date()
      await afterQualifierCertified(db, code, now, async tripId => {
        const { data } = await db.from('trips').select('id, leaderboards, formats, team_scoring, bracket_setup').eq('id', tripId).maybeSingle()
        if (data) await makeDueDraw(db, data as Parameters<typeof makeDueDraw>[1], now, false)
      })
    },
  }
}
