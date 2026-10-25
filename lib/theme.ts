// Light, dark or the phone's own setting: one class on <html>, one cookie.
//
// The design system lives in CSS custom properties (app/globals.css), so dark
// mode is not a second stylesheet — it is the same eight tokens given night
// values under `html.dark`. Every `bg-surface`, `text-ink` and `border-bark/12`
// in the app follows the tokens without knowing the theme exists.
//
// Two layers, outermost first:
//
//   · The class. `dark` on <html>, toggled here and nowhere else.
//   · The cookie. `gg_theme` is what this DEVICE prefers — `light`, `dark` or
//     `system` — read by an inline script in the <head> (THEME_BOOT_SCRIPT)
//     before first paint, so a dark phone never flashes cream on the way in.
//     No cookie means light — the site as it has always been. `system`
//     follows the phone's own light or dark setting, live.
//
// **A device preference, not a player's** (Ross, 25 Oct 2026). It used to be
// saved to `players.dark_mode` too, and behind a gear only a claimed player
// saw: a phone that went dark on one trip was dark everywhere, with the only
// way back on a hub where it had claimed a name. The gear is on every hub
// now, and the column (migration 044) is no longer read or written.
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

export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_CHOICES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/** What a document.cookie / Cookie-header string chose. Nothing chosen is light. */
export function themeChoiceOf(cookieString: string | null | undefined): ThemeChoice {
  const m = cookieString?.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=(light|dark|system)(?:;|$)`))
  return (m?.[1] as ThemeChoice | undefined) ?? 'light'
}

/** Is the page dark under this choice, with the phone set the way it is? */
export function resolvesDark(choice: ThemeChoice, systemDark: boolean): boolean {
  return choice === 'dark' || (choice === 'system' && systemDark)
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
 * second attempt. And it listens to the phone's own setting, so `system`
 * follows the phone turning dark at sunset without a reload — the cookie is
 * re-read on every change, so a choice made since then wins.
 */
export const THEME_BOOT_SCRIPT =
  `(function(){try{` +
  `var q=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');` +
  `var a=function(){var c=(document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark|system)(?:;|$)/)||[])[1];` +
  `var d=c==='dark'||(c==='system'&&!!q&&q.matches);` +
  `document.documentElement.classList.toggle('dark',d);` +
  `var e=document.querySelector('meta[name="theme-color"]');` +
  `if(e)e.setAttribute('content',d?'${DARK_THEME_COLOR}':'${LIGHT_THEME_COLOR}')};` +
  `a();document.addEventListener('DOMContentLoaded',a);` +
  `if(q&&q.addEventListener)q.addEventListener('change',a);` +
  `}catch(e){}})()`

// ─── Browser only ──────────────────────────────────────────────

/** What this device chose. */
export function currentThemeChoice(): ThemeChoice {
  if (typeof document === 'undefined') return 'light'
  return themeChoiceOf(document.cookie)
}

/** Is the phone itself set to dark? */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
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

/**
 * Choose, on this device: remembered first so the boot script's listener
 * agrees, then painted. Cookies blocked, the page still changes for this
 * view.
 */
export function chooseTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = buildCookie(THEME_COOKIE, choice, {
      days: THEME_COOKIE_DAYS,
      https: typeof location !== 'undefined' && location.protocol === 'https:',
    })
  } catch {
    // Cookies blocked. The class below still holds for this page view.
  }
  applyTheme(resolvesDark(choice, systemPrefersDark()))
}
