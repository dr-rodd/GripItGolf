import type { Metadata } from 'next'
import SettingsPage from './SettingsPage'

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } }

/** Settings on /home (D319): the gear opens it. Static; every card asks after it paints. */
export default function Page() {
  return <SettingsPage />
}
