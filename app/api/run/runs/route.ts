import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { todayString } from '@/lib/tripStatus'
import { parseRunEntry, runEntryIssue, addDays, closesOn } from '@/lib/runChallenge'
import { loadChallenge, cookieRunner } from '../runner'

/**
 * Saving and deleting a typed-in run — the only writer of `runs` from a
 * person; Strava's sync (lib/stravaApi.ts) is the other, on the server.
 *
 * The table is closed to the browser (migration 053), so this route is
 * where every rule is enforced before anything is written:
 *
 *   · the challenge is a run challenge, and typing runs in is allowed
 *     (`log_runs`);
 *   · the run belongs to **the runner this phone has joined as** — the
 *     player cookie, matched against the challenge's roster. That is the
 *     same soft identity the whole platform runs on (lib/currentPlayer.ts):
 *     it stops a phone logging runs as somebody else by accident, and it is
 *     not a security boundary — the trip code is still the only access
 *     control, as everywhere;
 *   · the run itself passes `runEntryIssue` — an activity that counts, a
 *     day inside the challenge and not in the future, a believable
 *     distance and time.
 *
 * A runner deletes only their own typed-in runs. A Strava run leaves when
 * it is deleted on Strava or the runner disconnects, never from here.
 *
 * Errors are calm sentences the form shows as they are.
 */

export const dynamic = 'force-dynamic'

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status })
}

/** The challenge, its setup and permissions, and the runner this phone is. */
async function context(tripCodeRaw: unknown) {
  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { error: fail('Runs cannot be saved just now — try again later.', 503) }
  }
  const loaded = await loadChallenge(admin, tripCodeRaw)
  if (!loaded) return { error: fail('That challenge could not be found.', 404) }
  const playerId = await cookieRunner(admin, loaded.trip)
  if (!playerId) return { error: fail('Join the challenge first, then log your runs.', 403) }
  return { admin, playerId, ...loaded }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Could not read that run — try again.')
  }

  const ctx = await context(body.tripCode)
  if ('error' in ctx) return ctx.error
  const { admin, trip, playerId, setup, perms } = ctx

  if (!perms.log_runs) {
    return fail('Runs come from Strava in this challenge — typing them in is switched off.', 403)
  }
  // Closed: the grace days after the finish are over and the result is
  // frozen (or about to be) — nothing more can change it.
  if (trip.end_date && todayString(new Date()) > closesOn(trip.end_date)) {
    return fail('This challenge is final — runs can no longer be added.', 403)
  }

  const entry = parseRunEntry(body)
  if (!entry) return fail('Could not read that run — check the boxes and try again.')

  // A phone ahead of the server's timezone is already on tomorrow.
  const issue = runEntryIssue(entry, {
    start: trip.start_date,
    end: trip.end_date,
    latest: addDays(todayString(new Date()), 1),
    activities: setup.rules.activities,
  })
  if (issue) return fail(issue)

  const { data, error } = await admin
    .from('runs')
    .insert({
      trip_id: trip.id,
      player_id: playerId,
      source: 'manual',
      activity: entry.activity,
      run_date: entry.date,
      distance_m: Math.round(entry.km * 1000),
      moving_s: entry.minutes === null ? null : entry.minutes * 60,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('run insert failed:', error)
    return fail(/runs|relation|schema cache/i.test(error?.message ?? '')
      ? 'Runs need a database update that has not been applied yet (migration 053).'
      : 'Could not save that run — try again.', 500)
  }
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Could not read that request — try again.')
  }

  const ctx = await context(body.tripCode)
  if ('error' in ctx) return ctx.error
  const { admin, trip, playerId } = ctx

  const runId = typeof body.runId === 'string' ? body.runId : ''
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return fail('Could not find that run.')

  // Yours, in this challenge, typed in — anything else is not this route's.
  const { data, error } = await admin
    .from('runs')
    .delete()
    .eq('id', runId)
    .eq('trip_id', trip.id)
    .eq('player_id', playerId)
    .eq('source', 'manual')
    .select('id')

  if (error) {
    console.error('run delete failed:', error)
    return fail('Could not delete that run — try again.', 500)
  }
  if (!data || data.length === 0) return fail('Could not find that run.', 404)
  return NextResponse.json({ ok: true })
}
