import type { Reads } from '@/lib/eventReader'
import { roundSheet, sheetIsOpen, describeOpening } from '@/lib/teeSheet'
import { parseStartFormat } from '@/lib/eventHub'
import { readSheetSettings } from '../teesheet/sheets'
import { type SessionTimes, sessionTimes } from './matchSheetPlan'

export { buildMatchSheets, sessionTimes, clocksOf, type MatchSheetProps, type SessionTimes } from './matchSheetPlan'

/**
 * The Order of play's own read of the same: which rounds start from a tee
 * sheet, and each sheet's times. Fail-soft — a failed read is no times,
 * never no matches.
 */
export async function readSessionTimes(
  db: Reads,
  tripId: string,
  setupHref: (roundId: string) => string,
  rowsOf: (roundId: string) => number,
): Promise<Map<string, SessionTimes>> {
  const [roundsRes, itemsRes, settings, assignRes] = await Promise.all([
    db.from('rounds').select('id, itinerary_item_id, start_format, scheduled_date').eq('trip_id', tripId),
    db.from('itinerary_items').select('id, tee_time').eq('trip_id', tripId).eq('kind', 'golf'),
    readSheetSettings(db, tripId),
    db.from('tee_assignments').select('round_id').eq('trip_id', tripId),
  ])
  if (roundsRes.error) return new Map()
  const teeTimes = new Map(((itemsRes.data ?? []) as { id: string; tee_time: string | null }[]).map(i => [i.id, i.tee_time]))
  const assigned = new Set(((assignRes.data ?? []) as { round_id: string }[]).map(a => a.round_id))
  const now = new Date()
  const rounds = ((roundsRes.data ?? []) as {
    id: string; itinerary_item_id: string | null; start_format: string | null; scheduled_date: string | null
  }[])
    .filter(r => parseStartFormat(r.start_format) === 'tee_sheet')
    .map(r => {
      const s = settings.get(r.id)
      const sheet = roundSheet({
        rules: s?.rules,
        startTime: r.itinerary_item_id ? teeTimes.get(r.itinerary_item_id) ?? null : null,
        intervalMins: s?.intervalMins,
        groupSize: s?.groupSize,
        hasAssignments: assigned.has(r.id),
      })
      return {
        id: r.id,
        sheet,
        opensLabel: sheet.state === 'active' && !sheetIsOpen(sheet.rules, r.scheduled_date, now)
          ? describeOpening(sheet.rules, r.scheduled_date) : null,
      }
    })
  return sessionTimes(rounds, setupHref, rowsOf)
}

