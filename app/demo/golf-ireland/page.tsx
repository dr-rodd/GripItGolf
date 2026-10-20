import type { Metadata } from 'next'
import DemoClient from './DemoClient'

/**
 * The Golf Ireland walkthrough on a page of its own — unlinked, for showing
 * how linking would work before any league can use it (no club has given
 * access yet, so no real screen reaches it). Opens straight into the
 * walkthrough; nothing here reads or writes anything.
 */

export const metadata: Metadata = {
  title: 'Linking to Golf Ireland',
  robots: { index: false, follow: false },
}

export default function GolfIrelandDemoPage() {
  return <DemoClient />
}
