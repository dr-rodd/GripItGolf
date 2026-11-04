import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { passcodeError } from '@/lib/passcode'
import { EVENT_CODE, MAX_SEEDED_PLAYERS } from '@/lib/fieldSeed'
import { copyAcross, type Pair } from './copyAcross'

/**
 * Bringing everything across from another event (Ross, 4 Nov 2026) — run
 * once by a match play event's creation form, right after it has made the
 * event and its players, when the organiser seeded the field from an event
 * whose organiser PIN they gave (lib/fieldSeed.ts).
 *
 * What the players shared with that event comes across for the players it
 * brought in — contact details (`player_contacts`, closed to the browser,
 * which is why this is the server's), nicknames, colours and home clubs —
 * and so do its notices.
 *
 * Both events' organiser PINs are checked here, each against its own event,
 * before anything is read: the soft lock (lib/passcode.ts) and no more —
 * which the privacy notice says in as many words. Every column past the
 * core schema is copied in its own write, fail-soft, so a database short a
 * migration loses that detail and nothing else.
 */

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const refuse = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    from?: unknown; fromPin?: unknown; to?: unknown; toPin?: unknown; players?: unknown
  }
  const from = String(body.from ?? '').toUpperCase().trim()
  const to = String(body.to ?? '').toUpperCase().trim()
  const fromPin = String(body.fromPin ?? '')
  const toPin = String(body.toPin ?? '')
  if (!EVENT_CODE.test(from) || !EVENT_CODE.test(to) || from === to) return refuse('Those events could not be found.', 400)
  if (passcodeError(fromPin) || passcodeError(toPin)) return refuse('That PIN is not right.', 403)
  const pairs: Pair[] = Array.isArray(body.players)
    ? (body.players as unknown[]).flatMap(p => {
      const { from: f, to: t } = (p ?? {}) as { from?: unknown; to?: unknown }
      return typeof f === 'string' && typeof t === 'string' && UUID.test(f) && UUID.test(t) ? [{ from: f, to: t }] : []
    }).slice(0, MAX_SEEDED_PLAYERS)
    : []

  let admin
  try { admin = createAdminClient() } catch {
    return refuse('Could not copy just now — try again later.', 503)
  }

  const out = await copyAcross(admin, { from, to, fromPin, toPin, pairs })
  return NextResponse.json(out.body, { status: out.status })
}
