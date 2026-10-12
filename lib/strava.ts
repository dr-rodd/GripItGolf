// Green Dot Run × Strava — every decision, none of the network.
//
// lib/stravaApi.ts talks to Strava and the database; this file decides:
// what the authorise link is, how the trip-and-runner travels through
// Strava and back untampered (`state`), which Strava activities become runs
// and as what, what a sync should add and remove, and what a webhook event
// asks for. Pure — node's crypto for the signature, nothing else — so every
// rule here is tested without Strava, which the build container cannot
// reach anyway.
//
// ── The flow ────────────────────────────────────────────────────
//
//   Add tab → /api/run/strava/connect (consent ticked, phone joined)
//     → Strava's authorise page, carrying a signed `state`
//     → /api/run/strava/callback: verify state, swap the code for tokens,
//       link the runner, pull in their runs since the start
//     → Strava's webhook (/api/run/strava/webhook) tells us about every new,
//       edited or deleted activity, and about anyone revoking access
//     → a nightly sync re-reads each connection, catching anything missed.
//
// ── What Strava's rules shape here (docs/run.md) ────────────────
//
//   · Scope is `activity:read` — a run marked "Only you" on Strava never
//     arrives at all.
//   · Consent is ticked before connecting, and stored with the link.
//   · Revoking access on Strava, or disconnecting here, removes the
//     runner's Strava runs at once (Strava allows 30 days; we take none).
//   · Every mappable activity is stored (run, trail run, treadmill, walk,
//     hike) whatever the challenge counts today, so an organiser who starts
//     counting walks re-tells the board without anyone re-syncing — the
//     boards decide what counts, as they do for typed-in runs.

import { createHmac, timingSafeEqual } from 'crypto'
import { activityFromStrava, type RunActivity } from './runChallenge'

// ─── Configuration ─────────────────────────────────────────────

export type StravaConfig = { clientId: string; clientSecret: string; verifyToken: string }

/** The three keys from Vercel, or null when Strava is not set up. */
export function stravaConfig(env: Record<string, string | undefined> = process.env): StravaConfig | null {
  const clientId = env.STRAVA_CLIENT_ID?.trim()
  const clientSecret = env.STRAVA_CLIENT_SECRET?.trim()
  const verifyToken = env.STRAVA_VERIFY_TOKEN?.trim()
  if (!clientId || !clientSecret || !verifyToken) return null
  return { clientId, clientSecret, verifyToken }
}

/** What we ask Strava for: activities the runner lets others see. Nothing private. */
export const STRAVA_SCOPE = 'activity:read'

/** Did the runner leave the activities box ticked on Strava's screen? */
export function scopeGranted(granted: string | null | undefined): boolean {
  return (granted ?? '').split(',').map(s => s.trim()).some(s => s === 'activity:read' || s === 'activity:read_all')
}

export function authorizeUrl(cfg: StravaConfig, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state,
  })
  return `https://www.strava.com/oauth/authorize?${q.toString()}`
}

// ─── State: the trip and runner, through Strava and back ───────
//
// Signed with the client secret so a forged callback cannot link somebody
// else's Strava to somebody else's name. It carries the runner rather than
// relying on the cookie at the callback: a phone's home-screen app has its
// own cookie jar, and Strava may hand the runner back to the browser.

export type ConnectState = { tripCode: string; playerId: string; expires: number }

const b64url = (s: string) => Buffer.from(s).toString('base64url')
const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64url')

/** Ten minutes to finish on Strava's screen. */
export const STATE_TTL_MS = 10 * 60 * 1000

export function signState(s: ConnectState, secret: string): string {
  const body = b64url(JSON.stringify({ t: s.tripCode, p: s.playerId, e: s.expires }))
  return `${body}.${sign(body, secret)}`
}

/** The state if it is ours, untouched and in time; null otherwise. */
export function verifyState(raw: string | null | undefined, secret: string, now: number): ConnectState | null {
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const want = Buffer.from(sign(body, secret))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString()) as { t?: unknown; p?: unknown; e?: unknown }
    if (typeof v.t !== 'string' || typeof v.p !== 'string' || typeof v.e !== 'number') return null
    if (v.e < now) return null
    return { tripCode: v.t, playerId: v.p, expires: v.e }
  } catch {
    return null
  }
}

// ─── Activities into runs ──────────────────────────────────────

/** The fields of a Strava activity this app reads — and no others. */
export type StravaActivity = {
  id: number
  sport_type?: string
  type?: string
  start_date_local?: string
  distance?: number
  moving_time?: number
  device_name?: string | null
  external_id?: string | null
}

export type StravaRunRow = {
  strava_activity_id: number
  activity: RunActivity
  run_date: string
  distance_m: number
  moving_s: number | null
  device_name: string | null
}

/**
 * A Strava activity as a run, or null when it is not one we keep — not a
 * run, trail run, treadmill run, walk or hike; no distance; no date.
 * `sport_type` is Strava's current field; `type` is the older one, read
 * when the newer is missing.
 */
