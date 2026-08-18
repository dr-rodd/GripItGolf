// The site intro: whether this device has been shown around the app.
//
// A newcomer's first sight of a trip hub is five tabs and a lot of nouns, so
// the hub runs a short guided lap — big green dots with cream writing, a
// friendly brown arrow pointing at the tab each one is talking about
// (app/components/SiteIntro.tsx). This file is the memory of it: one cookie
// for the whole site, like the theme's, because the intro explains the app
// rather than any one trip — seeing it once anywhere is seeing it.
//
// No cookie means a newcomer. The trip hub reads the jar on the server
// (cookies().has, in app/trip/[tripCode]/page.tsx) so the intro is in the
// first paint rather than popping in after hydration, and the first skip or
// finish writes the cookie — either one counts as seen, deliberately:
// somebody who skipped did not ask to be re-invited next visit.
//
// PERSONALISES, never authorises — same footing as the player cookie.
// Forging it shows or hides a tour.

import { buildCookie } from './playerCookie'

/** One cookie for the whole site: this device has seen the lap, or not. */
export const INTRO_COOKIE = 'gg_intro'

/** A year. Long enough that nobody is re-toured mid-season. */
export const INTRO_COOKIE_DAYS = 365

/** Whether a document.cookie / Cookie-header string has seen the intro. */
export function hasSeenIntro(cookieString: string | null | undefined): boolean {
  if (!cookieString) return false
  return new RegExp(`(?:^|;\\s*)${INTRO_COOKIE}=`).test(cookieString)
}

// ─── Browser only ──────────────────────────────────────────────

/** Remember that this device has been shown around. */
export function rememberIntroSeen(): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = buildCookie(INTRO_COOKIE, 'seen', {
      days: INTRO_COOKIE_DAYS,
      https: typeof location !== 'undefined' && location.protocol === 'https:',
    })
  } catch {
    // Cookies blocked: the intro shows again next visit, and skipping it
    // costs one tap. The least bad answer available.
  }
}
