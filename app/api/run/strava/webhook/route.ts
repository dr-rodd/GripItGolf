import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stravaConfig, webhookAction } from '@/lib/strava'
import { handleWebhook } from '@/lib/stravaApi'

/**
 * Strava's webhook — how runs arrive by themselves.
 *
 * GET is Strava confirming the subscription: it sends our verify token
 * (STRAVA_VERIFY_TOKEN) and a challenge, and we echo the challenge back
 * only when the token is ours.
 *
 * POST is an event: an activity created, edited or deleted, or an athlete
 * revoking access. Strava wants an answer within two seconds and retries
 * otherwise, so the answer goes straight back and the work happens after
 * (`after`, from next/server) — reading the activity, writing or removing
 * the run in every challenge that athlete feeds, or forgetting the athlete
 * entirely. What an event means is lib/strava.ts's `webhookAction`.
 *
 * Nothing in an event is trusted beyond its ids: the activity itself is
 * always re-read from Strava with the athlete's own token, so a forged
 * event can at most cause a re-read of the truth.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cfg = stravaConfig()
  const p = req.nextUrl.searchParams
  if (!cfg || p.get('hub.mode') !== 'subscribe' || p.get('hub.verify_token') !== cfg.verifyToken) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ 'hub.challenge': p.get('hub.challenge') ?? '' })
}

export async function POST(req: NextRequest) {
  const cfg = stravaConfig()
  const event = await req.json().catch(() => null)
  const action = webhookAction(event)

  if (cfg && action.kind !== 'ignore') {
    after(async () => {
      try {
        await handleWebhook(createAdminClient(), cfg, action)
      } catch (e) {
        console.error('strava webhook handling failed:', e)
      }
    })
  }
  return NextResponse.json({ ok: true })
}
