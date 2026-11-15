// Which home a phone opens on (D154, stage (g)).
//
// The sign-in lives in the phone's own storage (supabase-js keeps it in
// localStorage), so the server never knows who is signed in when it sends
// greendot.live. A phone signed in to a Green Dot account keeps a **hint**
// here — `dot`, or `club:<slug>` for somebody on a verified club's list —
// and the root layout's head script reads it before the first paint: on `/`
// alone, it goes on to that home, so a member never sees the front page
// blink first.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ ONLY A HINT — never a name, never a token, never authorises.        │
// │ /home and the club page check the real sign-in, and a stale hint    │
// │ is cleared there and the front page shown.                          │
// └─────────────────────────────────────────────────────────────────────┘
//
// `/?front` (any query, or a hash) skips it, for anybody who wants the front
// page itself. The pure parts are on top for the tests; the browser's below.

export const TIER_KEY = 'gd.tier.v1'

/** The two hints there are. A Club member's names their club's address, nothing more. */
export type TierHint = { kind: 'dot' } | { kind: 'club'; slug: string }

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/

export function parseTierHint(raw: string | null | undefined): TierHint | null {
  if (raw === 'dot') return { kind: 'dot' }
  const m = /^club:(.+)$/.exec(raw ?? '')
  return m && SLUG.test(m[1]) ? { kind: 'club', slug: m[1] } : null
}

export function serialiseTierHint(h: TierHint): string {
  return h.kind === 'dot' ? 'dot' : `club:${h.slug}`
}

/** Where a hint sends a phone: a Club member to their club's area (D148, until (h) moves it under /home). */
export function homeOf(h: TierHint): string {
  return h.kind === 'club' ? `/club/${h.slug}` : '/home'
}

/**
 * Before the first paint, on the front page only, with nothing in the
 * address after the slash: a hinted phone goes on to its home. On `/home`, a
 * Club member's hint goes on to their club, so the personal page never
 * flashes first. `replace`, so Back does not land on a page that would send
 * it straight forward again. Never throws — storage can be refused, and then
 * the page asked for shows.
 */
export const TIER_BOOT_SCRIPT =
  `(function(){try{` +
  `var p=location.pathname,f=p==='/'&&!location.search&&!location.hash;` +
  `if(!f&&p!=='/home')return;` +
  `var h=localStorage.getItem('${TIER_KEY}');` +
  `var m=/^club:([a-z0-9-]{1,60})$/.exec(h||'');` +
  `if(m){location.replace('/club/'+m[1]);return}` +
  `if(f&&h==='dot')location.replace('/home');` +
  `}catch(e){}})()`

// ─── Browser only ──────────────────────────────────────────────

export function readTierHint(): TierHint | null {
  try { return parseTierHint(window.localStorage.getItem(TIER_KEY)) } catch { return null }
}

export function rememberTier(h: TierHint) {
  try { window.localStorage.setItem(TIER_KEY, serialiseTierHint(h)) } catch { /* refused — the front page shows, nothing lost */ }
}

export function forgetTier() {
  try { window.localStorage.removeItem(TIER_KEY) } catch { /* nothing to forget */ }
}

/**
 * Whether this phone appears to hold a Green Dot account's sign-in, read off
 * supabase-js's own stored session without loading it — for a phone signed
 * in before the hint existed. A guess for a redirect, never more: the page
 * it lands on checks the sign-in itself.
 */
export function storedAccountSession(): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i) ?? ''
      if (!/^sb-.+-auth-token$/.test(key)) continue
      const s = JSON.parse(window.localStorage.getItem(key) ?? 'null') as { user?: { is_anonymous?: boolean; email?: string } } | null
      if (s?.user && s.user.is_anonymous === false && !!s.user.email) return true
    }
  } catch { /* unreadable — no guess */ }
  return false
}
