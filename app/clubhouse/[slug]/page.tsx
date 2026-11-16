import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { clubStore } from '@/app/api/club/store'
import ClubhouseRoom from './ClubhouseRoom'

export const revalidate = 60
export const metadata: Metadata = { title: 'Clubhouse', robots: { index: false, follow: false } }

/**
 * One club's Clubhouse (stage (k0)). The page holds only the club's id and
 * name: the server cannot see who is signed in, so it paints for anybody,
 * and every row of data is asked of /api/club with the sign-in's token and
 * answered only to someone clubMay lets in. Stage (k1) puts the sidebar,
 * Overview and the Members grid here; until then it is the club's list with
 * its numbers in full.
 */
export default async function ClubhouseClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const club = await clubStore(createAdminClient()).clubBySlug(slug).catch(() => null)
  if (!club || !club.verifiedAt) notFound()
  return <ClubhouseRoom clubId={club.id} slug={club.slug} name={club.name} />
}
