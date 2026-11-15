import type { Metadata } from 'next'
import MyEventsScreen from './MyEventsScreen'

export const metadata: Metadata = {
  title: 'My events',
  robots: { index: false, follow: false },
}

/**
 * My events (stage (b1)): every event a Green Dot member owns, has entered,
 * or is linked to a player in. Static: the list is asked from the phone after
 * the page has painted — the sign-in lives in the phone's own storage, so the
 * server never sees it on a page load.
 */
export default function MyEventsPage() {
  return <MyEventsScreen />
}
