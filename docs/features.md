# Features

## Admin overview

`/admin/trips` lists every trip on the platform, newest first: name, code, created date, lead email, player count and status. View only, linked from nowhere, `noindex`. You reach it by typing the URL.

**The lock is server-side, unlike `lib/passcode.ts`.** That distinction matters and should not be collapsed:

| | Trip settings passcode | Admin password |
|---|---|---|
| Guards | one trip's settings | every trip, and organisers' email addresses |
| Checked | in the browser | on the server |
| Secret | SHA-256 hash in a public column | `ADMIN_PASSWORD` env var, never `NEXT_PUBLIC_` |
| Session | `sessionStorage` flag | HMAC-signed httpOnly cookie, 12h |

A client-side check here would ship the password in the JS bundle and fetch the data with the anon key — no protection at all. The trip query sits below the cookie check, so a failed login never touches the data. The cookie is signed with the password itself, so it cannot be forged and changing the password logs everyone out. An unset `ADMIN_PASSWORD` fails **closed** — a misconfigured deploy is locked, not open.

Still a shared password: no per-user accounts, no audit trail, no way to revoke one person. Fine for one operator; not fine for two. `lib/adminAuth.ts`, tested adversarially in `scripts/test-admin.ts`.

## Lead player email

`trips.lead_email` (migration 020) is nullable and optional, asked once on the creation form. **It must never block trip creation** — blank, half-typed and malformed all normalise to `null` and the trip is created regardless. `lib/email.ts` is a reader, not a validator: it either recognises an address or returns null. The column carries a shape check as a guard against hand-written rows, not as validation.

Never shown to other players. Only surfaced on `/admin/trips`.

## Returning players

A player joins without an account, so a cookie is the only way to greet them next time. `lib/playerCookie.ts`, `lib/playerSummary.ts`, `WelcomeBack.tsx`.

**A cookie, not an IP address.** A household shares one IP, a club's wifi shares one across everybody in the bar, and a phone's changes on mobile data. None of that identifies a person.

**A cookie, not localStorage.** The trip hub is server-rendered, so a cookie is readable while the page is being built and the greeting is in the first paint. localStorage would mean rendering as a stranger and then correcting it — a flicker on every visit.

| | |
|---|---|
| Name | `gg_player_<TRIP_CODE>` — one per trip, so two trips can never be confused |
| Value | the player's own `players.id`; no second identifier to keep in step |
| Life | 180 days, `path=/`, `samesite=lax`, `secure` only over https |
| Set on | claiming a slot, adding yourself, and creating a trip (the organiser) |

**It is not a credential and must not become one.** It decides whose name is greeted and whose summary is shown, and every one of those facts is already visible to anyone holding the trip code. It is deliberately JavaScript-readable, since the join flow sets it in the browser. If it ever starts gating something — editing scores, seeing an email — it needs real auth behind it.

The id is checked for UUID shape and then against *this trip's* roster, so a stale, junk or copied cookie recognises nobody rather than greeting a stranger. An unrecognised visitor sees the page exactly as it was before the feature existed: no error, no empty block.

**Nothing is fetched for a stranger.** The scores and matchplay queries sit inside `if (me)`, so a first-time visitor pays nothing for a greeting they will not see.

The summary reuses `totalAfterDiscard` — the trip's own discard rule — so the hub and the leaderboard cannot disagree. A **"Not you?"** control clears the cookie: a phone gets handed round on a golf trip, and without it the first person to join on a shared handset owns that device's greeting for six months.

## Support link

An optional "support the app" link in the footer, `app/components/SupportLink.tsx`, reading `NEXT_PUBLIC_DONATION_URL`.

**Currently switched off.** `SUPPORT_ENABLED` in `lib/donation.ts` is `false`, so `donationUrl()` returns null and nothing renders on any screen. The address, the component and every check below are untouched — flipping that one constant back to `true` is the whole redeploy. It is a constant rather than a second environment variable because one feature with two switches is a feature nobody can confidently say the state of, and the variable that already exists is the address, not the decision. `test:support` follows the switch: with it off it checks that nothing renders whatever the address says, and the markup and safety checks below run again the moment it goes back on.

