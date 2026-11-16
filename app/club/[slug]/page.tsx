import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ClubView from './ClubView'
import { readFace } from './face'

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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const face = await readFace(slug)
  return face ? { title: face.name } : { title: 'Not found', robots: { index: false, follow: false } }
}

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const read = await readFace(slug)
  if (!read) notFound()
  // The club's id stays on the server; the page needs only its face.
  const { id: _id, ...face } = read
  return <ClubView face={face} />
}
