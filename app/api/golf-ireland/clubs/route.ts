import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { clubIssue } from '@/lib/golfIreland'
import { loadClubs } from '../league'

/**
 * The clubs a league's creation form may offer: those that have given
 * Green Dot access to their members and not withdrawn it. Names and ids
 * only — the credential never leaves the server. Fails soft to an empty
 * list, which the form says plainly: no club has said yes yet.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const clubs = (await loadClubs(createAdminClient())).filter(c => !clubIssue(c))
    return NextResponse.json({ clubs: clubs.map(c => ({ clubId: c.clubId, name: c.name })) })
  } catch (e) {
    console.error('golf-ireland clubs failed:', e)
    return NextResponse.json({ clubs: [] })
  }
}
