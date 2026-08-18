# Design system — Green Dot Collective

## The name

Your handicap is the best 8 of your last 20 rounds. On a handicap graph those eight show as green dots — so a green dot is a round that counted. Every golfer teeing off is chasing one.

The dot is part of the supplied wordmark (`public/logo.svg`) and is drawn again as a full stop closing a title — `.t-title-dot` in `app/globals.css`. There is no `GreenDot` component: the breathing dot is `.dot-live`, and it marks a card that is still open, not the brand.

**There is no gold anywhere.** `#C9A84C` was the Donegal Masters accent and is gone from every screen; emerald is the only accent, and `test:branding` fails on the old hex. Green means the dot, a live state, and a win.

Forked from Donegal Masters — a single-trip family golf app. This project converts it into a platform where anyone can run their own trip. **Its look is not the target.** The scoring screens were the last of it and have been brought onto the Green Dot system; where the two disagree, this style book wins.

`STYLE_GUIDE.md` is the source of truth; `app/globals.css` is its code. **No file outside globals.css should carry a raw brand hex.** `npm run test:branding` enforces that.

Mobile first, always. Nearly all real use is a phone, on a course, in daylight.

### Palette

| Token | Value | Use |
|---|---|---|
| `cream` | `#F6F4F0` | The page, everywhere |
| `surface` | `#FFFFFF` | Cards, the tab bar, anything raised |
| `ink` | `#2B2118` | Text — 100% primary, 80% secondary, 65% muted, 50% faint |
| `bark` | `#4A3728` | **Every** neutral, at an opacity. Borders are `bark/12`, strong `bark/25` |
| `accent` | `#0A9D56` | Emerald. Buttons, active states, win, live |
| `rust` | `#B5533C` | Loss only |

**No pure grey anywhere** — neutrals are `bark` at an opacity, never a grey hex or a Tailwind `gray-*`. **No gradients. No glows.** Emerald is an accent: one primary action per screen. A page with three emerald buttons has none.

**Every opacity is checked against the page it prints on.** `test:branding` computes the real WCAG ratio rather than trusting the ramp. Solid ink on cream is 14.3:1; the tiers above are 7.8, 4.8 and 3.1. Nothing may print below 3:1, and 65% — which carries most of the writing — clears AA outright at 4.8. The old ramp went down to 40% (2.4:1) and 25% (1.7:1), below anything WCAG calls text; 40% was the single most-used colour in the app.

**A solid emerald button rests on `accent-deep`, not `accent`.** White on the brighter emerald is 3.5:1 and dark ink on it is 4.5:1 — neither reads at button size. The deeper green is 6.6:1, and it was already that button's own hover state, so the button uses the same two colours it always did with the resting one swapped. The brighter emerald is untouched everywhere it is not behind words: the dot, the bars, tints, active states.

### Dark mode

The same tokens with night values — not a second design system. `html.dark` re-points the eight `--gd-*` properties and every `bg-surface`, `text-ink/65` and `border-bark/12` follows; a component that names a raw hex instead of a token is a bug in light mode already.

| Token | Dark value | Note |
|---|---|---|
| `cream` | `#1B1510` | Ink-dark warm brown — the page, never black or grey |
| `surface` | `#272019` | Raised, a step lighter than the page |
| `ink` | `#F2EBE2` | Warm off-white |
| `bark` | `#D9C6B2` | Neutrals invert to a light tan at the same opacities |
| `accent` | `#22B573` | Brightened to read as text on the dark page (6.8:1) |
| `accent-deep` | `#0E9151` | The balance point: ≥4:1 as a button fill under white **and** as link text on the page |
| `rust` / `rust-deep` | `#D9765B` / `#E0937D` | Lightened; rust-deep is mostly error copy and clears AA (7.4:1) |

**How it turns on.** An inline script in the `<head>` (`THEME_BOOT_SCRIPT`, `lib/theme.ts`) reads the `gg_theme` cookie and puts `dark` on `<html>` before first paint — no flash, and no `cookies()` in the root layout, which would force the landing page dynamic and break its prefetched hand-off. The script also repaints the `theme-color` meta so the browser chrome follows the page. `lib/theme.ts` is the only writer of the class and the cookie.

**Whose choice it is.** The toggle sits behind the gear on the trip hub (`PlayerSettings`), rendered only for a device that has claimed a player — personalisation belongs to a claimed player. The choice is written to `players.dark_mode` (migration 044) so it follows the player to other devices; the cookie is the device-local echo, and the column outranks it when the hub loads. Both the read and the write fail soft, so a database without the column costs only the cross-device sync.

