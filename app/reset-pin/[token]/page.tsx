import type { Metadata } from 'next'
import ResetPinForm from './ResetPinForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Choose a new PIN',
  robots: { index: false, follow: false },
  // The token is in this page's address: never sent on to another site.
  referrer: 'no-referrer',
}

/**
 * Forgot PIN's link (D67; Ross, 11 Nov 2026) — a new organiser PIN, from
 * the email sent to the address the event was made with. Outside the trip
 * tree, like /enter, so the event's own layout (its public PIN's door) never
 * stands in front of it. Everything is asked of /api/event/reset from the
 * page itself: the server reads nothing here and hands it nothing.
 */
export default async function ResetPinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ResetPinForm resetToken={token} />
}
