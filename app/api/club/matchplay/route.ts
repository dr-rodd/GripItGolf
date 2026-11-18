import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { entryToken } from '@/lib/pinHash'
import { runMatchPlayEntry, type MatchPlayEntryStore } from '../matchPlayEntry'
import { bookingStore } from '../bookingStore'
import { clubStore } from '../store'
import { readMatchPlayComp } from '../matchPlayStore'
import { PRESET_COLORS } from '@/lib/teamColors'

const PAIRS_SET = 'set-2'

// POST /api/club/matchplay — `{ action, code, … }` with a Green Dot member's
// token: a club match play's `state`, `enter`, `withdraw`, a pair's
// `names`, `join` and `partner` (stage 4), and the
// Clubhouse's `office.withdraw` (../matchPlayEntry.ts). Every answer to a
// member on the club's list carries the members-only door's cookie (D164).

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    const booking = bookingStore(db)
    const clubs = clubStore(db)
    const store: MatchPlayEntryStore = {
      userFromToken: t => booking.userFromToken(t),
      matchPlay: code => readMatchPlayComp(db, code),
      myRow: (clubId, userId) => booking.myRow(clubId, userId),
      rowsByIds: (clubId, ids) => booking.rowsByIds(clubId, ids),
      indexOf: row => booking.indexOf(row),
      async entrants(tripId) {
        const { data, error } = await db.from('players').select('id, name, club_member_id, created_at')
          .eq('trip_id', tripId).eq('is_composite', false).order('created_at').order('id')
        if (error) throw error
        return ((data ?? []) as { id: string; name: string; club_member_id: string | null }[])
          .map(p => ({ playerId: p.id, rowId: p.club_member_id, name: p.name }))
      },
      async insertPlayer(row) {
        const { data, error } = await db.from('players').insert({ ...row, role: 'player', is_lead: false, team_id: null }).select('id').single()
        if (error?.code === '23505') return 'clash'
        if (error || !data) throw error ?? new Error('no player')
        return (data as { id: string }).id
      },
      async deletePlayer(tripId, playerId) {
        const { error } = await db.from('players').delete().eq('trip_id', tripId).eq('id', playerId)
        if (error) throw error
      },
      linkAccount: (userId, tripId, playerId) => booking.linkAccount(userId, tripId, playerId),
      doorToken: (hash, code) => (hash ? entryToken(hash, code) : null),
      memberships: clubId => booking.memberships ? booking.memberships(clubId) : Promise.resolve({ categories: [], ageDate: '01-01' }),
      logActivity: entries => clubs.logActivity ? clubs.logActivity(entries) : Promise.resolve(),
      isStaff: userId => clubs.isStaff ? clubs.isStaff(userId) : Promise.resolve(false),
      searchRows: (clubId, q, limit) => booking.searchRows(clubId, q, limit),
      // Stage 4: a pair is a team on the draw's own sheet (`matchPlayBoard`).
      async pairs(tripId) {
        const [teams, members, players] = await Promise.all([
          db.from('teams').select('id, created_at').eq('trip_id', tripId).eq('team_set', PAIRS_SET).order('created_at').order('id'),
          db.from('team_members').select('team_id, player_id, added_by').eq('trip_id', tripId).eq('team_set', PAIRS_SET),
          db.from('players').select('id, name, club_member_id, created_at').eq('trip_id', tripId).order('created_at').order('id'),
        ])
        if (teams.error) throw teams.error
        if (members.error) throw members.error
        if (players.error) throw players.error
        const byId = new Map(((players.data ?? []) as { id: string; name: string; club_member_id: string | null }[]).map((p, i) => [p.id, { ...p, i }]))
        const rows = (members.data ?? []) as { team_id: string; player_id: string; added_by: string | null }[]
        return ((teams.data ?? []) as { id: string }[]).map(t => ({
          teamId: t.id,
          members: rows.filter(r => r.team_id === t.id && byId.has(r.player_id))
            .sort((a, b) => byId.get(a.player_id)!.i - byId.get(b.player_id)!.i)
            .map(r => { const p = byId.get(r.player_id)!; return { playerId: p.id, rowId: p.club_member_id, name: p.name, addedBy: r.added_by } }),
        }))
      },
      async makePair(tripId, name, members) {
        const { data, error } = await db.from('teams').insert({ trip_id: tripId, team_set: PAIRS_SET, name, color: PRESET_COLORS[0] }).select('id').single()
        if (error || !data) throw error ?? new Error('no team')
        const id = (data as { id: string }).id
        const { error: mErr } = await db.from('team_members').insert(members.map(m => ({ trip_id: tripId, team_id: id, team_set: PAIRS_SET, player_id: m.playerId, added_by: m.addedBy })))
        if (mErr) { await db.from('teams').delete().eq('trip_id', tripId).eq('id', id); throw mErr }
        return id
      },
      async addToPair(tripId, teamId, playerId, addedBy) {
        const { error } = await db.from('team_members').insert({ trip_id: tripId, team_id: teamId, team_set: PAIRS_SET, player_id: playerId, added_by: addedBy })
        if (error) throw error
      },
      async renamePair(tripId, teamId, name) {
        const { error } = await db.from('teams').update({ name }).eq('trip_id', tripId).eq('id', teamId)
        if (error) throw error
      },
      async deletePair(tripId, teamId) {
        // Only before the draw — a drawn team's matches go with it (019's cascade); entries are closed by then.
        const { error } = await db.from('teams').delete().eq('trip_id', tripId).eq('id', teamId)
        if (error) throw error
      },
    }
    const out = await runMatchPlayEntry({ ...(body ?? {}), token, action: body?.action }, store, new Date())
    const res = NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
    if (out.status === 200 && out.door) {
      res.cookies.set(entryCookie(out.door.code), out.door.value, {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: ENTRY_COOKIE_DAYS * 86_400,
      })
    }
    return res
  } catch (e) {
    console.error('match play entry failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
