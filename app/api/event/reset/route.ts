import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { respond } from '../respond'
import { SaveStepError, runCheckReset, runSaveReset } from '../pinReset'
import { resetStore } from '../resetStore'

// POST /api/event/reset — the reset page (D67, ../pinReset.ts):
//   `{ resetToken, check: true }` — is the link still good, for which event;
//   `{ resetToken, pin, again }`, signed in — the new PIN saved, every other
//   phone's organiser access ended, this one the organiser for twelve hours.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const store = resetStore(createAdminClient())
    if (body?.check === true) {
      const out = await runCheckReset({ resetToken: body.resetToken }, store, new Date())
      return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
    }
    const auth = req.headers.get('authorization') ?? ''
    const out = await runSaveReset({
      token: /^Bearer\s+(.+)$/i.exec(auth)?.[1] ?? null,
      resetToken: body?.resetToken, pin: body?.pin, again: body?.again,
    }, store, new Date())
    return out.status === 200
      ? respond(out, { code: out.body.code, value: out.cookie })
      : NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('pin reset failed:', e instanceof SaveStepError ? `${e.message}:` : '', e instanceof SaveStepError ? e.cause : e)
    // A short code, not the error: where it failed, never what the database said.
    const where = e instanceof SaveStepError ? e.step : 'before-save'
    return NextResponse.json({ ok: false, error: `Could not save — try again. (${where})` }, { status: 503, headers: NO_STORE })
  }
}
