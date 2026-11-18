import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { entryToken } from '@/lib/pinHash'
import { runMatchPlayEntry, type MatchPlayEntryStore } from '../matchPlayEntry'
import { bookingStore } from '../bookingStore'
import { clubStore } from '../store'
import { readMatchPlayComp } from '../matchPlayStore'

// POST /api/club/matchplay — `{ action, code, … }` with a Green Dot member's
// token: a club match play's `state`, `enter`, `withdraw`, and the
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
