import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stravaConfig, verifyState, scopeGranted } from '@/lib/strava'
import { exchangeCode, saveTokens, syncLink, ensureSubscription } from '@/lib/stravaApi'
import { loadChallenge, onRoster, originOf } from '../../runner'

/**
 * Strava hands the runner back here after its authorise screen.
 *
 * In order, and each step's failure goes back to the Add tab with its own
 * word: the state must be ours, unexpired and unaltered (it names the
 * challenge and the runner — the cookie is not trusted here, see connect);
 * the runner must not have said no or unticked the activities box; the code
 * must swap for tokens; and the Strava account must not already feed
 * another name in this challenge (one account, one runner, or a run would
 * count twice).
 *
 * Then: the tokens are stored (server only — migration 054), the runner is
 * linked with the time they consented, their runs since the challenge
 * started are pulled in, and Strava is told to send webhook events here if
 * it is not already. The sync and the subscription are best-effort: a
 * runner connected with an empty history still shows as connected, and the
 * nightly sync fills it in.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = originOf(req)
  const params = req.nextUrl.searchParams
  const cfg = stravaConfig()
  const state = cfg ? verifyState(params.get('state'), cfg.clientSecret, Date.now()) : null
  if (!cfg || !state) {
    // Without a trustworthy state there is no challenge to go back to.
    return NextResponse.redirect(`${origin}/`)
  }
  const back = (outcome: string) =>
    NextResponse.redirect(`${origin}/run/${state.tripCode}/add?strava=${outcome}`)

  if (params.get('error')) return back('denied')
  if (!scopeGranted(params.get('scope'))) return back('scope')
  const code = params.get('code')
  if (!code) return back('error')

  let admin
  try { admin = createAdminClient() } catch { return back('unavailable') }

  const loaded = await loadChallenge(admin, state.tripCode)
  if (!loaded || !(await onRoster(admin, loaded.trip.id, state.playerId))) return back('error')

  const tokens = await exchangeCode(cfg, code)
  if (!tokens) return back('error')

  // One Strava account feeds one name per challenge.
  const { data: taken } = await admin.from('strava_links')
    .select('player_id')
    .eq('trip_id', loaded.trip.id)
    .eq('athlete_id', tokens.athleteId)
    .neq('player_id', state.playerId)
    .maybeSingle()
  if (taken) return back('taken')

  try {
    await saveTokens(admin, tokens, params.get('scope'))
  } catch (e) {
    console.error('strava callback:', e)
    return back('error')
  }

  const { error: linkErr } = await admin.from('strava_links').upsert({
    player_id: state.playerId,
    trip_id: loaded.trip.id,
    athlete_id: tokens.athleteId,
    consented_at: new Date().toISOString(),
  })
  if (linkErr) {
    console.error('strava link failed:', linkErr)
    return back(/strava_links|relation|schema cache/i.test(linkErr.message) ? 'unavailable' : 'error')
  }

  await Promise.allSettled([
    syncLink(admin, cfg, { player_id: state.playerId, trip_id: loaded.trip.id, athlete_id: tokens.athleteId }),
    ensureSubscription(cfg, `${origin}/api/run/strava/webhook`),
  ])

  return back('connected')
}
