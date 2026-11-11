import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { entryCookie } from '@/lib/publicPin'
import { runEntry } from './entry'
import { addressOf, serviceStore } from './store'

// GET  /api/entry — is migration 068 in? The browser signs nobody in until it
//      is (lib/entryClient.ts): a signed-in phone is the `authenticated` role,
//      and the match play card tables answer that role only once 068 has
//      granted it. Checks `entry_attempts`, the last table 068 makes, which
//      it makes after the grants.
// POST /api/entry — enter an event: `{ code, playerId?, adminPin?, publicPin? }`
//      with the phone's Supabase token as `Authorization: Bearer …`; or
//      `{ code, peek: true }` — what this phone is there, entering nothing —
//      or `{ code, close: true }`, the padlock shut (stage 4). The rules
//      are ./entry.ts; this file is the service-role store and the plumbing.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    const db = createAdminClient()
    const { error } = await db.from('entry_attempts').select('key', { head: true, count: 'exact' }).limit(1)
    return NextResponse.json({ ready: !error }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ ready: false }, { headers: NO_STORE })
  }
}



export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'No event code.' }, { status: 400, headers: NO_STORE })
  }
  const auth = req.headers.get('authorization') ?? ''
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1] ?? null
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''

  try {
    const db = createAdminClient()
    const out = await runEntry({
      token,
      code: body.code,
      playerId: body.playerId,
      adminPin: body.adminPin,
      publicPin: body.publicPin,
      peek: body.peek,
      close: body.close,
      entryCookie: code ? req.cookies.get(entryCookie(code))?.value ?? null : null,
      address: addressOf(req),
    }, serviceStore(db), new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('entry failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not enter — try again.' }, { status: 503, headers: NO_STORE })
  }
}
