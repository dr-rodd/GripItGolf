// Green Dot Run × Strava — the network and the database. Server only.
//
// Every decision lives in lib/strava.ts; this file carries them out: it
// swaps codes for tokens, keeps tokens fresh, reads activities, writes and
// removes Strava runs, answers webhook events, and forgets an athlete
// completely when they leave. Everything here runs on the service role —
// `strava_athletes`, `strava_links` and `runs` are closed to the browser
// (migrations 053 and 054) — and no token ever leaves this file except
// towards Strava.
//
// Strava's limits for an app on the standard tier are 100 reads every 15
// minutes and 1,000 a day, so reads are spent carefully: one page of
// activities per runner per sync (a hundred runs — a month of a keen
// runner), one read per webhook event, and the nightly sync capped.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isRunChallenge } from './runChallenge'
import {
  type StravaConfig, type StravaActivity, type WebhookAction,
  runFromActivity, inChallenge, afterEpoch, planSync, tokenNeedsRefresh,
} from './strava'

const API = 'https://www.strava.com/api/v3'
const TIMEOUT_MS = 8_000

type TokenSet = { athleteId: number; access: string; refresh: string; expiresAt: number; scope?: string }

async function post(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** The authorisation code from Strava's callback, swapped for tokens. */
export async function exchangeCode(cfg: StravaConfig, code: string): Promise<TokenSet | null> {
  const res = await post('https://www.strava.com/oauth/token', {
    client_id: cfg.clientId, client_secret: cfg.clientSecret, code, grant_type: 'authorization_code',
  }).catch(() => null)
  if (!res?.ok) { console.error('strava exchange failed:', res?.status); return null }
  const j = await res.json() as { access_token?: string; refresh_token?: string; expires_at?: number; athlete?: { id?: number } }
  if (!j.access_token || !j.refresh_token || !j.expires_at || !j.athlete?.id) return null
  return { athleteId: j.athlete.id, access: j.access_token, refresh: j.refresh_token, expiresAt: j.expires_at }
}

/**
 * A fresh access token, or null.
 *
 * **A refused refresh is never read as the runner leaving.** It is also
 * exactly what a wrong or regenerated client secret looks like, and reading
 * it as "revoked" would delete every runner's Strava runs the moment the
 * keys in Vercel fell out of step with Strava's. Leaving is said by Strava's
 * deauthorisation webhook, or by the runner pressing Disconnect — those are
 * the only two doors to forgetting anyone.
 */
async function refreshTokens(cfg: StravaConfig, refresh: string): Promise<Omit<TokenSet, 'athleteId'> | null> {
  const res = await post('https://www.strava.com/oauth/token', {
    client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refresh, grant_type: 'refresh_token',
  }).catch(() => null)
  if (!res?.ok) { console.error('strava refresh failed:', res?.status); return null }
  const j = await res.json() as { access_token?: string; refresh_token?: string; expires_at?: number }
  if (!j.access_token || !j.refresh_token || !j.expires_at) return null
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: j.expires_at }
}

/** Store a token set — on connect, and after every refresh. */
export async function saveTokens(admin: SupabaseClient, t: TokenSet, scope?: string | null) {
  const { error } = await admin.from('strava_athletes').upsert({
    athlete_id: t.athleteId,
    access_token: t.access,
    refresh_token: t.refresh,
    expires_at: new Date(t.expiresAt * 1000).toISOString(),
    ...(scope ? { scope } : {}),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`could not save Strava tokens: ${error.message}`)
}

/**
 * A usable access token for this athlete — refreshed first if it is about
 * to run out — or null, a passing failure (no tokens stored, Strava
 * refusing, the network). Never a reason to delete anything.
 */
export async function accessToken(
  admin: SupabaseClient, cfg: StravaConfig, athleteId: number,
): Promise<string | null> {
  const { data } = await admin.from('strava_athletes')
    .select('access_token, refresh_token, expires_at')
    .eq('athlete_id', athleteId)
    .maybeSingle()
  if (!data) return null
  if (!tokenNeedsRefresh(data.expires_at, Date.now())) return data.access_token
  const fresh = await refreshTokens(cfg, data.refresh_token)
  if (!fresh) return null
  await saveTokens(admin, { athleteId, ...fresh })
  return fresh.access
}

/** A GET to Strava. A dropped connection is status 0, never a throw. */
async function getJson<T>(path: string, token: string): Promise<{ status: number; body: T | null }> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { status: res.status, body: res.ok ? await res.json() as T : null }
  } catch {
    return { status: 0, body: null }
  }
}

