import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { styledQrPng } from '@/lib/qrPng'
import { createAdminClient } from '@/lib/supabase-admin'
import { isEvent } from '@/lib/eventHub'
import {
  CONFIRMATION_FROM, QR_CID,
  confirmationSubject, confirmationHtml, confirmationText, describeRange,
} from '@/lib/confirmationEmail'

// The one confirmation email, sent.
//
// Called fire-and-forget by the creation form the moment a trip lands, and
// the words are all in lib/confirmationEmail.ts — this file is the claiming
// and the sending. It is deliberately safe to call at any time, from
// anywhere, about any trip, because everything that must not happen twice is
// guarded by the row itself:
//
// **`confirmation_sent_at` is claimed before Resend is asked** — an UPDATE
// filtered on the column still being NULL, so of two concurrent calls
// exactly one proceeds and the other finds the claim taken. A failed or
// timed-out send hands the claim back, which keeps the brief's contract:
// set on success, NULL on failure, at most one email per trip ever. The
// claim-first ordering trades the opposite risk — a send that succeeds as
// the function dies would leave the flag set and the email unsent — for
// never sending twice, which is the right trade for a courtesy email.
//
// **The payload carries the trip code and nothing else.** The recipient is
// always trips.lead_email, read here on the service role — an address in the
// request body would let anyone mail themselves any trip's invitation, so
// none is ever accepted.
//
// **Every early exit is a quiet 200.** No key configured, no address given,
// already sent, column not yet migrated: all of them mean "no email today",
// none of them is the caller's problem, and the form ignores the response
// anyway. Failures are logged server-side and nowhere else.
//
// The trip URL in the email comes from the request's own deployment origin
// (Phase 1's rule, so a preview deploy mails preview links); the logo inside
// the message is the one deliberate exception, pinned to production in
// lib/confirmationEmail.ts so it renders in inboxes whoever sent it.

export const dynamic = 'force-dynamic'

const CODE = /^[A-Z0-9]{6}$/

/** Longer than a healthy send, shorter than the function's own limit. */
const SEND_TIMEOUT_MS = 8_000

export async function POST(req: NextRequest) {
  let tripCode = ''
  try {
    const body = await req.json()
    tripCode = String(body?.tripCode ?? '').toUpperCase().trim()
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad-request' }, { status: 400 })
  }
  if (!CODE.test(tripCode)) {
    return NextResponse.json({ ok: false, reason: 'bad-code' }, { status: 400 })
  }

  // No key, no email, no fuss — the documented no-op.
  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ ok: true, reason: 'not-configured' })

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('trip-confirmation: admin client unavailable:', e)
    return NextResponse.json({ ok: true, reason: 'not-configured' })
  }

  // The kind rides in its own query, the fail-soft rule as everywhere: on a
  // database without migration 046 it errors, the error is swallowed, and
  // the message is simply a trip's — which is all such a database can hold.
  const [{ data: trip, error: tripErr }, kindResult] = await Promise.all([
    admin
      .from('trips')
      .select('id, name, trip_code, start_date, end_date, lead_email, confirmation_sent_at')
      .eq('trip_code', tripCode)
      .single(),
    admin
      .from('trips')
      .select('kind')
      .eq('trip_code', tripCode)
      .single(),
  ])

  if (tripErr || !trip) {
    if (tripErr) console.error('trip-confirmation: trip lookup failed:', tripErr)
    return NextResponse.json({ ok: false, reason: 'not-found' }, { status: 404 })
  }
  if (!trip.lead_email) return NextResponse.json({ ok: true, reason: 'no-email' })
  if (trip.confirmation_sent_at) return NextResponse.json({ ok: true, reason: 'already-sent' })

  // ── Claim before sending ──
  // Filtered on NULL so a concurrent call cannot also proceed. Before
  // migration 045 this update fails on the missing column, which is the
  // fail-soft: logged, no email, trip untouched.
  const { data: claimed, error: claimErr } = await admin
    .from('trips')
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq('id', trip.id)
    .is('confirmation_sent_at', null)
    .select('id')

  if (claimErr) {
    console.error('trip-confirmation: could not claim (migration 045 run?):', claimErr)
    return NextResponse.json({ ok: true, reason: 'not-ready' })
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, reason: 'already-sent' })
  }

  // The deployment that created the trip is the one answering this request,
  // so its origin is the link's origin — the same rule as the share button.
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('host')
  const origin = host ? `${proto}://${host}` : 'https://greendot.live'
  const tripUrl = `${origin}/trip/${trip.trip_code}`

  // An event's message carries the organiser block: the admin link, and the
  // reminder that the PIN is the one set at creation. Never the PIN itself —
  // it is hashed on the organiser's device and this server has never known
  // it, a posture the email keeps rather than trades away.
  const event = isEvent(kindResult.data?.kind)

  const details = {
    tripName: trip.name as string,
    dates: describeRange(trip.start_date ?? null, trip.end_date ?? null),
    tripUrl,
    tripCode: trip.trip_code as string,
    ...(event ? { adminUrl: `${tripUrl}/organiser` } : {}),
  }

  try {
    // The share page's QR, as pixels — dots and emerald anchors, level H,
    // drawn by lib/qrPng.ts because qr-code-styling cannot run here.
    // ~490px for a 200px slot, so it stays crisp on a retina screen.
    const qrPng = styledQrPng(tripUrl)

    const resend = new Resend(key)
    const send = resend.emails.send({
      from: CONFIRMATION_FROM,
      to: trip.lead_email,
      subject: confirmationSubject(details.tripName),
      html: confirmationHtml(details),
      text: confirmationText(details),
      attachments: [{ filename: 'trip-qr.png', content: qrPng, contentId: QR_CID }],
    })
    const result = await Promise.race([
      send,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('send timed out')), SEND_TIMEOUT_MS)),
    ])
    if (result.error) throw result.error

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('trip-confirmation: send failed:', e)
    // Hand the claim back: NULL is the truth again.
    const { error: resetErr } = await admin
      .from('trips')
      .update({ confirmation_sent_at: null })
      .eq('id', trip.id)
    if (resetErr) console.error('trip-confirmation: could not release claim:', resetErr)
    return NextResponse.json({ ok: false, reason: 'send-failed' })
  }
}
