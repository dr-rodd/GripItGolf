import { redirect } from 'next/navigation'

/**
 * The club's list lived here (stage (h)); since stage (k1) it is the
 * Clubhouse's Members (D207). Old links and bookmarks go on there.
 */
export default async function ClubListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/clubhouse/${slug}/members`)
}
