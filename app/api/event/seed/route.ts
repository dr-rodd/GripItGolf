import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { eventReader } from '@/lib/eventReader'
import { addressOf, serviceStore } from '../../entry/store'
import { runSeed, type SeedDeps, type SeedPlayerRow } from './seed'

// POST /api/event/seed — `{ code, publicPin?, adminPin? }`: another event's
// name, whether it asks an organiser PIN, and its players, for the creation
// form's "Seed the field from another event" (app/dashboard/create/
// SeedFromEvent.tsx). The rules are ./seed.ts; this is the plumbing.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  try {
    const deps: SeedDeps = {
      async trip(code) {
        const db = eventReader(code)
        const { data, error } = await db.from('trips').select('id, name, kind, settings_passcode_hash').maybeSingle()
        if (error || !data) return null
        // The public PIN in its own read: before migration 060 there is no column.
        const pub = await db.from('trips').select('public_passcode_hash').maybeSingle()
        const row = data as { id: string; name: string; kind: string | null; settings_passcode_hash: string | null }
        return {
          id: row.id, name: row.name, kind: row.kind ?? null,
          adminHash: row.settings_passcode_hash || null,
          publicHash: pub.error ? null : ((pub.data as { public_passcode_hash?: string | null } | null)?.public_passcode_hash || null),
        }
      },
      async players(code) {
        const { data, error } = await eventReader(code).from('players')
          .select('id, name, handicap, gender').order('created_at')
        return error ? null : (data ?? []) as SeedPlayerRow[]
      },
      attempts: serviceStore(createAdminClient()),
    }
    const out = await runSeed({ code: body.code, publicPin: body.publicPin, adminPin: body.adminPin, address: addressOf(req) }, deps, new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('seed lookup failed:', e)
    return NextResponse.json({ error: 'Could not check that event — try again.' }, { status: 503, headers: NO_STORE })
  }
}
