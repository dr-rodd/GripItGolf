import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { clubColours, clubStyle } from '@/lib/clubColour'
import { clubAssetUrl } from '@/lib/clubs'
import { clubStore } from '@/app/api/club/store'
import ClubhouseShell from './ClubhouseShell'

export const revalidate = 60
export const metadata: Metadata = { title: 'Clubhouse', robots: { index: false, follow: false } }

/**
 * One club's Clubhouse (stage (k1), D202): the sidebar drawn once for every
 * section, so moving between them never reloads the page. The server knows
 * only the club — its name, crest and colour, identity and nothing more; who
 * is signed in lives on the phone, so the shell paints for anybody and every
 * row of data is asked of /api/club with the token, checked by `clubMay`.
 */
export default async function ClubhouseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const club = await clubStore(createAdminClient()).clubBySlug(slug).catch(() => null)
  if (!club || !club.verifiedAt) notFound()
  const face = {
    id: club.id, slug: club.slug, name: club.name,
    style: clubStyle(clubColours(club.colour)),
    crestUrl: clubAssetUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, club.crestPath ?? null),
  }
  return <ClubhouseShell face={face}>{children}</ClubhouseShell>
}
