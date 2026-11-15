import type { Metadata } from 'next'
import ClubScreen from './ClubScreen'

export const metadata: Metadata = {
  title: 'Your club',
  robots: { index: false, follow: false },
}

/**
 * One club (`?id=`, read on the phone so the route stays static): for its
 * owners and admins, the list — add, paste, edit, send a code, remove.
 */
export default function ClubPage() {
  return <ClubScreen />
}
