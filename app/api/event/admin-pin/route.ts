import { NextRequest } from 'next/server'
import { runSetAdminPin } from '../actions'
import { asked, failed, respond } from '../respond'

// POST /api/event/admin-pin — `{ code, currentPin, pin }` (pin null takes a
// trip's passcode off), the phone's token as a bearer: the organiser PIN or a
// trip's passcode set, changed or taken off (../actions.ts `runSetAdminPin`).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const a = await asked(req)
    const out = await runSetAdminPin(
      { token: a.token, code: a.body.code, currentPin: a.body.currentPin, pin: a.body.pin, address: a.address },
      a.store, new Date())
    return respond(out)
  } catch (e) {
    return failed(e)
  }
}
