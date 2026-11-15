import { NextRequest } from 'next/server'
import { runEventClub } from '../actions'
import { asked, failed, respond } from '../respond'

// POST /api/event/club — `{ code, clubId?, access?, pin? }`, a bearer token:
// the event's club and who edits it, for its organiser (stage (c),
// D138–D140, ../actions.ts).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const a = await asked(req)
    return respond(await runEventClub({
      token: a.token, code: a.body.code, clubId: a.body.clubId, access: a.body.access, pin: a.body.pin,
    }, a.store, new Date()))
  } catch (e) {
    return failed(e)
  }
}
