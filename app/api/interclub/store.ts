import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { TAG_SET } from '@/lib/tagBoards'
import { readFormat, type Settled } from '@/lib/interclubTie'
import { createStore } from '../trip/create/store'
import { clubStore } from '../club/store'
import { findCompetition, readCompetitionDraw } from '@/app/interclub/source'
import type { InterclubStore, TieRecord, TieMatchRow } from './interclub'
import type { ProvinceKey } from '@/lib/interclub'
import { withHoleMark } from '@/lib/matchCard'
import { readTieCards } from './tieCards'
import { writeInterclubResults } from '../feed/write'

// The service role's store behind /api/interclub. Every interclub table
// (migration 108) is read fail-soft: before the paste the draw pages offer
// nothing to set up and the club's name in the draws is its own.

type Db = ReturnType<typeof createAdminClient>

const notThere = (e: { code?: string } | null) => !!e && ['42P01', '42703', 'PGRST205', 'PGRST204', 'PGRST200'].includes(e.code ?? '')
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const TIE_COLS = 'id, competition_id, province, competition_slug, competition_name, draw_round, draw_slot, trip_id, round_id, name_a, name_b, club_a, club_b, tag_a, tag_b, format, settled, playoff_round_id, trips!inner(trip_code, start_date)'

type TieRow = {
  id: string; competition_id: string; province: string; competition_slug: string; competition_name: string
  draw_round: number; draw_slot: number; trip_id: string; round_id: string; name_a: string; name_b: string
  club_a: string | null; club_b: string | null; tag_a: string; tag_b: string; format: unknown; settled: unknown
  playoff_round_id: string | null
  trips: { trip_code: string; start_date: string | null } | { trip_code: string; start_date: string | null }[]
}

function asTie(r: TieRow): TieRecord | null {
  const trip = Array.isArray(r.trips) ? r.trips[0] : r.trips
  const format = readFormat(r.format)
  if (!trip || !format) return null
  const s = r.settled as Settled | null
  return {
    id: r.id, competitionId: r.competition_id, province: r.province as ProvinceKey, competitionSlug: r.competition_slug,
    competitionName: r.competition_name, round: r.draw_round, slot: r.draw_slot, tripId: r.trip_id, code: trip.trip_code,
    date: trip.start_date, roundId: r.round_id, nameA: r.name_a, nameB: r.name_b, clubA: r.club_a, clubB: r.club_b,
    tagA: r.tag_a, tagB: r.tag_b, format, settled: s && (s.winner === 'a' || s.winner === 'b') ? s : null,
    playoffRoundId: r.playoff_round_id,
  }
}

const ties = (rows: unknown[] | null) => ((rows ?? []) as TieRow[]).map(asTie).filter((t): t is TieRecord => !!t)