export function runFromActivity(a: StravaActivity): StravaRunRow | null {
  const activity = activityFromStrava(a.sport_type ?? a.type ?? '')
  if (!activity) return null
  const date = (a.start_date_local ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const metres = Math.round(a.distance ?? 0)
  if (!(metres > 0)) return null
  return {
    strava_activity_id: a.id,
    activity,
    run_date: date,
    distance_m: metres,
    moving_s: a.moving_time && a.moving_time > 0 ? Math.round(a.moving_time) : null,
    device_name: a.device_name?.trim() || (/garmin/i.test(a.external_id ?? '') ? 'Garmin' : null),
  }
}

/** Was this recorded on a Garmin? Strava's terms ask that it says so. */
export function isGarmin(deviceName: string | null | undefined): boolean {
  return /garmin/i.test(deviceName ?? '')
}

/** Inside the challenge's days — the same bounds the boards apply. */
export function inChallenge(date: string, start: string | null, end: string | null): boolean {
  return (!start || date >= start) && (!end || date <= end)
}

/**
 * The epoch seconds to ask Strava for activities after: the day before the
 * challenge starts, so a run early on the first morning in a timezone
 * ahead of UTC is not missed. The dates are filtered exactly afterwards.
 */
export function afterEpoch(start: string): number {
  return Math.floor(Date.parse(`${start}T00:00:00Z`) / 1000) - 86_400
}

/**
 * What one sync of one runner should do: the runs to write (every mappable
 * activity inside the challenge) and the stored Strava runs to remove
 * (ones Strava no longer lists — deleted, made private, re-typed into
 * something we do not keep). Only runs inside the window are judged, so a
 * sync can never remove a run it did not look for.
 */
export function planSync(
  fetched: StravaActivity[],
  storedIds: number[],
  window: { start: string | null; end: string | null },
): { upserts: StravaRunRow[]; deleteIds: number[] } {
  const upserts = fetched
    .map(runFromActivity)
    .filter((r): r is StravaRunRow => !!r && inChallenge(r.run_date, window.start, window.end))
  const keep = new Set(upserts.map(r => r.strava_activity_id))
  return { upserts, deleteIds: storedIds.filter(id => !keep.has(id)) }
}

// ─── Webhook events ────────────────────────────────────────────

export type WebhookAction =
  | { kind: 'refresh-activity'; athleteId: number; activityId: number }
  | { kind: 'delete-activity'; athleteId: number; activityId: number }
  | { kind: 'deauthorize'; athleteId: number }
  | { kind: 'ignore' }

/**
 * What a Strava webhook event claims. A new, edited or deleted activity is
 * re-read from Strava — an edit can change its type, its distance or make
 * it private, and a delete is believed only once Strava agrees it is gone;
 * an athlete whose `authorized` went false claims to have revoked access,
 * which is confirmed with Strava before anything of theirs goes. Strava
 * does not sign its webhook, so these are claims, not instructions
 * (lib/stravaApi.ts `handleWebhook`).
 */
export function webhookAction(raw: unknown): WebhookAction {
  if (!raw || typeof raw !== 'object') return { kind: 'ignore' }
  const e = raw as Record<string, unknown>
  const athleteId = Number(e.owner_id)
  const objectId = Number(e.object_id)
  if (!Number.isFinite(athleteId) || athleteId <= 0) return { kind: 'ignore' }

  if (e.object_type === 'athlete') {
    const updates = (e.updates ?? {}) as Record<string, unknown>
    return String(updates.authorized) === 'false' ? { kind: 'deauthorize', athleteId } : { kind: 'ignore' }
  }
  if (e.object_type === 'activity' && Number.isFinite(objectId) && objectId > 0) {
    if (e.aspect_type === 'delete') return { kind: 'delete-activity', athleteId, activityId: objectId }
    if (e.aspect_type === 'create' || e.aspect_type === 'update') {
      return { kind: 'refresh-activity', athleteId, activityId: objectId }
    }
  }
  return { kind: 'ignore' }
}

/** A token that runs out within five minutes is treated as already out. */
export function tokenNeedsRefresh(expiresAt: string | number, now: number): boolean {
  const t = typeof expiresAt === 'number' ? expiresAt * 1000 : Date.parse(expiresAt)
  return !Number.isFinite(t) || t - now < 5 * 60 * 1000
}

/** Where the callback sends a runner back to, with what happened. */
export type ConnectOutcome = 'connected' | 'denied' | 'scope' | 'taken' | 'expired' | 'error' | 'unavailable'

export function outcomeMessage(o: string | null | undefined): { ok: boolean; text: string } | null {
  switch (o) {
    case 'connected': return { ok: true, text: 'Strava connected — your runs since the start are in, and new ones will arrive by themselves.' }
    case 'denied': return { ok: false, text: 'Strava was not connected — you can try again any time.' }
    case 'scope': return { ok: false, text: 'Strava did not share your activities. Connect again and leave "View data about your activities" ticked.' }
    case 'taken': return { ok: false, text: 'That Strava account already feeds another name in this challenge.' }
    case 'expired': return { ok: false, text: 'That took a little long — tap Connect to try again.' }
    case 'unavailable': return { ok: false, text: 'Strava is not set up for this site yet.' }
    case 'error': return { ok: false, text: 'Could not connect Strava — try again.' }
    default: return null
  }
}
