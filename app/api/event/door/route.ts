import { NextRequest } from 'next/server'
import { runDoor } from '../actions'
import { asked, failed, respond } from '../respond'

// POST /api/event/door — `{ code, pin }`: the public PIN's door
// (../actions.ts `runDoor`). Sets this phone's entry cookie on the way out.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const a = await asked(req)
    const out = await runDoor({ code: a.body.code, pin: a.body.pin, address: a.address }, a.store, new Date())
    const code = typeof a.body.code === 'string' ? a.body.code.trim().toUpperCase() : ''
    return respond(out, out.status === 200 ? { code, value: out.cookie } : undefined)
  } catch (e) {
    return failed(e)
  }
}
