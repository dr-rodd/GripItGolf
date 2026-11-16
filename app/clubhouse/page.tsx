import type { Metadata } from 'next'
import Door from './Door'

export const metadata: Metadata = {
  title: 'Clubhouse',
  robots: { index: false, follow: false },
}

/**
 * The Clubhouse's door (stage (k0), D212): one address for every sport and
 * every kind of organisation (Ross, 16 Nov 2026 — greendot.live/clubhouse,
 * not under /golf). Static: who is signed in lives on the phone, so the
 * door asks after it paints.
 */
export default function ClubhousePage() {
  return <Door />
}
