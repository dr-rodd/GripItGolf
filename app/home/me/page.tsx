import type { Metadata } from 'next'
import MePage from './MePage'

export const metadata: Metadata = { title: 'Your page', robots: { index: false, follow: false } }

/** Your page (D319): the profile circle on /home opens it. Static; asks after it paints. */
export default function Page() {
  return <MePage />
}
