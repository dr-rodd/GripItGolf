import { NextRequest } from 'next/server'
import { runPlayTogether } from '../actions'
import { asked, failed, respond } from '../respond'

// POST /api/event/play-together — `{ code, boardId, together }`, a bearer
// token: the tee sheet wizard's answer, onto its board (../actions.ts).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const a = await asked(req)
    return respond(await runPlayTogether(
      { token: a.token, code: a.body.code, boardId: a.body.boardId, together: a.body.together }, a.store, new Date()))
  } catch (e) {
    return failed(e)
  }
}