**Two build traps hold this together, and `test:branding` pins both.** Each `--color-*` token points at a plain `--gd-*` property instead of carrying its hex — given a literal, Tailwind folds every opacity-modified utility to a baked hex at build time (`text-ink/65` became `#2b2118a6`, unreachable by any theme). And `package.json` carries a modern `browserslist` (Safari/iOS ≥ 16.4, Chrome ≥ 111) — without it, the build's CSS pass strips the `color-mix` branches those utilities compile to, and every tint quietly renders solid. The stylesheet already assumed this baseline (`100cqw`, `dvh`) before dark mode did.

**The mark's letters lift after dark.** The guide's no-recolour rule is about pages, not themes: on the dark page the artwork's brown was 1.8:1, a shadow of a logo. The wordmark's words carry their brown as a fill attribute, so `html.dark .gd-mark [fill="#4a3728"]` re-inks them in bark — an attribute override, never a filter, which would drag the emerald dot through colours that are not the brand's. The page-title marks (leaderboard., scoring., …) are two-ink PNGs and get pre-rendered dark twins instead (`scripts/make-dark-titles.py`, re-run after replacing any title artwork); `TitleMark` draws the pair and the theme picks. The dot is untouched everywhere.

### Type

Three families, one job each, never mixed. Clash Display (headlines), Bespoke Serif (body and all dense data), Archivo (buttons, labels, form fields). Use the scale classes — `t-h1` (30) `t-h2` (21) `t-card` (16) `t-body` (17) `t-data` (15) `t-label` (13) `t-cap` (13) — rather than ad-hoc sizes.

**Nothing is smaller than 13px in the scale, or 12px anywhere.** This is read one-handed, outdoors, in daylight, often by someone whose reading glasses are in the car. The old scale bottomed out at 11px and Tailwind's `text-xs` (12px) was scattered across 92 places; both are gone and `test:branding` enforces the floor, including on hand-written `text-[Npx]`.

Clash Display and Bespoke Serif are **Fontshare** fonts loaded from their CDN in `layout.tsx`; Archivo is self-hosted via `next/font`. The fallback chain degrades to a sans and a serif respectively, so a blocked CDN changes the faces but not the register.

**A title can close with the green dot** — `.t-title-dot`, an oversized emerald full stop set slightly right of the last letter and a touch below the line, the way the dot closes the wordmark. The trip name on the trip hub uses it; the face is `t-h1`, the same as every other title.

It is a **drawn circle, not the font's own period**. The mark's dot is round and a display face's full stop is as likely to be squared off, so the glyph would match on one font and not the next — and Clash Display arrives over a CDN that is allowed to fail. The proportions are the mark's own, measured off the artwork's line layout: round at ~0.38 of the text height, `0.17em` clear of the last letter, sitting on the baseline with a small nudge below it. All in `em`, so it holds at every size a title scales through.

### The wordmark

Two forms of one mark, both files, both rendered by `app/components/Wordmark.tsx` as an `<img>`. Never recreated in a webfont, never recoloured per page — brown on cream or brown on white, nothing else. Replacing either file needs no code change.

| File | Form | Where |
|---|---|---|
| `public/logo.svg` | stacked — green / dot / golf, square. **The supplied artwork.** | Landing, and the trip hub hero |
| `public/logo-line.svg` | single line — green dot. **Generated**, not drawn. | The sticky header |

**The line version is derived from the stacked one** by `scripts/make-line-logo.ts` (`npm run logo:line`). No separate line file was supplied, and the guide forbids redrawing the mark — so the generator reuses the very same paths. The export places each word in its own `<g transform="translate(x, y)">`, which makes putting "green" and "dot" on a shared baseline arithmetic on those transforms. Every curve is the original; "golf" is dropped and the emerald dot follows.

**Re-run `npm run logo:line` whenever `public/logo.svg` is replaced**, and update `WORDMARK.line.ratio` in `Wordmark.tsx` to the aspect ratio it prints.

Two things the generator learned the hard way, both visible only by rendering it:
- Spacing off the glyph *transforms* gives "greendot". The word space has to come from where the ink actually ends, so bounds are parsed out of the path data and a word space is a third of the cap height.
- Cropping to each glyph's original bounds clips the ascenders off the `d` and the `t`, because they are measured on the baseline the glyph came from rather than the one it moves to.

