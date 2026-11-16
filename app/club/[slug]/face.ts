import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase-admin'
import { clubColours, clubStyle } from '@/lib/clubColour'
import { clubAssetUrl, irishToday, publicClubEvents } from '@/lib/clubs'
import { clubStore, readClubEvents } from '@/app/api/club/store'
import type { ClubFace } from './ClubView'

// A club's face as the server draws it (D157, D158) — the club page's and a
// competition's (stage (d2)), one copy. Unverified or unknown: null.

/** The club's row, read once per request — the layout and the page share it. */
const clubRow = cache((slug: string) => clubStore(createAdminClient()).clubBySlug(slug).catch(() => null))

/** The club's colours as the wrapper's style (D125), for the layout's footer; null when it is not a verified club. */
export async function clubLook(slug: string): Promise<Record<string, string> | null> {
  const club = await clubRow(slug)
  return club?.verifiedAt ? clubStyle(clubColours(club.colour)) : null
}

export async function readFace(slug: string, opts: { events?: boolean } = {}): Promise<(ClubFace & { id: string }) | null> {
  const db = createAdminClient()
  const club = await clubRow(slug)
  if (!club || !club.verifiedAt) return null
  const events = opts.events === false ? [] : await readClubEvents(db, club.id).catch(() => [])
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const colours = clubColours(club.colour)
  return {
    id: club.id,
    slug: club.slug,
    name: club.name,
    style: clubStyle(colours),
    crestUrl: clubAssetUrl(base, club.crestPath ?? null),
    artUrl: clubAssetUrl(base, club.artPath ?? null),
    artDarkUrl: clubAssetUrl(base, club.artDarkPath ?? null),
    events: publicClubEvents(events, irishToday(new Date())),
  }
}
