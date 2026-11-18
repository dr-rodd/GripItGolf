import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runAwards, type AwardsStore } from '../awards'
import { clubStore } from '../store'
import { bookingStore } from '../bookingStore'
import { readAwards, readYearResults, removeAward, writeAward } from '../awardsStore'

// POST /api/club/awards — `{ action, clubId, … }` with a Green Dot member's
// token: Golfer of the Year (stage 6, ../awards.ts). `list`, `standing` and
// `mine` for anybody on the club's list; `save` and `delete` for the
// Clubhouse.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    const clubs = clubStore(db)
    const booking = bookingStore(db)
    const store: AwardsStore = {
      userFromToken: t => clubs.userFromToken(t),
      club: id => clubs.club(id),
      rowOf: (clubId, userId) => clubs.rowOf ? clubs.rowOf(clubId, userId) : Promise.resolve(null),
      isStaff: userId => clubs.isStaff ? clubs.isStaff(userId) : Promise.resolve(false),
      awards: (clubId, year) => readAwards(db, clubId, year),
      saveAward: a => writeAward(db, a),
      deleteAward: (clubId, id) => removeAward(db, clubId, id),
      yearResults: (clubId, year) => readYearResults(db, clubId, year),
      rows: clubId => clubs.rows(clubId),
      memberships: clubId => booking.memberships ? booking.memberships(clubId) : Promise.resolve({ categories: [], ageDate: '01-01' }),
      logActivity: entries => clubs.logActivity ? clubs.logActivity(entries) : Promise.resolve(),
    }
    const out = await runAwards({ ...(body ?? {}), token, action: body?.action }, store, new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('awards route failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
