import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { makeDueDraw } from '../dueDraws'

/**
 * The draw going live (Ross, 5 Nov 2026): asked by the countdown on a match
 * play event's home screen and bracket once its moment has come. Makes the
 * draw the organiser set for that moment, if it is due and nobody has made
 * it yet — and only then; anything else is a quiet no. Anybody with the
 * code may ask: what is made is the organiser's own plan, at the time they
 * chose, once (`makeDueDraw`'s claim).
 */

export const dynamic = 'force-dynamic'

const TRIP_CODE = /^[A-Z0-9]{6}$/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown }
  const tripCode = String(body.tripCode ?? '').toUpperCase().trim()
  if (!TRIP_CODE.test(tripCode)) return NextResponse.json({ made: false }, { status: 400 })

  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ made: false }, { status: 503 })
  }
  const { data: trip } = await admin.from('trips')
    .select('id, leaderboards, formats, team_scoring, bracket_setup')
    .eq('trip_code', tripCode)
    .maybeSingle()
  if (!trip) return NextResponse.json({ made: false }, { status: 404 })

  try {
    const report = await makeDueDraw(admin, trip, new Date(), false)
    return NextResponse.json({ made: report.outcome === 'drawn', why: report.why ?? null })
  } catch (e) {
    console.error('draw-due failed:', tripCode, e)
    return NextResponse.json({ made: false }, { status: 500 })
  }
}
