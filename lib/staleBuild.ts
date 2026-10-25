// A phone holding an older version of the site — the only copy of how that
// is recognised and what is done about it.
//
// Every push to master is a new deployment, and Vercel stops serving the
// old one's files. A page that was already open keeps running the old
// version until it needs one more of its files — the next screen's code,
// a lazily loaded helper — and that file is gone. Next.js then shows
// "Application error: a client-side exception has occurred", and a
// refresh, which loads the new version, is the whole cure. So the site
// does the refresh itself: `StaleBuildGuard` (every page) and the error
// pages (`app/error.tsx`, `app/global-error.tsx`) reload once when the
// failure is a missing file, and show a calm message for anything else.
//
// Once per minute at most, remembered across the reload, so a failure a
// reload does not cure can never become a loop. Pure.

/** The ways a browser says a piece of the site could not be fetched. */
const STALE_PATTERNS = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
]

/** Is this the failure of a file from an older deployment? */
export function isStaleBuildError(error: unknown): boolean {
  if (!error) return false
  const e = error as { name?: unknown; message?: unknown }
  const text = [typeof e.name === 'string' ? e.name : '', typeof e.message === 'string' ? e.message : '', typeof error === 'string' ? error : '']
    .join(' ')
  return STALE_PATTERNS.some(p => p.test(text))
}

/** How long a reload is not repeated for. */
export const RELOAD_GAP_MS = 60_000

/** Reload now? Only if the last one was long enough ago — or never. */
export function shouldReload(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || !Number.isFinite(lastReloadAt) || now - lastReloadAt >= RELOAD_GAP_MS
}

const KEY = 'gd-stale-reload-at'

/**
 * Reload the page for a newer version, unless that was just tried. Browser
 * only. True when a reload is under way.
 */
export function reloadForNewVersion(now: number = Date.now()): boolean {
  let last: number | null = null
  try { last = Number(sessionStorage.getItem(KEY)) || null } catch { /* unavailable */ }
  if (!shouldReload(last, now)) return false
  try { sessionStorage.setItem(KEY, String(now)) } catch { /* unavailable — still reload once */ }
  window.location.reload()
  return true
}
