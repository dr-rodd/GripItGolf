import type { createAdminClient } from '@/lib/supabase-admin'
import type { CommitHole } from '@/lib/cardCommit'
import type { SavedScore } from '@/lib/liveScores'
import { bookingStore } from '../club/bookingStore'
import type { CardHole, SignStore } from './sign'
import { readSignatures } from './signatures'

// A club competition's signatures on the service role (stage (d3)). Every
// read of `card_signatures` fails soft to null — before migration 090 the
// route says signing is not set up yet, and the card stays open.

type Db = ReturnType<typeof createAdminClient>

export function signStore(db: Db): SignStore {
  const b = bookingStore(db)
  return {
    userFromToken: t => b.userFromToken(t),
    competition: code => b.competition(code),
    myRow: (clubId, userId) => b.myRow(clubId, userId),
    rowsByIds: (clubId, ids) => b.rowsByIds(clubId, ids),
    bookings: roundId => b.bookings(roundId),
    async players(tripId) {
      const { data, error } = await db.from('players').select('id, name, gender, club_member_id').eq('trip_id', tripId)
      if (error) throw error
      return ((data ?? []) as { id: string; name: string; gender: string | null; club_member_id: string | null }[])
        .map(p => ({ id: p.id, name: p.name, gender: p.gender ?? 'M', clubMemberId: p.club_member_id }))
    },
    async liveCard(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      const [{ data: live }, { data: locks }] = await Promise.all([
        db.from('live_rounds').select('id, round_id, status').eq('id', id).maybeSingle(),
        db.from('live_player_locks').select('player_id').eq('live_round_id', id),
      ])
      const l = live as { id: string; round_id: string; status: string } | null
      return l ? { id: l.id, roundId: l.round_id, status: l.status, playerIds: ((locks ?? []) as { player_id: string }[]).map(x => x.player_id) } : null
    },
    signatures: roundId => readSignatures(db, roundId),
    async holes(roundId) {
      const { data: r } = await db.from('rounds').select('course_id').eq('id', roundId).maybeSingle()
      const courseId = (r as { course_id?: string } | null)?.course_id
      if (!courseId) return []
      const { data, error } = await db.from('holes')
        .select('id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies').eq('course_id', courseId).order('hole_number')
      if (error) throw error
      return (data ?? []) as CommitHole[]
    },
    async playingHcps(roundId, playerIds) {
      const { data, error } = await db.from('round_handicaps').select('player_id, playing_handicap').eq('round_id', roundId).in('player_id', playerIds)
      if (error) throw error
      return new Map(((data ?? []) as { player_id: string; playing_handicap: number | null }[])
        .filter(r => r.playing_handicap !== null).map(r => [r.player_id, Number(r.playing_handicap)]))
    },
    async liveScores(roundId, playerIds) {
      const { data, error } = await db.from('live_scores')
        .select('player_id, hole_number, gross_score, stableford_points, fairway_hit, putts').eq('round_id', roundId).in('player_id', playerIds)
      if (error) throw error
      return (data ?? []) as SavedScore[]
    },
    async upsertScores(rows) {
      if (rows.length === 0) return
      const { error } = await db.from('scores').upsert(rows, { onConflict: 'player_id,hole_id,round_id' })
      if (error) throw error
    },
    async markCommitted(roundId, playerIds, committed) {
      const { error } = await db.from('live_scores').update({ committed }).eq('round_id', roundId).in('player_id', playerIds)
      if (error) throw error
    },
    async insertSignatures(rows) {
      const { error } = await db.from('card_signatures').insert(rows)
      if (error?.code === '23505') return 'clash'
      if (error) throw error
      return 'ok'
    },
    async updateSignature(id, patch) {
      const { error } = await db.from('card_signatures').update(patch).eq('id', id)
      if (error) throw error
    },
    async finaliseCard(liveRoundId, at) {
      const { error } = await db.from('live_rounds').update({ status: 'finalised', closed_at: at }).eq('id', liveRoundId)
      if (error) throw error
    },
    async reopenCard(liveRoundId) {
      const { error } = await db.from('live_rounds').update({ status: 'active', closed_at: null }).eq('id', liveRoundId)
      if (error) throw error
    },
    async deleteScores(roundId, playerId) {
      const { error } = await db.from('scores').delete().eq('round_id', roundId).eq('player_id', playerId)
      if (error) throw error
    },
    async card(roundId, playerId): Promise<CardHole[]> {
      const { data } = await db.from('scores').select('gross_score, no_return, stableford_points, holes(hole_number, par)')
        .eq('round_id', roundId).eq('player_id', playerId)
      type Row = { gross_score: number | null; no_return: boolean | null; stableford_points: number | null; holes: { hole_number: number; par: number } | { hole_number: number; par: number }[] | null }
      return ((data ?? []) as unknown as Row[]).flatMap(r => {
        const h = Array.isArray(r.holes) ? r.holes[0] : r.holes
        return h ? [{ number: h.hole_number, par: h.par, gross: r.gross_score, noReturn: !!r.no_return, points: r.stableford_points }] : []
      }).sort((a, b) => a.number - b.number)
    },
  }
}