The supplied stacked file has a cream background baked in, a shade off our own. It is only ever shown on cream, so it stays as supplied; the generated line mark has no background, since the header has to survive a white surface.

### The sticky header

`app/components/TripHeader.tsx` — the mark at the top of every screen past the landing page, and the way back: `backTo` is the trip hub from inside a trip, and `/` from the screens that come before one. 52px, `HEADER_H` in `headerMetrics.ts` so the leaderboard's own sticky column row can clear it.

**The mark itself is sized by `LINE_W`, not by the bar's height.** `HEADER_H` is the right height for the bar; the mark inside it wants to be bigger than that alone implies, or the bar reads as mostly whitespace. `LINE_W` (132) sets the line mark's width, and its height follows the artwork's own ratio — every named-page title (`TitleMark`) sizes off that same derived height, so bumping one bumps all of them together.

**A row that pins under the header does not have to be the row you scrolled past.** The stats hub's choosers — Players/Courses, the player chips, the course picker — used to pin as a block, holding roughly a third of a phone screen above every figure on the page. They now scroll away, and a single line pins in their place: the player from the left where the chips sat, the course from the right, meeting in the middle, so the movement says *these are those rows folded up* rather than *here is a new thing*. Tapping it scrolls back; nothing else on it is tappable, because a bar that both scrolls the page and holds a control is a bar where half the taps do the wrong thing.

Two mechanics worth copying. It is **fixed, not sticky** — a sticky element holds its space in the flow whether it is stuck or not, so a sticky version would leave a band of empty cream under the controls for the length of the page. And it is swapped by an **`IntersectionObserver` on the controls** with `rootMargin: -HEADER_H`, not a scroll handler: two firings instead of one per frame of a flick, and the margin is what makes "off screen" mean off the part of the screen that is not already behind the header.

**The board card must not carry `overflow-hidden`.** `position: sticky` measures its offset from the nearest scrollport, and an ancestor with `overflow: hidden` is one — so `top: HEADER_H` counted from the card's own top edge rather than the viewport's, and dropped the column headings 52px down the card onto whoever was leading. The corners round without it; `test:scorecard` pins it.

The mark is the same on every screen; what changes is the word in it.

**Settled everywhere.** The mark sits in the bar from the first pixel and never moves. These screens are read standing on a tee, and nothing on them should move that is not a score. `TripHeader` renders the position it is handed and has no opinion about what moves the mark — which is what let the driver change from a scrollbar to a tap without touching the animation itself.

**A page can wear its own name instead of the mark.** `TitleMark.tsx` holds the supplied lettering — `leaderboard.` `settings.` `scoring.` — each closed by the emerald dot the way the wordmark is, set at the same height and the same left inset as the line mark settles at. So moving between screens changes the word and nothing else. A named page never morphs: there is no stacked form of "leaderboard." to collapse out of, and the word is a label rather than a brand moment.

All four are cropped to one shared baseline and one common height, so the descender in `scoring.` does not make it sit differently from `leaderboard.`; only the width varies, which is why each carries its own ratio and the header sizes by height. `trip.` is drawn and kept but **not in use** — the trip hub shows the green dot.

They are PNGs derived from the supplied artwork rather than vectors. Rendered as `<img>` for the same reason as the wordmark, so dropping in an SVG of the same proportions needs no code change.

**The header's numbers live in `headerMetrics.ts`, not in `TripHeader.tsx`.** A value exported from a `'use client'` module arrives in a server component as a client *reference*, not as the number, and dropping one into a template literal writes a stub function into the markup. TypeScript sees a number the whole way through and the build says nothing — the only symptom is a style attribute full of nonsense in the rendered page. `test:branding` pins the module as non-client and the import path with it.

**The scoring screens have two sticky headers, and the depth of them is measured, never typed.** `CourseDashboardClient.tsx` draws its own back-button-plus-title bar *and*, on a trip route, sits underneath `TripHeader` as well. Everything below — `LiveScoringFlow`'s sticky sub-headers, `LiveLeaderboardPanel`'s column headings, and the score-entry card that reaches down to the fixed Next bar — needs to know where that chrome ends. There is no single number for it:

| | site header | shell's own header | total |
|---|---|---|---|
| trip route, live board | 52 | 77 | **129** |
| trip route, score entry | 52 | 173 (title + hole progress + board banner) | **225** |
| trip route, two-line course name | 52 | 185 | **237** |
| legacy `/scoring/[slug]` | — | 77 | **77** |