export function interclubStore(db: Db): InterclubStore {
  const clubs = clubStore(db)

  /** Make the match the first time anybody is put in it, else change it. */
  async function upsertMatch(tripId: string, roundId: string, slot: number, patch: Record<string, unknown>) {
    const { data, error } = await db.from('session_matches').select('id').eq('trip_id', tripId).eq('round_id', roundId).eq('slot', slot).maybeSingle()
    if (error) throw error
    const at = new Date().toISOString()
    if (data) {
      const { error: e } = await db.from('session_matches').update({ ...patch, updated_at: at }).eq('id', (data as { id: string }).id)
      if (e) throw e
    } else {
      const { error: e } = await db.from('session_matches').insert({ trip_id: tripId, round_id: roundId, slot, ...patch, updated_at: at })
      if (e) throw e
    }
  }

  return {
    userFromToken: t => clubs.userFromToken(t),
    clubsOf: u => clubs.clubsOf(u),

    async drawNames(clubIds) {
      if (clubIds.length === 0) return new Map()
      const { data, error } = await db.from('clubs').select('id, interclub_name').in('id', clubIds)
      if (notThere(error)) return 'not_ready'
      if (error) throw error
      return new Map(((data ?? []) as { id: string; interclub_name: string | null }[]).map(r => [r.id, r.interclub_name]))
    },
    async setDrawName(clubId, name) {
      const { error } = await db.from('clubs').update({ interclub_name: name }).eq('id', clubId)
      if (notThere(error)) return 'not_ready'
      if (error) throw error
      return 'ok'
    },

    async readDrawMatch(province, slug, round, slot, today) {
      const c = await findCompetition(province, slug)
      if (c === 'unreachable') return 'unreachable'
      if (!c) return null
      const read = await readCompetitionDraw(c, today)
      if (read.state === 'unreachable') return 'unreachable'
      if (read.state !== 'read') return null
      const m = read.draw.matches.find(x => x.round === round && x.slot === slot)
      if (!m) return null
      const name = (s: typeof m.a) => (s && !s.bye ? s.name : null)
      return {
        competition: { id: c.id, name: c.name, slug: c.slug, province: c.province },
        a: name(m.a), b: name(m.b), by: read.draw.rounds[round]?.by ?? null,
      }
    },

    async tiesFor(competitionId) {
      const { data, error } = await db.from('interclub_ties').select(TIE_COLS).eq('competition_id', competitionId).order('draw_round').order('draw_slot')
      if (notThere(error)) return 'not_ready'
      if (error) throw error
      return ties(data)
    },
    async tieByCode(code) {
      const { data, error } = await db.from('interclub_ties').select(TIE_COLS).eq('trips.trip_code', code).limit(1)
      if (notThere(error)) return 'not_ready'
      if (error) throw error
      return ties(data)[0] ?? null
    },
    async tieAt(competitionId, round, slot) {
      const { data, error } = await db.from('interclub_ties').select(TIE_COLS)
        .eq('competition_id', competitionId).eq('draw_round', round).eq('draw_slot', slot).limit(1)
      if (notThere(error)) return 'not_ready'
      if (error) throw error
      return ties(data)[0] ?? null
    },
    async tiesOfClubs(clubIds) {
      const list = clubIds.filter(id => /^[0-9a-f-]{36}$/i.test(id)).join(',')
      if (!list) return []
      const { data, error } = await db.from('interclub_ties').select(TIE_COLS)
        .or(`club_a.in.(${list}),club_b.in.(${list})`).order('created_at', { ascending: false }).limit(40)
      if (notThere(error)) return 'not_ready'
      if (error) throw error
      return ties(data)
    },

    create: createStore(db),
    newCode: () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''),
    newId: () => randomUUID(),
    async insertItem(row) {
      const { data, error } = await db.from('itinerary_items').insert(row).select('id').single()
      if (error || !data) throw error ?? new Error('no item')
      return (data as { id: string }).id
    },
    async insertRound(row) {
      const { error } = await db.from('rounds').insert(row)
      if (error) throw error
    },
    async insertTags(tripId, tags) {
      const { error } = await db.from('teams').insert(tags.map(t => ({ ...t, trip_id: tripId, team_set: TAG_SET })))
      if (error) throw error
    },
    async insertTie(row) {
      const { error } = await db.from('interclub_ties').insert(row)
      if (error?.code === '23505') return 'clash'
      if (notThere(error)) return 'not_ready'
      if (error) throw error
      return 'ok'
    },
    async deleteTrip(tripId) { await db.from('trips').delete().eq('id', tripId) },
    async updateTie(id, patch) {
      const { error } = await db.from('interclub_ties').update(patch).eq('id', id)
      if (error) throw error
    },

    async players(tripId) {
      const { data, error } = await db.from('players').select('id, name, handicap, team_id, gender').eq('trip_id', tripId)
      if (error) throw error
      return ((data ?? []) as { id: string; name: string; handicap: number | null; team_id: string | null; gender: string | null }[])
        .map(p => ({ id: p.id, name: p.name, handicap: p.handicap === null ? null : Number(p.handicap), teamId: p.team_id, gender: p.gender === 'F' ? 'F' as const : 'M' as const }))
    },
    async addPlayer(tripId, p) {
      const { data, error } = await db.from('players').insert({
        trip_id: tripId, name: p.name, handicap: p.handicap, team_id: p.teamId, gender: p.gender,
        claimed: false, role: 'player', is_lead: false, ...(p.clubMemberId ? { club_member_id: p.clubMemberId } : {}),
      }).select('id').single()
      if (error || !data) throw error ?? new Error('no player')
      const id = (data as { id: string }).id
      // The tag's member on the main sheet, as `players.team_id` mirrors it.
      const { error: e } = await db.from('team_members').insert({ trip_id: tripId, team_id: p.teamId, player_id: id, team_set: TAG_SET })
      if (e) console.error('interclub tag member not written:', e)
      return id
    },
    async updatePlayer(tripId, id, patch) {
      const { error } = await db.from('players').update(patch).eq('trip_id', tripId).eq('id', id)
      if (error) throw error
    },
    async removePlayer(tripId, id) {
      await db.from('team_members').delete().eq('trip_id', tripId).eq('player_id', id)
      const { error } = await db.from('players').delete().eq('trip_id', tripId).eq('id', id)
      if (error) throw error
    },

    async matches(tripId, roundId) {
      const { data, error } = await db.from('session_matches').select('id, slot, side_a, side_b, result, margin').eq('trip_id', tripId).eq('round_id', roundId)
      if (error) throw error
      return ((data ?? []) as { id: string; slot: number; side_a: string[]; side_b: string[]; result: TieMatchRow['result']; margin: string | null }[])
        .map(m => ({ id: m.id, slot: m.slot, sideA: m.side_a ?? [], sideB: m.side_b ?? [], result: m.result, margin: m.margin }))
    },
    tieCards: tie => readTieCards(tie.code, tie.tripId, db),
    async markHole(tripId, matchId, hole, winner) {
      // Read, merge and write back only while nobody else has written the row
      // since — a mark another phone just made is never overwritten.
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await db.from('session_matches').select('hole_marks, updated_at').eq('trip_id', tripId).eq('id', matchId).maybeSingle()
        if (notThere(error)) return 'not_ready'
        if (error) throw error
        if (!data) return 'gone'
        const row = data as { hole_marks: unknown; updated_at: string | null }
        let q = db.from('session_matches')
          .update({ hole_marks: withHoleMark(row.hole_marks, hole, winner), updated_at: new Date().toISOString() })
          .eq('id', matchId)
        q = row.updated_at ? q.eq('updated_at', row.updated_at) : q.is('updated_at', null)
        const { data: hit, error: e } = await q.select('id')
        if (e) throw e
        if ((hit ?? []).length > 0) return 'ok'
      }
      return 'busy'
    },
    noteFeed: (tie, results) => writeInterclubResults(db, { id: tie.id, tripId: tie.tripId, code: tie.code, competition: tie.competitionName }, results),
    async matchScored(tripId, matchId) {
      const { count, error } = await db.from('session_match_scores').select('hole_number', { count: 'exact', head: true }).eq('trip_id', tripId).eq('match_id', matchId)
      // Unknown is treated as scored: the safer refusal.
      return error ? true : (count ?? 0) > 0
    },
    async setMatchSide(tripId, roundId, slot, side, ids) {
      await upsertMatch(tripId, roundId, slot, { [side === 'a' ? 'side_a' : 'side_b']: ids })
    },
    async setMatchResult(tripId, roundId, slot, result, margin) {
      await upsertMatch(tripId, roundId, slot, { result, margin })
    },
    async readBoards(tripId) {
      const { data, error } = await db.from('trips').select('leaderboards').eq('id', tripId).single()
      if (error) throw error
      return (data as { leaderboards: unknown }).leaderboards
    },
    async writeBoards(tripId, boards) {
      const { error } = await db.from('trips').update({ leaderboards: boards }).eq('id', tripId)
      if (error) throw error
    },
    async insertPlayoffRound(tripId, r) {
      const { data, error } = await db.from('itinerary_items').insert(r.itemRow).select('id').single()
      if (error || !data) throw error ?? new Error('no item')
      const { error: e } = await db.from('rounds').insert({
        id: r.id, trip_id: tripId, course_id: r.courseId, round_number: 2, status: 'upcoming',
        itinerary_item_id: (data as { id: string }).id, scheduled_date: r.date,
      })
      if (e) throw e
    },
    async roundCourse(roundId) {
      const { data } = await db.from('rounds').select('course_id').eq('id', roundId).maybeSingle()
      return (data as { course_id: string } | null)?.course_id ?? null
    },
    async searchMembers(clubId, q) {
      const like = `%${q.replace(/[%_,()]/g, ' ')}%`
      const { data, error } = await db.from('club_members').select('id, name, user_id, gender, handicap_index')
        .eq('club_id', clubId).is('removed_at', null).ilike('name', like).order('name').limit(12)
      if (error) return []
      const rows = (data ?? []) as { id: string; name: string; user_id: string | null; gender: string | null; handicap_index: number | null }[]
      // D179: a linked row's index is the account's.
      const users = rows.map(r => r.user_id).filter((x): x is string => !!x)
      const acc = users.length ? await db.from('account_handicaps').select('user_id, handicap_index').in('user_id', users) : { data: [], error: null }
      const byUser = new Map(((acc.error ? [] : acc.data) ?? [] as unknown[]).map(x => {
        const r = x as { user_id: string; handicap_index: number }
        return [r.user_id, Number(r.handicap_index)] as const
      }))
      return rows.map(r => ({
        id: r.id, name: r.name,
        index: r.user_id ? byUser.get(r.user_id) ?? null : r.handicap_index === null ? null : Number(r.handicap_index),
        gender: r.gender === 'F' ? 'F' as const : r.gender === 'M' ? 'M' as const : null,
      }))
    },
  }
}
