import { redirect } from 'next/navigation'
import { compSectionHref } from '@/lib/clubBar'

/**
 * The bracket inside the club is a match play's Bracket tab (D336, Ross, 25
 * Nov 2026), in the club's frame — this address, which every link the
 * event's own screens build to `/matchplay` reaches, goes there.
 */
export default async function Page({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params
  redirect(compSectionHref(slug, code, 'board'))
}
