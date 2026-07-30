'use server'

import { cookies } from 'next/headers'
import {
  ADMIN_COOKIE, SESSION_HOURS, adminPassword, isAdminConfigured,
  newSession, passwordMatches,
} from '@/lib/adminAuth'

/**
 * Log in to the admin overview.
 *
 * Runs on the server, so the password never reaches the browser and a wrong
 * guess learns nothing beyond "no". Returns a message rather than throwing —
 * a failed login is an ordinary outcome, not an error.
 */
export async function login(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  // A deliberate pause on every attempt, right or wrong. Not rate limiting —
  // this runs serverless and has no shared state to count against — but it
  // does make guessing at speed pointless, and costs a real login 400ms.
  await new Promise(r => setTimeout(r, 400))

  if (!isAdminConfigured()) {
    return { error: 'Admin access is not configured on this deployment.' }
  }

  const entered = String(formData.get('password') ?? '')
  if (!passwordMatches(entered, adminPassword())) {
    return { error: 'Incorrect password.' }
  }

  const jar = await cookies()
  jar.set(ADMIN_COOKIE, newSession(Date.now(), adminPassword() as string), {
    httpOnly: true,           // never readable from JavaScript
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',           // sent to the admin routes and nowhere else
    maxAge: SESSION_HOURS * 60 * 60,
  })
  return { error: null }
}

export async function logout(): Promise<void> {
  const jar = await cookies()
  jar.delete({ name: ADMIN_COOKIE, path: '/admin' })
}
