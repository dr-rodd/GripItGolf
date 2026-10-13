import type { SupabaseClient } from '@supabase/supabase-js'
import { todayString } from '@/lib/tripStatus'
import { addDays, FINAL_GRACE_DAYS } from '@/lib/runChallenge'
import { freezeResults } from '@/lib/runBoards'
import { type StravaConfig, isGarmin } from '@/lib/strava'
import { endChallengeLinks } from '@/lib/stravaApi'
import { fetchRunChallenge } from '@/app/run/[tripCode]/data'
import { fetchRuns } from '@/app/run/[tripCode]/runs'
import { standingsOf } from '@/app/run/[tripCode]/standings'

/**
 * Closing run challenges — run by the nightly job.
 *
 * A challenge becomes final FINAL_GRACE_DAYS after its finish (lib/
 * runChallenge.ts `dueForFinal`): late uploads have had their days, the
 * organiser has had the chance to extend. Then, in this order:
 *
 *   1. the team standings are frozen into `trips.run_results` (migration
 *      055) — what the leaderboard shows from then on;
 *   2. only once that write has landed, every Strava run in the challenge is
 *      deleted and every Strava link to it ended (lib/stravaApi.ts
 *      `endChallengeLinks`). A failed freeze deletes nothing; tomorrow
 *      tries again.
 *
 * The Strava connection lasted for the challenge — that is what the runner
 * agreed to when they connected — and the frozen team result is what stays.
 *
 * **`FREEZE_INCLUDES_STRAVA`** is the one switch for a question with Strava:
 * whether a team total derived partly from Strava runs may be kept after
 * the event (their API Policy §5.5, §6.4). True counts every run, as the
 * board did on the last day; false freezes typed-in runs only. If Strava
 * says no, this is the line that changes.
 */

const FREEZE_INCLUDES_STRAVA = true

/** Challenges closed per night — each is a handful of queries. */
const PER_NIGHT = 20

export async function finaliseDueChallenges(
  admin: SupabaseClient, cfg: StravaConfig | null, now: Date,
): Promise<{ finalised: string[]; failed: string[] }> {
  const today = todayString(now)
  const { data: due, error } = await admin.from('trips')
    .select('id, trip_code')
    .eq('kind', 'run')
    .is('run_results', null)
    .lt('end_date', addDays(today, -FINAL_GRACE_DAYS))
    .limit(PER_NIGHT)
  if (error) {
    // Before migration 055 there is no run_results column: nothing to do yet.
    if (!/run_results/i.test(error.message ?? '')) console.error('finalise: could not list challenges:', error)
    return { finalised: [], failed: [] }
  }

  const finalised: string[] = []
  const failed: string[] = []
  for (const trip of due ?? []) {
    const code = trip.trip_code as string
    try {
      const challenge = await fetchRunChallenge(code)
      const read = await fetchRuns(trip.id as string)
      if (!challenge || !read.ready) { failed.push(code); continue }

      const hadStrava = read.runs.some(r => r.source === 'strava')
      const counted = FREEZE_INCLUDES_STRAVA ? read.runs : read.runs.filter(r => r.source !== 'strava')
      const s = standingsOf(challenge, counted)
      const garmin = counted.some(r => r.source === 'strava' && isGarmin(r.deviceName))
      const results = freezeResults(s.teams, s.teamScore, today, hadStrava, garmin)

      const { error: writeErr } = await admin.from('trips')
        .update({ run_results: results })
        .eq('id', trip.id)
      if (writeErr) { console.error('finalise: could not freeze', code, writeErr); failed.push(code); continue }

      if (cfg) {
        await endChallengeLinks(admin, cfg, trip.id as string)
      } else {
        // Strava switched off since: no tokens to revoke, but nothing of
        // Strava's may outlive the challenge either.
        await admin.from('runs').delete().eq('trip_id', trip.id).eq('source', 'strava')
      }
      finalised.push(code)
    } catch (e) {
      console.error('finalise: failed for', code, e)
      failed.push(code)
    }
  }
  return { finalised, failed }
}
