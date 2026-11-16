import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { compHome, compSectionHref, sectionOfView } from '@/lib/clubBar'

/**
 * A club competition by its code alone (stage (d1), D164): the address the
 * event's own door (`/enter/<code>`) sends a competition to, so its PIN box
 * is never drawn. It finds the competition's club and goes on to the
 * competition inside the club area, `/club/<slug>/comp/<code>`, where the
 * club's list is the door (the page itself is stage (d2)).
 *
 * Anything that is not a verified club's competition is "not found" — this
 * address tells nobody whether an event exists.
 */

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CompetitionByCode({ params, searchParams }: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const code = (await params).code.trim().toUpperCase()
  const { view } = await searchParams
  if (!/^[A-Z0-9]{4,12}$/.test(code)) notFound()
  const db = createAdminClient()
  // Before 089 there is no competition column: nothing is one.
  const { data: trip, error } = await db.from('trips').select('id, competition').eq('trip_code', code).maybeSingle()
  const t = (error ? null : trip) as { id: string; competition?: string | null } | null
  if (!t || t.competition !== 'club') notFound()
  const { data: priv } = await db.from('trip_private').select('club_id').eq('trip_id', t.id).maybeSingle()
  const clubId = (priv as { club_id?: string | null } | null)?.club_id
  if (!clubId) notFound()
  const { data: club } = await db.from('clubs').select('slug, verified_at').eq('id', clubId).maybeSingle()
  const c = club as { slug: string; verified_at: string | null } | null
  if (!c?.verified_at) notFound()
  // A section asked for comes along: the card's way back is to Scoring (D190).
  const section = sectionOfView(view)
  redirect(section ? compSectionHref(c.slug, code, section) : compHome(c.slug, code))
}
