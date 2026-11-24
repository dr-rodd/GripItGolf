// Which home a phone opens on (D154, stage (g)).
//
// The sign-in lives in the phone's own storage (supabase-js keeps it in
// localStorage), so the server never knows who is signed in when it sends
// greendot.live. A phone signed in to a Green Dot account keeps a **hint**
// here — `dot`, or `club:<slug>` for somebody on a verified club's list,
// with the account's other clubs after it (`club:pints|lahinch`, D218, D223:
// the first is the club last used, where the phone opens) —
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

/**
 * The two hints there are. A Club member's names their clubs' addresses,
 * nothing more: the one last used, then the others (`others`, absent on a
 * hint kept before an account could be on more than one).
 */
export type TierHint = { kind: 'dot' } | { kind: 'club'; slug: string; others?: string[] }

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
/** At most this many clubs ride in a hint — far more than anybody is on. */
export const MAX_HINT_CLUBS = 20

export function parseTierHint(raw: string | null | undefined): TierHint | null {
  if (raw === 'dot') return { kind: 'dot' }
  const m = /^club:(.+)$/.exec(raw ?? '')
  if (!m) return null
  const slugs = m[1].split('|')
  if (slugs.length > MAX_HINT_CLUBS || !slugs.every(s => SLUG.test(s))) return null
  const [slug, ...others] = slugs
  return others.length ? { kind: 'club', slug, others } : { kind: 'club', slug }
}

export function serialiseTierHint(h: TierHint): string {
  if (h.kind === 'dot') return 'dot'
  const others = (h.others ?? []).filter(s => s !== h.slug)
  return `club:${[h.slug, ...new Set(others)].slice(0, MAX_HINT_CLUBS).join('|')}`
}

/** Every club a hint names, the last used first. */
export function hintClubs(h: TierHint | null): string[] {
  return h?.kind === 'club' ? [h.slug, ...(h.others ?? []).filter(s => s !== h.slug)] : []
}

/** Where a hint sends a phone: a Club member to their club's area (D148, until (h) moves it under /home). */
export function homeOf(h: TierHint): string {
  return h.kind === 'club' ? `/club/${h.slug}` : '/home'
}

/**
 * Before the first paint, on the front page only, with nothing in the
 * address after the slash: a hinted phone goes on to its home. On `/home`
 * alone, a Club member's hint goes on to their club, so the personal page
 * never flashes first; `/home?tab=…` is the personal page asked for by name
 * (the club area's Your events, stage (h)) and stays. `replace`, so Back does not land on a page that would send
 * it straight forward again. Never throws — storage can be refused, and then
 * the page asked for shows.
 */
export const TIER_BOOT_SCRIPT =
  `(function(){try{` +
  `var p=location.pathname,f=p==='/'&&!location.search&&!location.hash,` +
  `o=p==='/home'&&!location.search,ls=localStorage,h=ls.getItem('${TIER_KEY}');` +
  // D197: at the club this phone is hinted to, the members home's stand-in
  // shows from the first paint, never the public face.
  // D223: at any club the hint names — an account may be on several.
  `var c=/^\\/club\\/([a-z0-9-]{1,60})\\/?$/.exec(p),` +
  `m=/^club:([a-z0-9-]{1,60}(?:\\|[a-z0-9-]{1,60}){0,${MAX_HINT_CLUBS - 1}})$/.exec(h||''),l=m?m[1].split('|'):[];` +
  `if(c){if(l.indexOf(c[1])>=0)document.documentElement.setAttribute('data-club-member','');return}` +
  `if(!f&&!o)return;` +
  `if(m){location.replace('/club/'+l[0]);return}` +
  // D192: no hint, but a Green Dot account's sign-in kept on this phone —
  // decided here, before the front page paints, as storedAccountSession does.
  `if(f&&!h){for(var i=0;i<(ls.length||0);i++){var k=ls.key(i)||'';if(!/^sb-.+-auth-token$/.test(k))continue;` +
  `try{var s=JSON.parse(ls.getItem(k)||'null');if(s&&s.user&&s.user.is_anonymous===false&&s.user.email){h='dot';break}}catch(e){}}}` +
  `if(f&&h==='dot')location.replace('/home');` +
  `}catch(e){}})()`

// ─── Browser only ──────────────────────────────────────────────

export function readTierHint(): TierHint | null {
  try { return parseTierHint(window.localStorage.getItem(TIER_KEY)) } catch { return null }
}

/**
 * Kept for the next open. A club hint handed in without its others keeps the
 * ones already known — this club is now the last used, the rest stay.
 */
export function rememberTier(h: TierHint) {
  try {
    const kept = h.kind === 'club' && h.others === undefined ? { ...h, others: hintClubs(readTierHint()) } : h
    window.localStorage.setItem(TIER_KEY, serialiseTierHint(kept))
  } catch { /* refused — the front page shows, nothing lost */ }
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

/**
 * "Home" for whoever holds this phone (MO1, M4 — D280): a club member's is
 * their club's home, the last club used; anybody else's the front page.
 * Read in the browser only, after mount — the hint is this phone's.
 */
export function homeHref(): string {
  const h = readTierHint()
  return h?.kind === 'club' ? `/club/${h.slug}` : '/'
}

/** Your page (D280, D319): a club member's own page at their last club; anybody else's /home/me. */
export function myPageHref(): string {
  const h = readTierHint()
  return h?.kind === 'club' ? `/club/${h.slug}/me` : '/home/me'
}