So the shell measures its own header with a `ResizeObserver`, adds the `stickyTop` it was handed by the route above it, and publishes the total as the `--scoring-chrome` custom property on its root; `app/scoring/scoringHeaderMetrics.ts` holds the property's name and the fallback. **Do not put a constant back.** The same bug has been introduced twice from opposite directions — once against `HEADER_H` (52, the site header alone) and once against a hardcoded 77 (the shell's title row alone) — because each is genuinely correct on one screen. The 52 left the board's column headings clinging 25px early; the 77 made the score-entry card 148px taller than the space it had and pushed it down behind the Next bar. `test:branding` now fails if any sticky offset or `100dvh` subtraction in the scoring flow is written as a literal.

Two things follow from the same reading. The shell's root is `calc(100dvh - stickyTop)`, not `min-h-dvh` — a full window's height *below* a 52px header makes every scoring screen a header taller than the window, which is enough scroll to pull the card back off the button. And no view but the dashboard reserves a right-hand slot in the header: the title is left-aligned beside the back button and nothing is centred against that slot, so an 80px reservation only cost the course name a quarter of the row.

The standalone dark-themed `/scoring` route (`ScoringClient.tsx`) renders `LiveScoringFlow` without the shell around it, so it never publishes the property and gets the 77px fallback. Its own header is shorter again (`py-2`, not `py-4`); that gap is untouched debt, left as it was.

### Leaving the landing page

**The collapse runs on the tap, not on a scroll** (`app/Landing.tsx`). Tapping Create or Join fades the content, the words **shake themselves loose in place** over `WOBBLE_MS` (340ms), the mark then collapses into the header bar over `TRAVEL_MS` (700ms), and only then is the next screen asked for — fading up underneath, so the whole thing reads as one movement rather than a page swap.

A timed animation runs at the speed it was written to run at. One driven by a finger runs at whatever speed the finger moves and can stop halfway, which is what the scroll version did.

**The shake is enveloped by a half sine**, so it grows out of stillness and settles back into it — that is what lets it hand over to the travel without a seam. Each word is a quarter-cycle behind the last (`WOBBLE_DEG`, `WOBBLE_CYCLES` in `MorphWordmark.tsx`), so the mark loosens rather than rocking as one block. Measured peak: 2.4° at 217ms.

**The driver is smoothed, not linear.** Each word already decelerates inside its own window, but the sequence as a whole ran at a constant rate and so set off at full speed the instant the shake ended.

**This is a deliberate exception to the 400ms ceiling** the guide sets for UI motion. It is a page transition with a shake in front of it, not a control responding to a touch. `test:branding` pins it as an exception rather than a violation — the move must be *over* 400ms, and the whole sequence under 1400ms so it cannot creep.

- Both destinations are **prefetched on mount** and carry `page-enter`, so the pause after the mark lands is as near to nothing as it can be and the arrival fades rather than appears.
- **Both are static routes, deliberately.** A dynamic route cannot be prefetched whole, so arriving at one is a server round trip that lands *after* the animation has finished and reads as a gap. Measured: 480ms on `/join`, 314ms on `/dashboard/create` — the latter with a database query in front of it. Making them static took both to ~110ms. `/join` reads `?code=` from the URL on the client (`useSyncExternalStore`, so the server renders empty and the browser fills it in without a mismatch) rather than from `searchParams`; `/dashboard/create` fetches the platform course list in the form rather than on the server, and does not need it until step two anyway. Neither may take `force-dynamic`, read `searchParams`, or query anything — `test:branding` pins all three.
- **The fade starts below the header, not at the top of the page.** With `page-enter` on the whole page the mark blinked out and back for ~170ms on arrival, because the destination's header was inside the fade. The mark is in exactly the same place on both sides of the handover, so it must simply stay put.
- The clock comes from the animation frame itself, not a reading taken beforehand, so the first frame is t=0 however long the browser took to schedule it. One clock drives both phases, so they cannot drift apart.
- A second tap cannot start a second animation over the first.
- **Reduced motion goes straight there** — no shake, no collapse, no fade.
- The buttons stay real `<Link>`s, so they prefetch, survive a long press, and navigate normally without JavaScript.

**The screens the mark lands on wear it too.** `/join` and `/dashboard/create` carry `<TripHeader backTo="/" />` — the same bar, the same mark, in the same place it just travelled to. That is what makes the collapse mean something: it is not decoration, it is showing you where the mark lives from here on, and why `green dot golf` became `green dot`. Tapping it goes home, so neither screen has a back button of its own.

