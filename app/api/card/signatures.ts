import type { createAdminClient } from '@/lib/supabase-admin'
import type { Signature } from './sign'

// A round's card signatures (stage (d3), migration 090), read on the service
// role by the signing route and the competition page alike. Fails soft to
// null before 090.

type Db = ReturnType<typeof createAdminClient>

const SIG_COLS = 'id, player_id, live_round_id, finalised_by, finalised_at, approved_by, approved_at, marker_member_id, marked_by, marked_at, marked_as'
type SigRow = {
  id: string; player_id: string; live_round_id: string | null; finalised_by: string | null; finalised_at: string
  approved_by: string | null; approved_at: string | null; marker_member_id: string | null
  marked_by: string | null; marked_at: string | null; marked_as: 'marker' | 'admin' | null
}
export const asSignature = (r: SigRow): Signature => ({
  id: r.id, playerId: r.player_id, liveRoundId: r.live_round_id, finalisedBy: r.finalised_by, finalisedAt: r.finalised_at,
  approvedBy: r.approved_by, approvedAt: r.approved_at, markerMemberId: r.marker_member_id,
  markedBy: r.marked_by, markedAt: r.marked_at, markedAs: r.marked_as,
})

/** A round's open signatures, or null before 090. */
export async function readSignatures(db: Db, roundId: string): Promise<Signature[] | null> {
  const { data, error } = await db.from('card_signatures').select(SIG_COLS).eq('round_id', roundId).is('sent_back_at', null)
  if (error) return null
  return ((data ?? []) as SigRow[]).map(asSignature)
}

