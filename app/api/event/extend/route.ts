import { NextRequest } from 'next/server'
import { runExtend } from '../actions'
import { asked, failed, respond } from '../respond'

// POST /api/event/extend — `{ code, date }`, a bearer token: an ad hoc
// series' end date moved on to a round added past it (../actions.ts).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const a = await asked(req)
    return respond(await runExtend({ token: a.token, code: a.body.code, date: a.body.date }, a.store, new Date()))
  } catch (e) {
    return failed(e)
  }
}
