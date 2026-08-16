// Dark mode: one class on <html>, one cookie, one column.
//
// The design system lives in CSS custom properties (app/globals.css), so dark
// mode is not a second stylesheet — it is the same eight tokens given night
// values under `html.dark`. Every `bg-surface`, `text-ink` and `border-bark/12`
// in the app follows the tokens without knowing the theme exists.
//
// Three layers, outermost first:
//
//   · The class. `dark` on <html>, toggled here and nowhere else.
//   · The cookie. `gg_theme=dark` is what this DEVICE prefers, read by an
//     inline script in the <head> (THEME_BOOT_SCRIPT) before first paint, so
//     a dark phone never flashes cream on the way in. No cookie means light —
//     the site as it has always been.
//   · The column. `players.dark_mode` is what this PLAYER chose, saved when a
//     claimed player flips the toggle on the trip hub and read back when the
//     same player opens the trip on another device. The column is the
//     preference; the cookie is only its local echo.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ PERSONALISES, never authorises — same footing as the player cookie. │
// │ Forging any of this changes the colour of a page.                   │
// └─────────────────────────────────────────────────────────────────────┘
//
// The pure parts are up top so they can be tested; the browser-only parts are
// at the bottom, the same split as lib/playerCookie.ts.

import { buildCookie } from './playerCookie'

/** One cookie for the whole site: the device is dark or it is not. */
export const THEME_COOKIE = 'gg_theme'

/** A year. A theme choice should not quietly lapse mid-season. */
export const THEME_COOKIE_DAYS = 365

/**
 * What the browser chrome is painted, per theme. The light value is the cream
 * the viewport metadata declares (app/layout.tsx); the dark value is the dark
 * cream — the two must match the `--color-cream` tokens in globals.css, and
 * test:branding holds all four against each other.
 */
export const LIGHT_THEME_COLOR = '#F6F4F0'
export const DARK_THEME_COLOR = '#1B1510'

/** Whether a document.cookie / Cookie-header string opts into dark. */
export function isDarkCookie(cookieString: string | null | undefined): boolean {
  if (!cookieString) return false
  return new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=dark(?:;|$)`).test(cookieString)
}

/**
 * Runs inline in <head>, before first paint and before React exists.
 *
 * A cookie plus a blocking script rather than server rendering, deliberately:
 * reading cookies() in the root layout would force every route dynamic,
 * including the landing page and /join, whose static-ness the landing
 * animation depends on (test:branding pins it). The script costs nothing a
 * paint can show — it runs before there is a paint.
 *
 * It also repaints the browser chrome: the theme-color <meta> is served with
 * the light value, so a dark page under a cream status bar is corrected here.
 * The meta may render after this script does, hence the DOMContentLoaded
 * second attempt.
 */
export const THEME_BOOT_SCRIPT =
  `(function(){try{` +
  `var d=/(?:^|;\\s*)${THEME_COOKIE}=dark(?:;|$)/.test(document.cookie);` +
  `if(d)document.documentElement.classList.add('dark');` +
  `var m=function(){var e=document.querySelector('meta[name="theme-color"]');` +
  `if(e)e.setAttribute('content',d?'${DARK_THEME_COLOR}':'${LIGHT_THEME_COLOR}')};` +
  `m();document.addEventListener('DOMContentLoaded',m);` +
  `}catch(e){}})()`

// ─── Browser only ──────────────────────────────────────────────

/** Is this document dark right now? The class is the single source of truth. */
export function isDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

/**
 * Paint the document one way or the other, now.
 *
 * Class and browser chrome together — a dark page under a cream status bar
 * reads as a glitch on exactly the phones this app is built for.
 */
export function applyTheme(dark: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', dark)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

/** Remember the choice on this device, so the boot script agrees next visit. */
export function rememberTheme(dark: boolean): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = buildCookie(THEME_COOKIE, dark ? 'dark' : 'light', {
      days: THEME_COOKIE_DAYS,
      https: typeof location !== 'undefined' && location.protocol === 'https:',
    })
  } catch {
    // Cookies blocked. The class above still holds for this page view.
  }
}