The create wizard keeps a **step**-back on steps 2 and 3, which is a different thing from site navigation: the mark goes home, that goes to the answers you just gave. Losing a half-filled form to a logo would be a poor trade for one fewer button.

`useScrollProgress` and `HeroPin` are gone with the scroll version, along with `TRAVEL` and `RELEASE_AT`. The landing page no longer scrolls at all.

### Navigation

Bottom tab bar, `app/components/TabBar.tsx` — Home · Scoring · **Leaderboard** · Stats · Trip Setup, scoped to a trip. Five identical tabs; the leaderboard holds the centre, and position is the whole of the emphasis — the emerald circle around it was tried and retired the same day (label dropped, label back, alignment sideways: more trouble than it was worth). All five labels are 11px; "Leaderboard" is the tight one at ~62px of a 64px column on a 320px phone, measured rather than assumed. Fixed to the bottom with `env(safe-area-inset-bottom)` — which is only a real number because the root layout declares `viewport-fit=cover`; without that iOS reports every inset as zero. Pages carrying it add `has-tabbar` for clearance.

**Three separate things keep it pinned, and they are not interchangeable.** The bar drifting off the bottom edge looked like one bug and was not:

- **A transformed ancestor** would scope `fixed` to it and the bar would scroll away with the page outright. Never the cause here — the nav's only ancestors are `html` and `body` — but it is the first thing to rule out, because it looks identical and it is the one cause that is a real bug.
- **The rubber-band.** Dragging past the end of a page on iOS translates the whole visual viewport rather than scrolling further, and a fixed element goes with it. `overscroll-behavior-y: none` on `html` forbids it — **on the root element only**: it propagates to the viewport from `html` and does not from `body`, unlike `overflow`. Costs pull-to-refresh, which this app never used.
- **The toolbar-collapse lag**, which nothing can forbid. Safari shrinks its own bottom toolbar as you scroll and repositions fixed elements a frame or two behind that animation. So the bar **paints 80px below itself** — `padding-bottom` grows by it, `margin-bottom` takes exactly the same amount back, leaving its top edge, its on-screen height and the room `.has-tabbar` reserves all unchanged. What a lagging frame exposes is more bar rather than the page behind it. The margin giving back precisely what the padding took is pinned in `test:branding`; if it ever stops, the reserved room silently stops matching the bar.

Deliberately **absent from the scoring flow**, where the bottom of the screen is score entry and a nav bar under it is a mis-tap waiting to happen.

**Drawn once, by `app/trip/[tripCode]/layout.tsx`, and never by a page.** It was ten copies, one per page, and a component rendered by a page unmounts when that page does — so tapping a tab tore the bar off the screen and drew a new one once the next page's queries came back. Pages still carry `has-tabbar`, because the page is what scrolls. `test:branding` pins both halves: the layout has the bar, no page does.

**A tab lights on the touch, not on arrival.** `active` comes from the pathname, and the pathname does not change until the destination has rendered on the server — which on these screens is a database round trip away. Lighting on `active` alone meant a tap looked like nothing at all for as long as the query took, and what that earns is a second tap. So a tab is lit when it is `active` **or** `pending` (`useLinkStatus`), and while it is pending it breathes at 900ms. The press itself is a `scale(0.94)` transform rather than a colour, because the colour is already carrying "you are here" and a second meaning on the same property reads as neither.

**That press is driven from a pointer handler, never from CSS `:active`** — `test:branding` pins the absence. `:active` matches the element being activated and its *ancestors*, never its descendants, so a rule on the tab's content cannot fire for a press on the link around it; and iOS Safari withholds `:active` from an element with no touch handler nearby, which is this bar on the phone the app is built for. The obvious version is dead CSS twice over. `onPointerUp`, `onPointerCancel` and `onPointerLeave` all release it, because a press can end without a release — a finger sliding off the tab, or a scroll claiming the gesture, would otherwise leave it held down for good.

### Arriving

**Every trip route has a `loading.tsx`, and that is what makes a tab feel instant.** Without one anywhere under a route, Next holds the page you are looking at — fully painted, fully interactive — until the *next* page has finished rendering on the server. Every trip screen is `force-dynamic` with real queries behind it, so that was two or three seconds in which nothing on screen acknowledged the tap. With the file, the router commits on the touch: the tab moves, the header changes, and a skeleton stands in.

