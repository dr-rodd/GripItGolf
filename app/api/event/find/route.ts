import { NextRequest, NextResponse } from 'next/server'
import { eventReader } from '@/lib/eventReader'

// GET /api/event/find?code=GX7K2P — does an event answer to this code?
// `{ code }` when one does, 404 when none. For the landing page's code box
// and /join, which used to ask the database from the browser — something a
// phone that has entered nothing yet cannot do from row-level security stage
// 3. Says nothing else about the event: the short link (app/[code]/page.tsx)
// decides where it lives.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) return NextResponse.json({ code: null }, { status: 404, headers: NO_STORE })
  try {
    const { data, error } = await eventReader(code).from('trips').select('trip_code').maybeSingle()
    if (error) return NextResponse.json({ code: null }, { status: 503, headers: NO_STORE })
    const found = (data as { trip_code?: string } | null)?.trip_code ?? null
    return NextResponse.json({ code: found }, { status: found ? 200 : 404, headers: NO_STORE })
  } catch {
    return NextResponse.json({ code: null }, { status: 503, headers: NO_STORE })
  }
}
