import type { Metadata } from 'next'
import HomeScreen from './HomeScreen'

export const metadata: Metadata = {
  title: 'Home',
  robots: { index: false, follow: false },
}

/**
 * A Green Dot member's home (stage (g), D148). Static: the sign-in lives in
 * the phone's own storage, so the server never sees it; the page asks once
 * after it paints. The front page sends a signed-in phone here before it
 * paints anything (lib/tierHint.ts).
 */
export default function HomePage() {
  return <HomeScreen />
}
