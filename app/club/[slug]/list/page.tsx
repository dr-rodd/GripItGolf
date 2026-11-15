import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { clubColours, clubStyle } from '@/lib/clubColour'
import { clubStore } from '@/app/api/club/store'
import ClubScreen from '@/app/account/club/ClubScreen'

/**
 * A verified club's list and look (stage (h)): the list page moved under the
 * club, for its owners and admins, wearing the club's colour. The page holds
 * only the club's id; the list itself is asked for after it paints, and
 * `/api/club` answers it to the club's owners and admins alone. Anybody else
 * on the list is told they are on it. `/account/club?id=` comes on here for a
 * verified club; an unverified one keeps that address.
 */

export const revalidate = 60
export const metadata: Metadata = { title: 'The club’s list', robots: { index: false, follow: false } }

export default async function ClubListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const club = await clubStore(createAdminClient()).clubBySlug(slug).catch(() => null)
  if (!club || !club.verifiedAt) notFound()
  return (
    <div data-club style={clubStyle(clubColours(club.colour)) as React.CSSProperties}>
      <ClubScreen clubId={club.id} back={{ href: `/club/${club.slug}?tab=club`, label: club.name }} />
    </div>
  )
}
