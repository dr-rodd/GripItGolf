import { redirect } from 'next/navigation'

/**
 * The club's list lived here (stage (h)); since stage (k1) it is the
 * Clubhouse's Members (D207). **This address no longer sends anybody into
 * the Clubhouse** (Ross, 17 Nov 2026: no link to the Clubhouse unless the
 * account has it) — it cannot know who is asking, so it goes to the club's
 * own page, where the Club tab offers the Clubhouse to those who hold it.
 */
export default async function ClubListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/club/${slug}`)
}
