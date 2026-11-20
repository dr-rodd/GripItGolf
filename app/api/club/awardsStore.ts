// Golfer of the Year's store, on the service role (stage 6): the awards
// themselves (club_awards, migration 097 — server only, read fail-soft:
// before it, AwardsNotReady) and a year's results for the standing — the
// club's certified stroke competitions in their Results' own order (No
// returns out), and its match play draws as stages reached.

import type { createAdminClient } from '@/lib/supabase-admin'
import { bracketStages, readAwardRules, type AwardResult, type Stage } from '@/lib/clubAward'
import { readClubMatchPlay } from '@/lib/clubMatchPlay'
import { readQualifierFinish } from './matchPlayDraw'
import { AwardsNotReady, type Award } from './awards'

type Db = ReturnType<typeof createAdminClient>

const missing = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205'].includes(e.code ?? '')

export async function readAwards(db: Db, clubId: string, year: number): Promise<Award[]> {
  const { data, error } = await db.from('club_awards').select('id, club_id, year, name, rules').eq('club_id', clubId).eq('year', year).order('created_at')
  if (missing(error)) throw new AwardsNotReady()
  if (error) throw error
  return ((data ?? []) as { id: string; club_id: string; year: number; name: string; rules: unknown }[])
    .map(a => ({ id: a.id, clubId: a.club_id, year: a.year, name: a.name, rules: readAwardRules(a.rules) }))
}

export async function writeAward(db: Db, a: Omit<Award, 'id'> & { id?: string }): Promise<string> {
  const row = { club_id: a.clubId, year: a.year, name: a.name, rules: a.rules, updated_at: new Date().toISOString() }
  const { data, error } = a.id
    ? await db.from('club_awards').update(row).eq('id', a.id).eq('club_id', a.clubId).select('id').single()
    : await db.from('club_awards').insert(row).select('id').single()
  if (missing(error)) throw new AwardsNotReady()
  if (error || !data) throw error ?? new Error('no award')
  return (data as { id: string }).id
}

export async function removeAward(db: Db, clubId: string, id: string): Promise<void> {
  const { error } = await db.from('club_awards').delete().eq('id', id).eq('club_id', clubId)
  if (missing(error)) throw new AwardsNotReady()
  if (error) throw error
}

/**
 * A year's results for the club's awards: every club competition begun in
 * the year — a stroke competition once every round is certified (its
 * Results' order, `readQualifierFinish`, No returns out, golf's places with
 * ties), a match play from its draw (`bracketStages`, a pair's points to
 * both players). By list row; a player made from no list row earns nothing.
 */
export async function readYearResults(db: Db, clubId: string, year: number): Promise<AwardResult[]> {
  const { data: privs } = await db.from('trip_private').select('trip_id').eq('club_id', clubId)
  const ids = ((privs ?? []) as { trip_id: string }[]).map(p => p.trip_id)
  if (!ids.length) return []
  const { data: ts } = await db.from('trips').select('id, trip_code, name, start_date, bracket_setup')
    .in('id', ids).eq('competition', 'club').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
  const trips = (ts ?? []) as { id: string; trip_code: string; name: string; start_date: string | null; bracket_setup: unknown }[]
  if (!trips.length) return []
  const mp = trips.filter(t => !!readClubMatchPlay(t.bracket_setup))
  const stroke = trips.filter(t => !readClubMatchPlay(t.bracket_setup))

  const out: AwardResult[] = []

  // Stroke: every round certified.
  if (stroke.length) {
    const { data: rs } = await db.from('rounds').select('id, trip_id, certified_at').in('trip_id', stroke.map(t => t.id))
    const rounds = (rs ?? []) as { id: string; trip_id: string; certified_at: string | null }[]
    const done = stroke.filter(t => { const mine = rounds.filter(r => r.trip_id === t.id); return mine.length > 0 && mine.every(r => !!r.certified_at) })
    const roundIds = rounds.filter(r => done.some(t => t.id === r.trip_id)).map(r => r.id)
    const { data: nrs } = roundIds.length ? await db.from('round_no_returns').select('player_id').in('round_id', roundIds) : { data: [] }
    const nr = new Set(((nrs ?? []) as { player_id: string }[]).map(n => n.player_id))
    const finishes = await Promise.all(done.map(t => readQualifierFinish(t.trip_code).catch(() => null)))
    done.forEach((t, i) => {
      const fin = (finishes[i] ?? []).filter(f => !nr.has(f.playerId) && f.rowId)
      const tiedAt = new Map<number, number>()
      for (const f of fin) tiedAt.set(f.place, (tiedAt.get(f.place) ?? 0) + 1)
      out.push({ code: t.trip_code, name: t.name, date: t.start_date, kind: 'stroke', finishers: fin.map(f => ({ rowId: f.rowId!, place: f.place, tied: tiedAt.get(f.place) ?? 1 })) })
    })
  }

  // Match play: stages reached so far.
  if (mp.length) {
    const { data: ms } = await db.from('matchplay_matches')
      .select('trip_id, round_number, player_a_id, player_b_id, team_a_id, team_b_id, winner_player_id, winner_team_id').in('trip_id', mp.map(t => t.id))
    const matches = (ms ?? []) as { trip_id: string; round_number: number; player_a_id: string | null; player_b_id: string | null; team_a_id?: string | null; team_b_id?: string | null; winner_player_id: string | null; winner_team_id?: string | null }[]
    const teamIds = [...new Set(matches.flatMap(m => [m.team_a_id, m.team_b_id]).filter((x): x is string => !!x))]
    const { data: tm } = teamIds.length ? await db.from('team_members').select('team_id, player_id').in('team_id', teamIds) : { data: [] }
    const membersOf = new Map<string, string[]>()
    for (const r of (tm ?? []) as { team_id: string; player_id: string }[]) membersOf.set(r.team_id, [...(membersOf.get(r.team_id) ?? []), r.player_id])
    const { data: ps } = await db.from('players').select('id, club_member_id').in('trip_id', mp.map(t => t.id))
    const rowOf = new Map(((ps ?? []) as { id: string; club_member_id: string | null }[]).map(p => [p.id, p.club_member_id]))
    for (const t of mp) {
      const mine = matches.filter(m => m.trip_id === t.id)
      if (!mine.length) continue
      const pairs = mine.some(m => m.team_a_id || m.team_b_id)
      const stages = bracketStages(mine.map(m => ({
        roundNumber: m.round_number,
        sideA: pairs ? m.team_a_id ?? null : m.player_a_id,
        sideB: pairs ? m.team_b_id ?? null : m.player_b_id,
        winner: pairs ? m.winner_team_id ?? null : m.winner_player_id,
      })))
      const list: { rowId: string; stage: Stage }[] = []
      for (const [side, stage] of stages) {
        for (const pid of pairs ? membersOf.get(side) ?? [] : [side]) {
          const rowId = rowOf.get(pid)
          if (rowId) list.push({ rowId, stage })
        }
      }
      out.push({ code: t.trip_code, name: t.name, date: t.start_date, kind: 'matchplay', stages: list })
    }
  }
  return out.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
}
