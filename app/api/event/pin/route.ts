import { NextRequest } from 'next/server'
import { runSetPublicPin } from '../actions'
import { asked, failed, respond } from '../respond'

// POST /api/event/pin — `{ code, adminPin, pin }` (pin null takes it off),
// the phone's token as a bearer: the public PIN set, changed or taken off
// (../actions.ts `runSetPublicPin`, D65).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const a = await asked(req)
    const out = await runSetPublicPin(
      { token: a.token, code: a.body.code, adminPin: a.body.adminPin, pin: a.body.pin, address: a.address },
      a.store, new Date())
    const code = typeof a.body.code === 'string' ? a.body.code.trim().toUpperCase() : ''
    return respond(out, out.status === 200 ? { code, value: out.cookie } : undefined)
  } catch (e) {
    return failed(e)
  }
}
