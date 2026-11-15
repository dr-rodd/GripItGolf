import type { Metadata } from 'next'
import ClubsScreen from './ClubsScreen'

export const metadata: Metadata = {
  title: 'Clubs',
  robots: { index: false, follow: false },
}

/**
 * Clubs (stage (c)): the clubs a Green Dot member is on the list of, joining
 * one by its emailed code, and setting one up. Static: everything is asked
 * from the phone after it paints.
 */
export default function ClubsPage() {
  return <ClubsScreen />
}
