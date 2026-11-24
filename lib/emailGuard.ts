// Which addresses no email is ever sent to (D308, Ross, 24 Nov 2026).
//
// The test club's fictional members are made with addresses on the
// `.invalid` domain — reserved by RFC 2606 so that nothing on the internet
// can ever answer to it. A send to one would bounce, count against Resend's
// free 100 a day, and tell Resend we mail addresses that do not exist. So
// every sender asks this first and quietly does nothing instead.
//
// The other three reserved names (`.test`, `.example`, `.localhost`) are
// refused too: no real person has one, and nothing is lost by it.
//
// Pure — `lib/sendEmail.ts` is the one sender on the server, and the
// account screens ask it before Supabase is asked to send a code.

const RESERVED_TLDS = ['invalid', 'test', 'example', 'localhost'] as const

/** True for an address nobody can receive at — the test club's, chiefly. */
export function undeliverable(address: string | null | undefined): boolean {
  const a = String(address ?? '').trim().toLowerCase().replace(/\.+$/, '')
  const at = a.lastIndexOf('@')
  if (at < 0) return false
  const domain = a.slice(at + 1)
  const tld = domain.slice(domain.lastIndexOf('.') + 1)
  return (RESERVED_TLDS as readonly string[]).includes(tld)
}

/** Said in place of sending a code to a demo account. */
export const DEMO_NO_INBOX = 'This is a demo account with no inbox — sign in with its password.'