- **Sitewide, once inside a trip.** Every trip screen carries it — hub, leaderboard, settings, teams, players, the round picker, matchplay — not only the hub and the leaderboard. It has no server-only dependency, so it renders the same from a server page or from a `'use client'` one (settings imports it directly).
- **Never on the scoring pages.** `/trip/[tripCode]/course/[roundNumber]` and the shared `CourseDashboardClient` behind it carry no footer — it must not sit anywhere near someone entering a score. The round *picker* (`/trip/[tripCode]/course`) is not scoring itself and does carry it.
- **Unset means gone.** No link, no wrapper, no gap — `SupportLink` returns `null`, so removing the variable removes the feature completely.
- The value is sanitised before it becomes an `href` (`lib/donation.ts`). An href is one of the few places a bad string becomes executable, so `javascript:` and `data:` are refused and render nothing.
- `target="_blank"` with **both** `noopener` and `noreferrer`.
- Never a modal, banner or popup.

## The tab bar

The bottom bar (`app/components/TabBar.tsx`) is the app's primary navigation and it is on **every** screen inside a trip, score entry included: hub, leaderboard, round picker, teams, players, matchplay, settings and the scorecard itself. A screen the app's own navigation abandons reads as a dead end.

Most screens reserve the room with `has-tabbar` on their root, or the last thing on the page sits under the bar.

**Score entry reserves it differently, and has to.** `CourseDashboardClient` sizes itself against the window — `minHeight: calc(100dvh - stickyTop)` — because the score-entry card has to reach from the header down to the Next button and no further. Padding added *around* that box would make the page taller than the screen, which is exactly the bug the min-height comment there warns about: enough scroll to pull the card up off the button it is meant to sit against. So the room goes *inside* the box, as `bottomInset` → `padding-bottom`, and the Next button comes to rest just above the bar rather than beneath it.

The screens before a trip — `/`, `/join`, `/dashboard/create` — carry no bar. It is trip-scoped and there is nowhere for it to point.

**One measurement, written twice.** `TABBAR_H`/`TABBAR_SPACE` in `app/components/tabbarMetrics.ts` for TypeScript, `.has-tabbar` in `app/globals.css` for the pages that only need padding. CSS cannot import a constant, so the 64 appears in both and `test:branding` checks they agree. Its own file rather than inside `TabBar.tsx` for the same reason the header's numbers are separate: a value exported from a `'use client'` module reaches a server component as a client reference, not as the number, and the build says nothing.

`test:branding` pins the carrier list, the reservation on both kinds of screen, and the two copies of the number. It also caught a real bug while the footer was being made sitewide: `/trip/[tripCode]/matchplay` rendered its `<TabBar>` from inside the `EmptyState` component, so a drawn bracket showed neither the tab bar nor the footer — both are now rendered once, at the page's own root.

## Voiding a scorecard

`lib/scorecardVoid.ts`. **A void erases the scores, it does not merely release the players** — that is what it used to do, and the round it was meant to undo carried on standing on the leaderboard as though the card had been signed, with nothing afterwards that would ever take it off.

Two tables hold them and both go:

- `live_scores` — every hole is written here as it is entered, so a card voided halfway through has real rows in it. The trip leaderboard merges that table in by round so the board moves during play, and it has no idea a lock was released.
- `scores` — a card finalised before being voided has committed rows too, and settings offers Void on a finalised card.

**`round_handicaps` is deliberately left.** It is a snapshot, not a score: nothing appears on a leaderboard because of it, creation and adding a round both write one for every player, and starting a card overwrites it.

**Order matters, and getting it wrong fails silently.** The locks are the only record of who was on the card, so they are read first and released last. Release them first and the delete is scoped to an empty list of players: every call succeeds, and nothing at all is erased. Scoping is per player and never by round alone — two groups can be out on the same round, and voiding one must not touch the other.

Four routes in, all through the module: discarding from inside the card, voiding one from settings, taking a single player off one (their round goes with them — *unfinalising* is the opposite operation and keeps the scores), and finalising a session, which discards every card still open. `voidLiveSession` — "Clear All Live Data" — is round-wide rather than card-wide and already deleted everything on its own terms.

`test:scorecard-void` pins all of it structurally, including that no screen releases players by hand again. That is how the bug shipped: three call sites each doing the two easy deletes themselves.

## The itinerary

A trip is a drive to the coast, a tee time, another drive, a guesthouse — in that order, on a given day. `itinerary_items` (migration 021) holds that running order; `lib/itinerary.ts` is the model, pure.