/** One page of the athlete's activities since `after` — a hundred is a month for most. */
async function listActivities(token: string, after: number): Promise<StravaActivity[] | null> {
  const { status, body } = await getJson<StravaActivity[]>(`/athlete/activities?after=${after}&per_page=100&page=1`, token)
  if (!body) { console.error('strava list failed:', status); return null }
  return body
}

// ─── The challenge side ────────────────────────────────────────

type Link = { player_id: string; trip_id: string; athlete_id: number }
type Window = { start: string | null; end: string | null }

async function challengeWindow(admin: SupabaseClient, tripId: string): Promise<Window | null> {
  const [{ data: t }, { data: k }] = await Promise.all([
    admin.from('trips').select('start_date, end_date').eq('id', tripId).maybeSingle(),
    admin.from('trips').select('kind').eq('id', tripId).maybeSingle(),
  ])
  if (!t || !isRunChallenge(k?.kind)) return null
  return { start: t.start_date ?? null, end: t.end_date ?? null }
}

/**
 * Bring one runner's Strava runs in this challenge up to date: write every
 * mappable activity inside the challenge, remove stored ones Strava no
 * longer lists (planSync decides). Returns how many runs it wrote.
 */
export async function syncLink(admin: SupabaseClient, cfg: StravaConfig, link: Link): Promise<number | null> {
  const window = await challengeWindow(admin, link.trip_id)
  if (!window?.start) return null
  const token = await accessToken(admin, cfg, link.athlete_id)
  if (!token) return null

  const fetched = await listActivities(token, afterEpoch(window.start))
  if (!fetched) return null

  const { data: stored } = await admin.from('runs')
    .select('strava_activity_id, run_date')
    .eq('trip_id', link.trip_id)
    .eq('player_id', link.player_id)
    .eq('source', 'strava')
  const storedInWindow = (stored ?? [])
    .filter(r => inChallenge(String(r.run_date), window.start, window.end))
    .map(r => Number(r.strava_activity_id))

  const plan = planSync(fetched, storedInWindow, window)
  if (plan.upserts.length > 0) {
    const { error } = await admin.from('runs').upsert(
      plan.upserts.map(r => ({ ...r, trip_id: link.trip_id, player_id: link.player_id, source: 'strava' })),
      { onConflict: 'trip_id,strava_activity_id' },
    )
    if (error) { console.error('strava upsert failed:', error); return null }
  }
  if (plan.deleteIds.length > 0) {
    await admin.from('runs').delete()
      .eq('trip_id', link.trip_id).eq('player_id', link.player_id).eq('source', 'strava')
      .in('strava_activity_id', plan.deleteIds)
  }
  await admin.from('strava_links')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('player_id', link.player_id)
  return plan.upserts.length
}

/**
 * Forget an athlete entirely: every Strava run they gave any challenge,
 * every link, the tokens — and, when asked, tell Strava to revoke too.
 * What Strava requires within 30 days, done at once.
 */
export async function forgetAthlete(
  admin: SupabaseClient, cfg: StravaConfig, athleteId: number, opts: { revoke: boolean },
) {
  const { data: links } = await admin.from('strava_links').select('player_id').eq('athlete_id', athleteId)
  const players = (links ?? []).map(l => l.player_id as string)
  if (players.length > 0) {
    await admin.from('runs').delete().in('player_id', players).eq('source', 'strava')
  }
  if (opts.revoke) {
    const token = await accessToken(admin, cfg, athleteId).catch(() => null)
    if (token) {
      await post('https://www.strava.com/oauth/deauthorize', { access_token: token }).catch(() => null)
    }
  }
  // Links go with the athlete (ON DELETE CASCADE).
  await admin.from('strava_athletes').delete().eq('athlete_id', athleteId)
}