It is also the only thing on these routes that *should* be prefetched, and that is a correctness rule rather than a tuning one. **The bar's links stay on the default prefetch, never `prefetch` outright.** Forcing it fetches the whole payload of a dynamic route, and the hub, the stats page and a round summary are all personalised on the server from the returning-player cookie — so what lands in the cache is that page *as this device was when the prefetch went out*. The bar is on the join screen too, which is the worst possible moment for it: it warms the hub as a stranger while somebody is standing on the page about to claim a name, and the claim then arrives at a cached "Claim your spot". The default warms the loading state and the layout and stops there, a skeleton has nobody's name in it, and that is where the whole speed benefit was anyway. `test:claim` pins it.

Five files, and the split is about shape rather than about routes:

| File | Draws |
|---|---|
| `trip/[tripCode]/loading.tsx` | The fallback for the hub, teams, players, matchplay and a round summary. Deliberately vague — see below |
| `…/stats/loading.tsx` | The two-way choice, a chip row, then boxes — the shape that is always true of the instrument. Earned its own file when the bar gained a Stats tab |
| `…/leaderboard/loading.tsx` | Tab strip, then eight rows. The slowest page in the app and the most predictable |
| `…/scoring/loading.tsx` | Three round tiles |
| `…/scoring/[roundNumber]/loading.tsx` | A player strip and a hole. Its own file because a loading state covers the segments below it, and three round tiles is the wrong promise to make about a scorecard |
| `…/setup/loading.tsx` | Its own only so the header carries the right word |

**A skeleton that promises a specific shape and is wrong about it is worse than one that promises a screen's worth of something.** The eye follows the blocks into place, and blocks that then jump somewhere else read as a fault. So the generic one commits to nothing but a heading and three cards, and only the screens whose shape is genuinely fixed draw it.

None of them takes `backTo` on the header: `loading.tsx` is handed no params, so there is no trip code to build the href from. The back link is an invisible overlay on the header bar, so leaving it out looks identical and costs one tap target for the second the skeleton is up.

### Motion

`ease-out` everywhere. Micro 120–180ms, larger 250–350ms, nothing over 400ms. **No bounce, no spring, no elastic easing.** Pages fade in over 200ms (`page-enter`). A changed live score flashes its cell emerald and fades (`score-flash`) — it never moves, because it is being read. Every animation is stilled under `prefers-reduced-motion`.

**The site intro is the second documented exception, after the landing page's collapse.** The travelling dot (`app/components/SiteIntro.tsx`) is a guided tour, not a control answering a touch: its travels run 480–550ms on one strong ease-out — `cubic-bezier(0.16, 1, 0.3, 1)`, named the putt curve in the component: quick off the face, a long confident deceleration — and each arrival overshoots its final scale by 2% before settling, which is the one place the no-bounce rule bends. Both are scoped to that component and to nothing else: the durations and the curve live in the component rather than in this stylesheet, so `test:branding`'s ceilings over `globals.css` still hold everything ordinary to 400ms, and its six-second idle drift lives there for the same reason — it is far slower than a breath on purpose, almost subliminal. Under `prefers-reduced-motion` the whole choreography collapses to steps appearing in place. Nothing outside the intro may borrow the curve, the overshoot, or the durations.

**The 400ms ceiling is about motion answering a touch.** A repeating animation is a different thing — the live dot's breath (2s), a skeleton's pulse (1.4s), a tab bar tab waiting for its page (900ms). It is not responding to a gesture and has no ending to be late for, so it runs slower on purpose and sits between 900ms and 2s. `test:branding` holds the two apart by whether the declaration says `infinite`. It used to hold only the first ceiling, and only over durations written in `ms` — which is why `2s` and `1.4s` were never checked at all. Both are now, in either unit.

**There is one repeat that is not a breath, and it is named rather than left as a gap.** A leaderboard name too long for its column glides out and back on its own (`.name-scroll-track`, driven by `ScrollingName` in `TripLeaderboardClient.tsx`). That is a journey at a reading pace, not a pulse, so a two-second ceiling would whip it past unread; `test:branding` lifts it out of the breath rule by name. **It only ever runs on a name that measured wider than its column**: a board where every name fits is a board where nothing moves, and a leaderboard that fidgets for no reason is worse than one that clips.