**Creation is three steps** — trip details, the itinerary, players. It does not ask about teams. Whether a trip has teams at all follows from the leaderboards it runs, and those are chosen in settings; asking at creation as well gave one question two answers, and the creation one was the answer nothing read. No `teams` rows are written and every player starts with `team_id = null`.

**Creation step 2 is the itinerary builder**, replacing the old "pick a course per round" list. One day open at a time, tiles in the order they happen, and three add buttons pinned to the bottom of the screen — on a phone that is where the thumb already is.

| Kind | Carries |
|---|---|
| `golf` | course (platform list only), first tee time, number of tee times |
| `stay` | a name. Free text on purpose — an organiser knows what "the guesthouse in Ballina" means |
| `travel` | car / flight / train, from, to, duration |

**Golf items are the source of truth for rounds.** A round exists because a golf item does. On save the itinerary is written first so every row has an id, then golf items become rounds in `(day_index, position)` order — which is the order they are numbered in — each carrying `rounds.itinerary_item_id` back to the item that made it. The rounds-count picker is gone; the cap still applies, counted from the golf items.

**Positions are gapless**, renumbered on every add, delete and move. These lists are a handful of items long and a sequence you can read is worth more than avoiding a rewrite of four rows. Drag and drop reorders a day with `@dnd-kit/sortable`, press-and-hold on touch so a drag is never started by a scroll.

**The tiles slide out of the way as you drag, and settle on release.** That is `@dnd-kit/sortable` rather than plain `core` with drop targets: a list that only reorders on release leaves the reader working out afterwards what moved, and the overlay vanishing the instant a finger lifts reads as a glitch rather than a move. The transition is an inline style dnd-kit hands back, so `.itin-tile` exists purely to give the `prefers-reduced-motion` rule in globals.css something to switch off.

**A stay is entered once and lands on every night it covers** (`addStay`). Four nights in the same guesthouse is one thing an organiser knows and four tiles on the running order, because the running order is what each day looks like. Each night is a separate item with its own id, so one can be deleted or moved without disturbing the rest, and nights past the end of the trip are dropped rather than refused.

**The way forward is pinned under the add buttons**, inside the builder — the creation form hides its own CTA on that step, because two buttons competing for the bottom of the screen was the original glitch. Continue walks the days and only becomes "Proceed to Add Players" on the last one. **It is never disabled by an empty day**: a day with nothing planned on it is a normal day. Only a problem with the whole trip — no golf at all, or past the rounds cap — blocks it, and then only on the last day, as `blockedReason`.

**Counts are stepped, not typed.** A number input cannot be cleared without passing through an empty string, and coercing that back to the minimum makes the field snap to 1 the moment the digit is deleted — so it reads as only ever being 1 or 10. Tee times and nights are both `Stepper`.

The schema uses one wide table with a `kind` column and a check constraint that each kind carries its own detail and none of anyone else's — without it a half-edited row can claim to be a drive with a tee time. Verified against Postgres: 5 valid shapes accepted, 8 malformed ones refused.

### On the trip hub

`Itinerary.tsx` shows the running order and **dims what has already happened**, so the eye lands on what is next. A day whose items are all past fades as a whole; the item happening now carries the emerald tint and the live dot.

**Golf is the only thing that gets a white card.** It is what a trip is for, so it is the main event — a `bg-surface` tile with a bigger icon box and a bold title, exactly the tile creation's own builder shows. A stay or a journey is context around it, not a thing to tap: `SubtleRow` sits straight on the page with no card, no border, at roughly a third the visual weight, and reads the whole thing as "how and where" in one glance. "Past" dims the row with `opacity-50` rather than reaching for a lighter text tier — nothing below `ink/50` clears the style guide's 3:1 floor, and the golf card already used this technique before subtle rows existed.

`itemState` takes `now` as an argument and is judged by day first, then by tee time — a round is roughly four and a half hours plus ten minutes a group. The component reads the clock through `useSyncExternalStore`, bucketed to the minute: the server has no idea what time it is where the reader is, so rendering against `new Date()` directly is a hydration error, and a snapshot that changed every render would loop.

### Editing after creation

