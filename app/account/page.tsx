import type { Metadata } from 'next'
import AccountScreen from './AccountScreen'

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

/**
 * The account page (stage (a), D94–D104): sign in by email and a code, sign
 * out, delete the account. Optional, always — nothing anybody needs to join,
 * play, score or watch asks for one. Static: everything is asked from the
 * phone, because the sign-in lives in the phone's own storage and the server
 * never sees it on a page load. Unlinked until `ACCOUNTS_LINKED`
 * (lib/account.ts) is switched on.
 */
export default function AccountPage() {
  return <AccountScreen />
}
