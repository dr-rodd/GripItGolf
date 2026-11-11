import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { addressOf } from '../../entry/store'
import { runAskReset } from '../pinReset'
import { resetStore } from '../resetStore'

// POST /api/event/forgot — `{ code }`: "Forgot PIN?" → "Email me a link"
// (D67, ../pinReset.ts). Needs no sign-in. Answers `sent` whether or not an
// email went; never the address.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * Where the emailed link points. Fixed here, never read off the request's
 * Host header, so nobody can have a real link mailed that points elsewhere.
 * A preview deployment mails links to itself.
 */
function linkOrigin(): string {
  const preview = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
  return preview ? `https://${process.env.VERCEL_URL}` : 'https://greendot.live'
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const out = await runAskReset(
      { code: body?.code, address: addressOf(req), origin: linkOrigin() },
      resetStore(createAdminClient()),
      new Date(),
    )
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('pin reset ask failed:', e)
    return NextResponse.json({ ok: false, error: 'Couldn’t send just now. Try again.' }, { status: 503, headers: NO_STORE })
  }
}