**Its timing is one figure for the whole board, and that is the correction that mattered.** The first version set the duration per name from how far that name had to travel, keeping a constant pace. Four names of four lengths then ran four cycles that slid in and out of step with each other for ever — as a table it read worse than the clipping it replaced. Every name now leaves and returns together and a longer one simply covers more ground in the same time. Sharing a duration is not the same as sharing a phase, so a negative `animationDelay` anchors each track to one clock: a name that starts animating late — a column resized, a board switched — lands exactly where the others already are, and recomputing the anchor is harmless because the phase it produces is the phase already on screen. The stylesheet holds the figure and `NAME_SCROLL_MS` repeats it for the anchor; `test:branding` holds the two against each other so neither can drift.

The first answer to a long name was to make the cell a drag strip, the way the round columns work. It never worked in a hand: every row is a `<button>`, so a short sideways drag ends as a click and expands the row instead of moving the name — and nothing said there was more of the name to find. The drag comes back only under `prefers-reduced-motion`, where it is the worse gesture but the only one left.

**Note that the duration checks read the file including its comments**, because `globals.css` is nine-tenths prose and stripping them would let a real declaration hide inside one. So a comment cannot mention a duration over 400ms in figures. `dot-live`'s note says "two seconds" in words for exactly this reason.

#### `.press` — the tap that answers

A phone gives no feedback of its own, so a card that does nothing under a finger reads as one that did not register the touch, and the second tap that gets is the real cost. `.press` is the one copy: `scale(0.97)` on `:active` over 120ms. It sits on the shared `Button` (`app/components/ui.tsx`), the round tiles, the itinerary tiles, the status card and the join rows.

Three things about it are deliberate:

- **0.97, not the tab bar's 0.94.** These are cards and rows the width of the screen; the bar's ratio on something that size is a lurch rather than a press.
- **`:active`, unlike the tab bar** — and that is not an inconsistency. The bar cannot use `:active` because it never reaches descendants and iOS withholds it from elements it does not consider interactive. Neither applies to a class sitting on the tapped `<button>` or `<a>` itself. Put `.press` on a `<div>` and it will do nothing on an iPhone; that is the rule.
- **It owns the whole transition on whatever carries it.** A rule naming only `transform` sits later in the file than Tailwind's utilities and would win, so a button with `.press` *and* `transition-colors` would quietly lose its colour fade. `.press` names the colour properties too, which is why anything carrying it should drop its own `transition-*` rather than keep a second answer.

**Rows inside the leaderboard's scroller keep `active:opacity`, on purpose.** The board is one horizontal scroller with pinned columns either side; a row that scales breaks its alignment with the Name and Total columns holding still beside it. Scale is for things shaped like cards.

#### Where `score-flash` actually fires

It is on the live leaderboard panel inside the scoring card (`app/scoring/LiveLeaderboardPanel.tsx`), and nowhere else. That panel refreshes on a fifteen-second timer *and* on a Supabase realtime channel, so scores land with no gesture in front of them — a group watching the board on the fifth green sees a number that differs from the one they last read and cannot tell whether it changed or they misread it.

Two details that are the whole implementation:

- **The change is detected per hole, not per total.** Two holes that offset each other leave the total where it was, and the player still scored. The comparison is against the last set the component fetched, held in a ref, so a second fetch landing before a render cannot miss one.
- **A counter, not a boolean, and it goes in the row's `key`.** A CSS animation only replays if the element is new, so bumping the number is what remounts the row and runs it again. The counter is undefined until a change is actually seen, so opening the board does not flash every row at once — arriving is not news, changing is.

The keyframe animates colour and never `transform`, because the number is being read; `test:branding` pins the absence.

#### Reduced motion means all of it now

For a long time the block switched off six named `animation`s and never touched a `transition` — so every Tailwind `transition-*` in the app still ran at full speed for somebody who had asked the operating system for less: the hub sections' collapse (whose own comment claimed otherwise), the scoring card's sideways slide, the toggle knob, every `active:scale`. There is a blanket `*` rule now, collapsing `animation-duration` and `transition-duration` to a hundredth of a millisecond rather than to zero, so anything waiting on a `transitionend` still gets one. The named rules stay beside it: they are more specific about intent, and the branding test reads them by name.

### Scoring symbols

**Filled, never outlined** — `app/components/ScoreShape.tsx`, one component used by every card in the app so a birdie cannot look like one thing in the scoring flow and another on the leaderboard.