The gear icon in trip settings opens `ItineraryEditor.tsx` — the same `ItineraryBuilder` creation uses, wrapped to load what is already saved and write back only what changed. Its own full-screen overlay rather than living inside the "Trip details" sheet: the builder already pins a footer of its own to the bottom of the screen, and a second one competing with it is exactly the glitch that footer exists to avoid.

**Stays and journeys are always editable.** Nothing downstream depends on them, so add, move and remove always work.

**Golf is editable only while `canEditGolf` — no round on the trip has a score or a live session anywhere.** A course change would orphan real data, so editing golf at all is refused rather than any single edit — `ItineraryBuilder`'s `lockGolf` prop hides the remove button on golf tiles and disables the Golf add button, with a banner explaining why. `canEditGolf` is computed server-side in `setup/page.tsx` on every load, and it is checked against the scores directly: it is the only thing on that screen that locks anything, and it answers a question about the data rather than about a phase the trip is in.

**The write path never risks a round with real data in it** (`lib/itineraryStore.ts`). `lib/itinerarySync.ts` is the pure half — `diffItems` turns the edited list into inserts, updates and deletes by reusing `ItineraryBuilder`'s own `tmp-N` convention for a row that has not been saved yet, and `touchesGolf` is the same refusal check made again at the moment of the write, in case scores appeared on another device since the editor opened. The store itself:

1. Deletes what's gone.
2. Moves every surviving row to its final slot in **one** `upsert` call. `uq_itinerary_slot` is `DEFERRABLE INITIALLY DEFERRED`, so two rows swapping positions inside one statement never trips over each other — verified directly against Postgres. A sequence of separate `UPDATE`s would not have been safe: the constraint is only deferred within a single statement, and each Supabase call is its own.
3. Inserts what's new — by then, everything else is already in its final place, so a new row can only ever land in a genuinely empty slot.
4. If golf changed: deletes the round behind a removed golf item (refusing, with a message, if `scores` or `live_rounds` exist for it — the belt to `canEditGolf`'s braces), updates `course_id`/`scheduled_date` for a moved or recoursed one, and creates a fresh round — with `round_handicaps` for every current player, same placeholder formula as creation — for a new one. Existing round numbers are never renumbered; a new round simply takes the next one.

## Trip lifecycle — there isn't one

**A trip is open from the moment it exists.** Scoring and the leaderboard work as soon as there is a round to open them on, and the players, teams and format stay editable for as long as the trip does.

There used to be a `setup_status` of `draft` or `live`, flipped by a **Finalise & Go Live** button in settings. Draft locked Live Scoring and the Leaderboard on the hub; live locked the players, the teams and the format behind an **Unlock**. It was removed because it announced a state nobody needed and gated the two things a trip is for. Note the trap in removing only the button: draft was the *default*, so a trip with no way to leave it could never be scored at all — the state had to go with it.

`setup_status` still exists on `trips`. Nothing writes it, and `tripState` no longer reads it — a trip is placed by its dates alone, so a row still carrying `draft` reads like any other rather than being frozen out of its own calendar. Left in place rather than migrated away; dropping a column buys nothing and cannot be replayed safely.

**One thing still locks, and it is not a flag.** `canEditGolf` — rounds and courses are editable only while no round on the trip has a score or a live session anywhere. A course change would orphan real data, which is a fact about the data rather than a phase of the trip. It is computed server-side in `setup/page.tsx` on every load.

`edit_permission` is `everyone` or `owner`, and it is the only thing that makes settings read-only now. Owner is a device flag in localStorage (`gig-owner-<TRIP_CODE>`) written once, by `CreateTripForm`, on the device the trip was created on — a placeholder until auth lands.

**It changes what other people can do, so from the owner's own phone it appears to do nothing.** That phone is where it is set from, and `mayChange` is satisfied by `isOwner` whichever way the setting goes, so no control on the screen moves. The section says so in as many words rather than leaving it looking broken.

**A device that is not the owner cannot select "Owner only".** There is no way to hand the flag to another device, so that tap would lock the screen — including the control itself — with nothing anywhere able to undo it. The option is disabled, not just discouraged.

The flag's fragility is the known weakness: clear the browser storage, or open the trip on a new phone, and the owner is an ordinary player. With `everyone` that costs nothing. With `owner` it is a one-way door, which is why nothing can walk through it by accident. Real ownership needs auth.
