import type { Metadata } from 'next'
import CompSectionPage from '../../section'

/** A competition's Scoring (D186): a section under its Summary, the club footer's set lit here. */

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function Page({ params }: { params: Promise<{ slug: string; code: string }> }) {
  return <CompSectionPage params={params} section="scoring" />
}