| Score | Mark |
|---|---|
| Eagle or better | solid `accent-deep` disc, white numeral |
| Birdie | `accent/25` disc |
| Par | the bare number, nothing behind it |
| Bogey | `bark/[0.10]` rounded square |
| Double or worse | the same square at `bark/[0.20]` |
| No return | `rust/15`, and never a number |

The old card drew rings and boxes in thin strokes, which turned a scorecard into a grid of outlines and made a bogey look like an event. **Most amateur holes are a bogey or a double**, so those two are a wash of bark low enough to group by eye and no more; the colour goes where the emphasis belongs, under par. `test:scorecard` pins the ordering and the ceiling so they cannot creep up.

The scoring screens are the cream system now — white cards on cream, **bark** summary bands, bark rules. The Out / In / Total bands and the course banner are a wash of bark (`SC_BAND`, 7%), not emerald: green is the accent, and a scorecard that is half green stops the accent meaning anything. **Tee swatches keep their real colours**, because a blue tee is blue: they are data, not brand, and each carries a hairline ring so the pale ones survive a white card.

- Touch targets minimum 48px
- Leaderboard, scoring and bracket screens stay tight (4–16px). Generous spacing is for entry screens only

### Choosing a round

Two screens offer a round to open — the scoring picker (`/trip/[code]/scoring`) and the list that drops out of a leaderboard row. Same question, so `lib/roundState.ts` gives them one answer. Both are the app's white card; only the border changes.

| State | Border | Means |
|---|---|---|
| `empty` | barely there, `bark/[0.08]` | nothing scored. Not news, so it does not shout |
| `live` | `border-2 border-accent`, **and a glow** | a card is open on it right now |
| `played` | `border-2 border-bark/45` | scores in, nothing open. Finished is a fact, not an event |

**`live` wins over `played`.** A round can carry committed scores from the group that finished and an open card from the group still out; the open card is the thing worth knowing.

**The glow is the one in the app**, and a deliberate exception to "no glows". The rule was written against cream on cream, where a glow reads as a smudge; this is a white card on cream, and a round in play is the thing worth spotting with the phone face-up on a bar table. `test:branding` pins it as an exception rather than allowing glows generally — exactly one `shadow-[0_0_…]`, in `lib/roundState.ts`, on the `live` state only. Anything else that glows still fails.

**The picker reads what is recorded, not `rounds.status`.** That column is set by hand and drifts, and this is the screen someone checks on the way to the first tee — so it asks `live_rounds` what is open and `scores`/`live_scores` what has been entered.

### The three scorecards

There are three, for three different jobs, and `app/components/scorecardStyle.ts` is what they have in common — the surface, the rules, the bands, the tee swatches. What they show differs; what they look like must not, or one round reads as three documents depending which screen found it.

| Card | Where | What it adds |
|---|---|---|
| Live drop-down | opened from a row of the live leaderboard | **no name** — the row above is the name. PH and tee instead |
| End of round | the last look before a score is committed | **no name** when the selector tiles above are showing it; tee and PH always |
| Pop-up | the trip leaderboard, one player or a whole team | one player: PH only, the title is the name. A team: every member and their handicap |

**White, with alternating rows nudged towards the page's cream.** The card is the brightest thing on screen so the browns sit on it properly, which is why the parchment came off in the first place. A flat tint, not a literal gradient — `test:branding` bans those, and a wash between white and cream is the effect anyway.

**The bands are bark.** Out and In at 5%, the total at 10%. Two of the three cards still banded them in Donegal gold (`rgba(201,168,76,…)`, which is `#C9A84C` in a spelling the branding test's hex check did not catch).

**A hole played for nothing prints a nought.** Testing the total alone conflated "nobody has reached this hole" with "this hole was played and scored nothing", and a wiped-out hole is exactly the one worth being able to see.

**A team card scrolls past three players.** The member list is capped at a couple of lines and scrolls; the player columns scroll sideways while **Hole / Par and the team's points hold still** — the same synced-strip arrangement the trip board's round columns use, for the same reason (see `docs/leaderboards.md`). `Row` is declared at module level: it wraps the strips, so inside the sheet it would be a new component type every render and React would take the scroll position with it.

**Tee swatches keep their real colours** — a blue tee is blue, they are data not brand. That is the one grey the branding test exempts, by file, so a grey creeping in anywhere else is still caught. `round_handicaps.tee_id` is written when a session *starts*, not only when it is committed: the live leaderboard's card names the tee mid-round, and waiting for the card to be signed is too late for the one screen that exists to be read while playing.
