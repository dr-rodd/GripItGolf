import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { clubColours, clubStyle } from '@/lib/clubColour'
import { clubAssetUrl, irishToday, publicClubEvents } from '@/lib/clubs'
import { clubStore, readClubEvents } from '@/app/api/club/store'
import ClubView, { type ClubFace } from './ClubView'

/**
 * A club's page (stage (e1), D157, D158): one address, two views. This
 * server half draws the **public face** — art, crest, name, the verified
 * tick, "<club> members: sign in", and only the club's guests-welcome events
 * — for anybody, a phone with no account included. A signed-in Green Dot
 * member on the club's list is then shown the **members home** in its place,
 * asked for after the page paints (`ClubView`, `/api/club` `home`), so no
 * members-only event, the list or the calendar ever reaches this HTML.
 *
 * An unverified or unknown club is "not found". Regenerated at most once a
 * minute (`revalidate`), so a busy club page costs a read a minute, not a
 * read a visit.
 */

export const revalidate = 60

async function readFace(slug: string): Promise<ClubFace | null> {
  const db = createAdminClient()
  const club = await clubStore(db).clubBySlug(slug).catch(() => null)
  if (!club || !club.verifiedAt) return null
  const events = await readClubEvents(db, club.id).catch(() => [])
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const colours = clubColours(club.colour)
  return {
    slug: club.slug,
    name: club.name,
    style: clubStyle(colours),
    crestUrl: clubAssetUrl(base, club.crestPath ?? null),
    artUrl: clubAssetUrl(base, club.artPath ?? null),
    artDarkUrl: clubAssetUrl(base, club.artDarkPath ?? null),
    events: publicClubEvents(events, irishToday(new Date())),
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const face = await readFace(slug)
  return face ? { title: face.name } : { title: 'Not found', robots: { index: false, follow: false } }
}

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const face = await readFace(slug)
  if (!face) notFound()
  return <ClubView face={face} />
}
