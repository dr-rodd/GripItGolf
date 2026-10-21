import type { SupabaseClient } from '@supabase/supabase-js'
import {
  golfIrelandConfig, leagueWindow, linkReadable,
  type CardContext, type GolfIrelandCard, type RoundVenue,
} from '@/lib/golfIreland'
import { golfIrelandClient } from '@/lib/golfIrelandClient'
import { syncCards, type SyncResult, type SyncStore, type SyncTarget } from '@/lib/golfIrelandSync'
import { readLiveScores, readScores } from '@/lib/scoreReads'
import { loadClubs, loadLinks, type LoadedLeague } from './league'

/**
 * One league's Golf Ireland cards read in, on the service role — the fetch
 * buttons' work (`/api/golf-ireland/fetch`), and the nightly job's when it
 * comes. lib/golfIrelandSync.ts runs the pass; this hands it the league's
 * confirmed links, what each card is checked against, and the table.
 *
 * `playerId` narrows it to one player's own link ("Fetch my scores");
 * absent, every confirmed link in the league ("Fetch everyone's").
 */
export async function syncLeague(
  admin: SupabaseClient, league: LoadedLeague, playerId: string | null, now = Date.now(),
): Promise<SyncResult> {
  const cfg = golfIrelandConfig()
  if (!cfg) return { state: 'not_ready' }
  const tripId = league.trip.id
  const today = new Date(now).toISOString().slice(0, 10)

  const [clubs, links, roundsRes] = await Promise.all([
    loadClubs(admin, league.rules.clubs),
    loadLinks(admin, tripId),
    admin.from('rounds').select('id, scheduled_date, course_id').eq('trip_id', tripId),
  ])
  if (roundsRes.error) throw roundsRes.error
  const clubOf = new Map(clubs.map(c => [c.clubId, c]))
  const targets: SyncTarget[] = links
    .filter(l => linkReadable(l, clubOf.get(l.clubId)))
    .filter(l => !playerId || l.playerId === playerId)
    .map(l => ({ playerId: l.playerId, memberId: l.memberId, clubId: l.clubId }))
  const empty: SyncResult = { state: 'done', read: 0, added: 0, refreshed: 0, removed: 0, failed: [] }
  if (targets.length === 0) return empty

  // The league's dates, never past today: a card cannot have been played
  // tomorrow, and a league not started yet has nothing to read.
  const span = leagueWindow(league.trip)
  const window = { from: span.from, to: span.to && span.to < today ? span.to : today }
  if (window.from > window.to) return empty

  const rounds = (roundsRes.data ?? []) as { id: string; scheduled_date: string | null; course_id: string | null }[]
  const courseIds = [...new Set(rounds.map(r => r.course_id).filter((c): c is string => !!c))]
  const roundIds = rounds.map(r => r.id)
  const both = league.setup.scoreSource === 'both'

  const [coursesRes, scoresRes, liveRes] = await Promise.all([
    courseIds.length > 0
      ? admin.from('courses').select('id, golf_ireland_id').in('id', courseIds)
      : Promise.resolve({ data: [], error: null }),
    // Scored both ways: the days each player already has a card for here.
    both && roundIds.length > 0
      ? readScores<{ player_id: string; round_id: string; hole_id: string }>(admin, 'player_id, round_id, hole_id', roundIds)
      : Promise.resolve({ data: [], error: null }),
    both && roundIds.length > 0
      ? readLiveScores<{ player_id: string; round_id: string; hole_number: number }>(admin, 'player_id, round_id, hole_number', roundIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const failedRead = [coursesRes, scoresRes, liveRes].find(r => r.error)
  if (failedRead?.error) throw failedRead.error

  const venueOf = new Map(((coursesRes.data ?? []) as { id: string; golf_ireland_id: string | null }[])
    .map(c => [c.id, c.golf_ireland_id]))
  const venues: RoundVenue[] = rounds.map(r => ({
    roundId: r.id,
    date: r.scheduled_date,
    venueId: r.course_id ? venueOf.get(r.course_id) ?? null : null,
  }))
  const dateOf = new Map(rounds.map(r => [r.id, r.scheduled_date]))
  const liveDates = new Map<string, Set<string>>()
  for (const s of [...(scoresRes.data ?? []), ...(liveRes.data ?? [])]) {
    const d = dateOf.get(s.round_id)
    if (!d) continue
    if (!liveDates.has(s.player_id)) liveDates.set(s.player_id, new Set())
    liveDates.get(s.player_id)!.add(d)
  }

  const base: CardContext = {
    from: span.from,
    to: span.to,
    venueCourseIds: [...new Set(venues.map(v => v.venueId).filter((v): v is string => !!v))],
    source: league.setup.scoreSource ?? 'live',
    // A league of rounds: a card is one of its rounds or nothing.
    ...(league.setup.schedule === 'series' ? { rounds: venues } : {}),
  }

  return syncCards({
    client: golfIrelandClient(cfg),
    store: cardStore(admin, tripId),
    targets,
    rules: league.rules,
    ctxFor: id => both ? { ...base, liveDates: [...(liveDates.get(id) ?? [])] } : base,
    window,
    now,
  })
}

/** `golf_ireland_cards` and the club credentials, on the service role. */
function cardStore(admin: SupabaseClient, tripId: string): SyncStore {
  const fail = (what: string, error: unknown) => { if (error) throw Object.assign(new Error(what), { cause: error }) }
  return {
    async credential(clubId) {
      const { data, error } = await admin.from('golf_ireland_clubs')
        .select('club_id, access_token, refresh_token, expires_at, withdrawn_at')
        .eq('club_id', clubId).maybeSingle()
      fail('club credential read failed', error)
      if (!data || data.withdrawn_at || !data.access_token) return null
      return {
        clubId: data.club_id as string,
        accessToken: data.access_token as string,
        refreshToken: (data.refresh_token as string | null) ?? null,
        expiresAt: data.expires_at ? Date.parse(data.expires_at as string) : null,
      }
    },
    async saveCredential(cred) {
      const { error } = await admin.from('golf_ireland_clubs').update({
        access_token: cred.accessToken,
        refresh_token: cred.refreshToken,
        expires_at: cred.expiresAt === null ? null : new Date(cred.expiresAt).toISOString(),
        last_ok_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('club_id', cred.clubId)
      fail('club credential save failed', error)
    },
    async held(playerId) {
      const { data, error } = await admin.from('golf_ireland_cards').select('card_id')
        .eq('trip_id', tripId).eq('player_id', playerId)
      fail('held cards read failed', error)
      return ((data ?? []) as { card_id: string }[]).map(r => ({ cardId: r.card_id }))
    },
    async write(playerId, cards) {
      const at = new Date().toISOString()
      const { error } = await admin.from('golf_ireland_cards')
        .upsert(cards.map(c => cardRow(tripId, playerId, c, at)), { onConflict: 'player_id,card_id' })
      fail('cards write failed', error)
    },
    async remove(playerId, cardIds) {
      const { error } = await admin.from('golf_ireland_cards').delete()
        .eq('trip_id', tripId).eq('player_id', playerId).in('card_id', cardIds)
      fail('cards remove failed', error)
    },
    async synced(playerId, at) {
      const { error } = await admin.from('golf_ireland_links').update({ last_synced_at: at })
        .eq('trip_id', tripId).eq('player_id', playerId)
      fail('link stamp failed', error)
    },
  }
}

/** A checked card as a `golf_ireland_cards` row — migration 056's columns. */
function cardRow(tripId: string, playerId: string, c: GolfIrelandCard, at: string) {
  return {
    trip_id: tripId,
    player_id: playerId,
    card_id: c.cardId,
    played_on: c.playedOn,
    holes_played: c.holesPlayed,
    course_id: c.courseId,
    course_name: c.courseName,
    gross_total: c.grossTotal,
    stableford_points: c.stablefordPoints,
    handicap_index: c.handicapIndex,
    course_handicap: c.courseHandicap,
    hole_scores: c.holeScores,
    refreshed_at: at,
  }
}