/**
 * Disconnect one runner in one challenge: their Strava runs there go, the
 * link goes, and if that Strava account feeds nothing else here the tokens
 * go too and Strava is told.
 */
export async function disconnectRunner(admin: SupabaseClient, cfg: StravaConfig, playerId: string, tripId: string) {
  const { data: link } = await admin.from('strava_links')
    .select('athlete_id').eq('player_id', playerId).eq('trip_id', tripId).maybeSingle()
  await admin.from('runs').delete().eq('trip_id', tripId).eq('player_id', playerId).eq('source', 'strava')
  await admin.from('strava_links').delete().eq('player_id', playerId).eq('trip_id', tripId)
  if (!link) return
  const { count } = await admin.from('strava_links')
    .select('player_id', { count: 'exact', head: true }).eq('athlete_id', link.athlete_id)
  if (!count) await forgetAthlete(admin, cfg, Number(link.athlete_id), { revoke: true })
}

/** Carry out what a webhook event asks (lib/strava.ts decided what that is). */
export async function handleWebhook(admin: SupabaseClient, cfg: StravaConfig, action: WebhookAction) {
  if (action.kind === 'ignore') return
  if (action.kind === 'deauthorize') {
    await forgetAthlete(admin, cfg, action.athleteId, { revoke: false })
    return
  }

  const { data: links } = await admin.from('strava_links')
    .select('player_id, trip_id, athlete_id').eq('athlete_id', action.athleteId)
  if (!links || links.length === 0) return

  if (action.kind === 'delete-activity') {
    await admin.from('runs').delete()
      .in('player_id', links.map(l => l.player_id))
      .eq('source', 'strava')
      .eq('strava_activity_id', action.activityId)
    return
  }

  // A new or edited activity: read it once, then write or remove it in
  // every challenge this athlete feeds.
  const token = await accessToken(admin, cfg, action.athleteId)
  if (!token) return
  const { status, body } = await getJson<StravaActivity>(`/activities/${action.activityId}`, token)
  // A passing failure — the nightly sync will catch it. A 404 or 403 is
  // different: the activity is gone or made private, and should not be on
  // any board, so it falls through to removal below.
  if (!body && status !== 404 && status !== 403) return
  const row = body ? runFromActivity(body) : null

  for (const link of links) {
    const window = await challengeWindow(admin, link.trip_id)
    if (!window) continue
    if (row && inChallenge(row.run_date, window.start, window.end)) {
      await admin.from('runs').upsert(
        { ...row, trip_id: link.trip_id, player_id: link.player_id, source: 'strava' },
        { onConflict: 'trip_id,strava_activity_id' },
      )
    } else {
      await admin.from('runs').delete()
        .eq('trip_id', link.trip_id).eq('player_id', link.player_id)
        .eq('source', 'strava').eq('strava_activity_id', action.activityId)
    }
  }
}

/**
 * Make sure Strava is sending webhook events to this site. One
 * subscription per app; created the first time it is found missing, which
 * is the first connect after deploy — so nobody has to set it up by hand.
 * Strava calls the webhook's GET to confirm while this request waits.
 */
export async function ensureSubscription(cfg: StravaConfig, callbackUrl: string): Promise<boolean> {
  const q = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret })
  const list = await fetch(`${API}/push_subscriptions?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null)
  if (list?.ok) {
    const subs = await list.json() as { callback_url?: string }[]
    if (subs.some(s => s.callback_url === callbackUrl)) return true
    if (subs.length > 0) {
      console.error('strava: a webhook subscription exists for another address:', subs.map(s => s.callback_url))
      return false
    }
  }
  const res = await post(`${API}/push_subscriptions`, {
    client_id: cfg.clientId, client_secret: cfg.clientSecret,
    callback_url: callbackUrl, verify_token: cfg.verifyToken,
  }).catch(() => null)
  if (!res?.ok) console.error('strava: could not subscribe to webhooks:', res?.status)
  return !!res?.ok
}
