import { cookies } from 'next/headers'
import { ADMIN_COOKIE, adminPassword, verifySession } from '@/lib/adminAuth'

/**
 * The one question every admin page and action asks first: is this request
 * carrying a valid session cookie?
 *
 * Lives here rather than in lib/adminAuth.ts so that file stays pure crypto —
 * no Next imports, testable without a request. This is the only place the
 * cookie is read.
 *
 * A layout cannot do this reliably (layouts don't re-run on every navigation),
 * so each page calls it and renders <AdminLogin /> on a no, and each server
 * action calls it and refuses on a no. The cookie's path is scoped to /admin,
 * which is why admin mutations are server actions under app/admin/** rather
 * than /api routes — an action posts to the page's own URL, so the cookie
 * arrives; an /api route would never see it.
 */
export async function requireAdmin(): Promise<boolean> {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value ?? null
  return verifySession(token, adminPassword(), Date.now())
}
