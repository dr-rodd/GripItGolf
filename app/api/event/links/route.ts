import { NextRequest } from 'next/server'
import { runPlayerLinks } from '../actions'
import { asked, failed, respond } from '../respond'

// POST /api/event/links — `{ code, unlink? }`, a bearer token: the players a
// Green Dot member has linked themselves to in this event, for its organiser,
// and undoing a wrong one (D134, ../actions.ts).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const a = await asked(req)
    return respond(await runPlayerLinks({ token: a.token, code: a.body.code, unlink: a.body.unlink }, a.store, new Date()))
  } catch (e) {
    return failed(e)
  }
}
