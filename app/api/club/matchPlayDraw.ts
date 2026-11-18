// A club match play's draw, on the event's own reader (lib/eventReader.ts)
// — kept apart from ./matchPlayStore.ts, whose club tables the event reader
// is never asked for (test:event-reader).

import { eventReader } from '@/lib/eventReader'
import { portalRounds, type PortalRound } from '@/lib/knockoutPortal'
import { readKnockout, type KnockoutView } from '@/app/golf/[root]/[tripCode]/knockout'

/**
 * A club match play's draw, read for the club area and the office (stage
 * 3): the platform's own knockout reader (`readKnockout`) on the event's
 * reader, sorted into rounds with their play-by dates (`portalRounds`).
 * Nobody's own match here — the server cannot see who is holding the phone;
 * the page asks for that after it paints.
 */
export async function readClubDraw(code: string): Promise<{ view: KnockoutView; rounds: PortalRound[] } | null> {
  const db = eventReader(code)
  const [{ data: trip }, { data: players }] = await Promise.all([
    db.from('trips').select('id, leaderboards, formats, team_scoring, bracket_setup').eq('trip_code', code).maybeSingle(),
    db.from('players').select('id, name').eq('is_composite', false),
  ])
  const t = trip as { id: string; leaderboards: unknown; formats: unknown; team_scoring: unknown; bracket_setup: unknown } | null
  if (!t) return null
  const view = await readKnockout(db, t, t.bracket_setup, null, (players ?? []) as { id: string; name: string }[])
  if (!view) return null
  return { view, rounds: portalRounds(view.matches, null, view.deadlines) }
}

