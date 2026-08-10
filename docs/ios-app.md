# The iOS app

Green Dot Golf is installable as a home-screen app. This doc covers what that
means, how a player installs it, the small quirks worth knowing, and the App
Store question — which was looked at properly and deferred, not forgotten.

## What shipped

The **install layer**, nothing more: a web app manifest (`app/manifest.ts`),
real home-screen icons generated at build time from one shared drawing
(`lib/iconTile.tsx` → `app/apple-icon.tsx` for iOS, `app/icon-192` and
`app/icon-512` for Android/desktop), and Apple's install metadata in
`app/layout.tsx`.

The installed app is the live site. It loads greendot.live over the network
exactly as Safari does — same data, same deploys, nothing to update through
any store. There is **no offline mode and no service worker**, deliberately:
installing has not required one for years, and offline scoring is a future
architecture project in its own right, not a checkbox here.

The site was already app-shaped on a phone — bottom tab bar, safe-area
handling, one-handed on-course design. This layer just lets it stand on the
home screen under its own icon instead of living in a browser tab.

## How players install it

**iPhone / iPad** — in Safari, on any page of the site:

1. Tap the **Share** button (the square with the arrow).
2. Scroll down, tap **Add to Home Screen**.
3. The label offers "green dot." — tap **Add**.

The icon (the green dot on cream) lands on the home screen and launches
full-screen: no address bar, no browser buttons, the tab bar clearing the
home indicator. Worth a line in the group chat when a trip starts — nobody
discovers Add to Home Screen on their own.

**Android** — Chrome shows its own install prompt, or **⋮ → Add to Home
screen**. Same result.

## Quirks worth knowing

- **The installed app starts as a stranger.** It has its own cookie jar,
  separate from Safari's. A player who claimed their name in Safari taps
  their name once more on first launch of the installed app, and it sticks
  from then on. The admin cookie behaves the same way.
- **No reload button.** Not a problem in practice: every trip screen fetches
  fresh data on navigation, and a cold launch starts from the landing page.
- **External links** — the yr.no weather link, the support link — open in a
  Safari sheet over the app and close back into it. Fine as is.
- **Installed before a redesign?** The icon and name are baked in at install
  time; players re-add to pick up a new icon. The app's *content* is always
  current — it is the live site.

## The App Store route — considered, deferred

"In the App Store" is the other thing an iOS app can mean. It was weighed
and parked, and the reasoning matters more than the verdict:

**What it takes.** The site is server-rendered, so it cannot be bundled into
an app the way a static site can — the realistic shape is a **Capacitor
shell**: a thin native app whose one job is showing greendot.live. Building
one needs an Apple Developer account (**$99/year**), a **Mac with Xcode** to
build and submit, and an App Store review on every release — a day's wait
between "fixed" and "live" that pushing to master doesn't have.

**The real blocker is review.** Apple's guideline 4.2 ("minimum
functionality") rejects apps that are a repackaged website, and a shell that
only shows greendot.live is squarely that. What gets a wrapper approved is
real native value on top: **push notifications** ("you're up next on the
1st"), an offline scorecard, home-screen widgets. Each of those is its own
project — push alone means server infrastructure, not an afternoon.

**The honest arithmetic.** The wrapper itself is days; a version that
survives review is weeks once push infrastructure and review round-trips are
counted, plus the yearly cost and per-release friction forever after. The
home-screen install gives about 90% of the feel for 0% of that.

**When to reopen it:** when push notifications become something the trips
genuinely need, that's the feature that both justifies the store and gets
through review. Until then, this doc is the plan.
