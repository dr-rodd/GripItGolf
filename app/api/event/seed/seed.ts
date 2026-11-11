// Seeding a new event's field from another event (lib/fieldSeed.ts) — the
// reading half, on the server (row-level security, stage 2).
//
// The creation form used to read the other event's row and players straight
// from the browser and compare both its PINs' hashes there. From stage 3 a
// phone can read only events it has entered, and the creator has never
// entered the one being seeded from — so the reading, and both PIN checks,
// happen here, on that event's reader (lib/eventReader.ts), under
// /api/entry's retry limit (`checkPin`). The browser is told whether a PIN is
// asked for, never the PIN's hash.
//
// Handed its dependencies, so `test:event-reader` runs every path on a stand-in.

import { EVENT_CODE } from '@/lib/fieldSeed'
import { checkPin, type AttemptStore } from '../../entry/entry'

export interface SeedTrip {
  id: string
  name: string
  kind: string | null
  adminHash: string | null
  publicHash: string | null
}

export interface SeedPlayerRow { id: string; name: string; handicap: number | null; gender: string | null }

export interface SeedDeps {
  trip(code: string): Promise<SeedTrip | null>
  /** The event's players, oldest first; null when they could not be read. */
  players(code: string): Promise<SeedPlayerRow[] | null>
  attempts: AttemptStore
}

export interface SeedInput {
  code: unknown
  publicPin?: unknown
  adminPin?: unknown
  address: string
}

export type SeedOutcome =
  | { status: 200; body: { needsPublicPin: true; name: string } }
  | { status: 200; body: { tripId: string; code: string; name: string; adminLocked: boolean; players: SeedPlayerRow[]; adminOk?: boolean } }
  | { status: 400 | 403 | 404 | 422 | 429 | 503; body: { error: string } }

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null)
const TOO_MANY = 'Too many tries — wait a few minutes and try again.'
const WRONG = 'That PIN is not right — try again.'

export async function runSeed(input: SeedInput, deps: SeedDeps, now: Date): Promise<SeedOutcome> {
  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : ''
  if (!EVENT_CODE.test(code)) return { status: 400, body: { error: 'An event code is six letters and numbers.' } }

  const trip = await deps.trip(code)
  if (!trip) return { status: 404, body: { error: `Could not find an event with the code ${code} — check it and try again.` } }
  if (trip.kind === 'run') return { status: 422, body: { error: 'That code is a running challenge — seed the field from a golf event.' } }

  // Its organiser PIN, when asked: "bring across everything". Checked here so
  // the browser never holds the hash (/api/event/import checks it again when
  // the event is made, as it always has) — and first, because the organiser
  // PIN opens the public door too, as it does everywhere (lib/publicPin.ts).
  let adminOk: boolean | undefined
  const adminPin = str(input.adminPin)
  if (adminPin) {
    if (!trip.adminHash) return { status: 403, body: { error: WRONG } }
    const r = await checkPin(deps.attempts, { tripId: trip.id, code, kind: 'admin', address: input.address, pin: adminPin, hash: trip.adminHash }, now)
    if (r === 'blocked') return { status: 429, body: { error: TOO_MANY } }
    if (r === 'wrong') return { status: 403, body: { error: WRONG } }
    adminOk = true
  }

  // Its public PIN, where it has one: nothing about its field is handed over
  // until it is right.
  if (trip.publicHash && !adminOk) {
    const pin = str(input.publicPin)
    if (!pin) return { status: 200, body: { needsPublicPin: true, name: trip.name } }
    const r = await checkPin(deps.attempts, { tripId: trip.id, code, kind: 'public', address: input.address, pin, hash: trip.publicHash }, now)
    if (r === 'blocked') return { status: 429, body: { error: TOO_MANY } }
    if (r === 'wrong') return { status: 403, body: { error: WRONG } }
  }

  const players = await deps.players(code)
  if (!players) return { status: 503, body: { error: 'Could not read that event’s players — try again.' } }

  return {
    status: 200,
    body: {
      tripId: trip.id, code, name: trip.name, adminLocked: !!trip.adminHash, players,
      ...(adminOk ? { adminOk } : {}),
    },
  }
}
