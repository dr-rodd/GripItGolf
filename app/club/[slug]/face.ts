import { createAdminClient } from '@/lib/supabase-admin'
import { clubColours, clubStyle } from '@/lib/clubColour'
import { clubAssetUrl, irishToday, publicClubEvents } from '@/lib/clubs'
import { clubStore, readClubEvents } from '@/app/api/club/store'
import type { ClubFace } from './ClubView'

// A club's face as the server draws it (D157, D158) — the club page's and a
// competition's (stage (d2)), one copy. Unverified or unknown: null.

export async function readFace(slug: string, opts: { events?: boolean } = {}): Promise<(ClubFace & { id: string }) | null> {
  const db = createAdminClient()
  const club = await clubStore(db).clubBySlug(slug).catch(() => null)
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
