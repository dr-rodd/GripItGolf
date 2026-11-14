# Pending concepts

Ideas Ross has agreed are good but has not asked to be built yet. Each is
kept here whole enough to be picked up cold by a later session: what it is,
why it came up, what it would touch, and the questions to settle first.
When one is built, move its decisions into the doc that owns that area and
delete it from here.

## Golfer of the Year for clubs

**Where it came from.** The November 2026 session on the tournament create
flow (Ross, 8 Nov): a series covers a society's season or a club's Golfer
of the Year, and a club product would want the second built for it.

**What it is.** If Green Dot is ever a product for clubs, link the club's
competitions for the year as a series, the organiser marking each
competition eligible or ineligible, so a Golfer of the Year standing builds
itself from the eligible ones.

**What it builds on.** The series (`LeagueSetup.repeat`, ad hoc rounds, a
round that does not count via `rounds.casual`) and Golf Ireland's cards
filed to rounds by date and venue (`roundForCard` in
`lib/golfIrelandCards.ts`).

**Questions first.** How a club's competition list arrives (Golf Ireland,
or entered by hand); whether eligibility is per competition or by rule (all
medals, no opens); points by position or Stableford totals.

## Handicap cuts between rounds

**Where it came from.** The winter league (`docs/event-use-cases.md`, use
case 1). Ross's note asked to "change handicap increment for individual
days"; the per-round setting turned out to be the handicap *allowance*
(stage 3's gear), and a *cut* was agreed to be a good idea of its own,
October 2026.

**What it is.** A winter league's own adjustment of a player's handicap
after a result, the way club and society leagues keep the same winners
from winning every week: the winner of a round plays the next one off, say,
two shots less, the runner-up one shot less. Some leagues restore the cut
after a run of rounds without a placing, or cap the total cut.

**Why it is not an allowance.** An allowance is a percentage applied when a
board reads the cards, never stored (`lib/handicapAllowance.ts`). A cut is
a fact about a player that carries forward from one round to the next and
depends on results, so it changes what the *next* round's card is scored
off. It sits between the handicap index and the board.

**What it would touch.**

- Where the cut lives. Probably per player per round, beside the
  `round_handicaps` snapshot, or as a league-level adjustment the snapshot
  is computed from. Never by overwriting `players.handicap`, which is the
  player's real index and is shared with every other screen.
- When it is applied. After a round is final (its cards committed), the
  next round's snapshots are re-written with the cut in. A round already
  started must not have its handicaps moved under it
  (`docs/gotchas-and-debt.md` on mid-round snapshots).
- The Stableford trigger and the canonical formula are untouched: a cut
  changes the handicap fed in, not the maths.
- The organiser's rules: how many shots for 1st, 2nd, 3rd; whether cuts
  accumulate; a cap; whether a cut is ever restored; whether a round that
  does not count (stage 2) can cut.
- Saying it on screen: the player's card and the board should show "off
  12 (−2 cut)" so nobody thinks the handicap was mistyped.

**Questions to settle first.** The cut table and cap; whether a cut is
per league or follows the player into other events (almost certainly per
league); whether Golf Ireland cards in a mixed league are cut too, given
their Stableford is Golf Ireland's official figure and cannot be re-scored.

## Checking courses and scorecards that players add

Ross, 11 Nov 2026: agreed as a future project, not to be built yet.

**The idea.** Whoever may start a round may add its course, from any course picker, and photograph its scorecard then or later (D68–D74). **A user's course is live for everyone at once**, and stays so. A review function then lets a course be **confirmed**: looked at and marked as checked, or corrected.

**What already exists.** Courses, holes and tees are written only by the server (migration 040). `courses.added_by` (migration 074) says whether a course came from the platform (`'system'`) or from a picker (`'user'`). **Who added it is deliberately not recorded** (Ross). `card_verified` records that a photo confirmed a card, and `/admin/courses` lists every course by card state and edits names, counties and tees.

**What it needs.**
- **A review list in `/admin`:** the user-added courses not yet confirmed (`added_by = 'user'`), newest first. Each can be confirmed, corrected, or merged into the platform course it duplicates. Confirming is a mark, never a gate: the course was live all along.
- **Photo corrections in the same list.** A card check applied to a course since it was last confirmed.
- **Checks worth doing automatically:** a new course whose name is very close to an existing one; a photo correction that moves pars rather than indexes; several corrections to one course.

**Open questions.** What "confirmed" shows to players, if anything — a line under the course, or nothing at all. Whether a correction to a confirmed course should un-confirm it. What happens to a user course merged into a platform one whose events already play it.

## Accounts and clubs (D94–D104, D117–D122)

Ross, 14 Nov 2026: planned, not built. D117–D122 (the same day, from the
Claude.ai project list) redraw stages (c) onward; D105–D116 are not
recorded here. The plan below was checked against
the code on that date (questions A–I); build one stage at a time, each
tested on greendot.live before the next.

**The rule above all.** Nobody ever has to sign in to join, play, score or
watch. Codes, PINs and the silent phone identity work exactly as today, and
every event and trip behaves byte for byte the same on a phone with no
account. An account only ever *adds* — it is OR-ed onto today's rules, never
AND-ed.

**What it is.**
- **One kind of account: a person**, by email and a 6-digit code typed into
  the same screen. No passwords, no magic links, no Google or Apple.
- **Signing in upgrades the phone's anonymous user in place**
  (`updateUser({ email })`, then `verifyOtp` type `email_change`), so the user
  id — and every `trip_members` row, and the entry stamps in
  `lib/entryClient.ts`, which are keyed `userId|playerId` — are kept.
- **The email already has an account** (a second phone, or the home-screen
  app, which has its own storage and so is always a second phone): the
  upgrade answers `email_exists`; the phone signs in to that account with a
  code (`signInWithOtp`, `shouldCreateUser: false`, verify type `email`) and
  the server moves this phone's `trip_members` rows onto it, event by event
  (`mergeMemberships`: the higher field role, the later `organiser_until`, a
  player claim kept — the account's own where both claimed different names),
  then deletes the leftover anonymous user. **The proof of the anonymous
  half is a sealed ticket** (`sealJson`, `lib/signedState.ts`) the server
  hands the phone *before* it switches — the switch drops the anonymous
  session, so it cannot be asked for afterwards. Ticket: anonymous user id,
  15 minutes.
- **An event can have an owner (an account) and, from stage (c), a club** —
  `trip_private.owner_id` / `club_id`, server only, never a column on
  `trips`. A page is told only "this phone owns this event" (the
  `/api/entry` peek answers `organiserBy: 'pin' | 'account'`).
- **The owner, or an admin of the event's club, is organiser on any phone
  they are signed in on** — no PIN, no twelve hours, never capped at 30 days
  (as the PIN holder is not, D59). The PIN stays: it is how a helper is lent
  organiser for twelve hours, and changing it ends their access, never the
  owner's (`endOrganisers` touches `organiser_until` only). An owner sets a
  new PIN without being asked the old one.
- **Claiming.** At creation, a signed-in maker owns the event. At first
  sign-in (and at creation), an event whose `trip_private.lead_email` equals
  the account's *confirmed* email becomes the account's, where it has no
  owner yet. **This grants nothing new**: whoever reads that inbox can already
  become organiser through Forgot PIN (D67). Any other event is claimed by
  typing its organiser PIN while signed in. A trip with no passcode is
  claimable only by its email — but on it every member is organiser anyway.
- **A club is a workspace, not a login**: `clubs`, `club_members` (owner |
  admin | member — D117 makes members a thing, so this replaces the
  `club_admins` first proposed), `club_invites` by email. Unverified until
  Ross approves it in `/admin`; only a verified club gets the tick and a
  public page. Only owners and admins are organisers of the club's events.
- **Delete account ships with sign-in**: the auth user deleted
  (`trip_members` and `club_members` cascade, `trip_private.owner_id` set
  null), refused while sole owner of a club. Names and scores stay on
  events — they are the event's, not the account's.

### What the code says (questions A–I)

**A. What is keyed to the phone's identity.** In the database, only
`trip_members` (068) — no policy, function or table reads
`trip_members.player_id` for permission, and nothing else carries a user id
(Strava is keyed to the runner, the outbox and cookies to the phone). On the
phone: the entry stamp per event (`gd.entry.<code>.v1` = `userId|playerId`),
Supabase's own session in localStorage (`sb-<ref>-auth-token`), and the
Realtime token, which supabase-js swaps itself on a sign-in.
- *Upgrade in place:* same user id, nothing moves.
- *Merge:* a new user id. The stamps no longer match, so `EnsureMember`
  enters each event again; the merge has already moved the rows, so nothing
  is lost even before it does.
- *Score outbox* (`gdg.scoreOutbox.v1`): keyed player/round/hole, not by
  user. A write sent between the switch and the merge is refused, and
  stage 6's `Refused` → `recoverEvents` re-enters and sends it. No hole lost.
- *Player cookie* (`gg_player_<CODE>`): per device, untouched by either.
- *`rememberUnlock`*: per code with its expiry; untouched. After a merge the
  account's row carries the later `organiser_until`, so the next
  `settleOrganiser` agrees with the phone.
- *Live subscriptions:* the live board (`postgres_changes` on
  `live_scores`, RLS-filtered since 079) may miss events for a moment until
  the merged rows exist; its 15-second poll covers it. The tee sheet's
  presence channel is public and keyed per sheet-opening, not per user.
- *Sign-out mid-round:* the phone becomes a fresh anonymous user
  (`signOut({ scope: 'local' })`, then the next entry signs in anonymously).
  Organiser access through the account ends, as it should; scores keep
  going through the same refusal-and-recover path; the field role comes
  back by the code and the cookie.
- *Trap:* `recoverEvents` signs a phone out locally on any 4xx refresh
  error. For an account (revoked, or deleted on another phone) that is still
  the right fallback — the scores must keep going — but the account screen
  must then say "Signed out", not stay quiet.

**B. Nothing assumes a signed-in user is anonymous.** `is_anonymous`
appears only in 069/081 and their checks. 081 selects `is_anonymous IS TRUE`
in both rules and again in the `DELETE`, so a permanent user is never
deleted, nor its `trip_members` rows. Two edges: an upgrade stays anonymous
until the code is verified, so a 7-days-and-no-event phone could be
forgotten mid-sign-in on a Sunday (the verify fails; trying again works);
and a merge deletes the anonymous user itself, after moving its rows. New
tables reference `auth.users` `ON DELETE CASCADE` (club roles) or
`SET NULL` (ownership), never the other way round.

**C. The smallest change to the rules.** One SQL helper, `account_trips()`
— the events this signed-in user owns or administers through a club — and
one `OR` in each of `writable_trips()` and `organiser_trips()`, alongside
`m.organiser_until > now()`. It keeps the join through `trip_members`, so a
phone still has to have entered (it always has: `EnsureMember`). In
TypeScript, `Membership` gains `account: boolean` (read, not stored), and
`organiserByPin` becomes `organiserNow` = PIN hours *or* account; `roleOf`,
`mayWrite` and `mayChangeEvent` already go through it, so the 30-day cap
waives itself for owners exactly as for the PIN. `test:membership` holds
the two copies together, as it does the 081 numbers.

**D. Creation.** `/api/trip/create` already resolves the token to a user
id. `CreateStore` gains `isPermanent(userId)` (an admin `getUser`:
`is_anonymous` false *and* `email_confirmed_at` set) and the owner is
written to `trip_private` in the same step as the lead email, through
`lib/leadEmail.ts` (renamed for what it now holds). `owner_id` stays out of
`CREATE_COLUMNS`, so no form can name it, and `trip_private` has no phone
grant (080). The automatic claim at sign-in is a server route,
`/api/account/claim-by-email`, on the service role, comparing
`lower(trim(lead_email))` with the confirmed email and filling only an
empty owner.

**E. Email — what Ross sets in Supabase** (Authentication):
1. *Emails → SMTP Settings → Enable custom SMTP*: host `smtp.resend.com`,
   port `465`, username `resend`, password a Resend API key made for this
   alone (sending only, `greendot.live`), sender
   `support@greendot.live` (`SITE.supportEmail`), name `Green Dot`.
2. *Emails → Templates*: **Magic Link** and **Change Email Address** each
   show `{{ .Token }}` and no `{{ .ConfirmationURL }}` — no link in either,
   so a code is the only way in. (Confirm signup is never used.)
3. *Sign In / Providers → Email*: **Confirm email on** (off, an email
   change applies unverified — and the automatic claim would hand an event to
   anyone who typed its address; the server checks `email_confirmed_at` as
   well), **Email OTP Length 6**, **Email OTP Expiration 600** seconds,
   Secure email change left on (an anonymous phone has no old address).
   Check whether anonymous conversion asks for **manual linking** to be on —
   the docs say so for linking; it is the stage (a) spike's first question.
4. *Rate Limits*: emails sent **30 an hour** (project-wide — this is the
   one that protects Resend); token verifications raised well above 30 per
   5 minutes per IP, for the clubhouse wifi, as anonymous sign-ins were.
*Resend's free plan is 100 a day and 3,000 a month, across every email*:
the confirmation email, Forgot PIN, club invites and now sign-in codes. A
busy day of sign-ins spends the day's Forgot PIN emails — the worse loss.
Move to Resend's paid plan (no daily cap) before stage (b) makes signing in
worth something.

**F. Monthly active users.** Supabase counts distinct user ids active in
its Auth logs in a month; anonymous users sign in and refresh, so every
active phone counts (inferred from Supabase's MAU definition — not stated
for anonymous users in so many words). Free plan ceiling: 50,000. Today's
numbers: `scripts/rls-check.sql`, the first block (`anonymous_phones`,
`phones_in_an_event`, `memberships`) — this container has no database
access, so Ross pastes it. Accounts add nothing on top: an upgrade is the
same user, and a merge removes one.

**G. Home-screen install.** The code is typed into the same screen, so
nothing ever leaves the app window — the reason for codes over links.
`supabase` persists its session in localStorage, which the installed app
keeps (home-screen apps are exempt from Safari's seven-day storage cap).
Its storage is its own, so first launch is a second phone: sign in once
more there, which is the merge path. Mark the box
`autocomplete="one-time-code"` so iOS offers the code from Mail.

**H. Admin.** *Now*: a fourth section in `/admin` behind today's gate — a
list of unverified clubs, each approved or refused by a server action that
re-checks the signed `gdg-admin` cookie (`adminGate.ts`) before writing on
the service role. *Later, onto Ross's account*: `ADMIN_USER_IDS` (server
env), and an `/admin` sign-in that sends the account's token as a Bearer
header and, when the id is listed, sets the same signed cookie — every
admin page keeps working as it is. Not before stage (c).

**I. Tests.** What pins "nobody signs in" today: `test:membership` (one
`signInAnonymously`, behind `databaseReady`; the browser half never throws;
only the server writes `trip_members`; 081 deletes only anonymous phones),
`test:rls` (creation's columns and the stand-in store), `test:client-boundary`
(no hash or server file in a browser file), `test:event-reader`. **New:
`test:no-account`** —
- every outcome of `runEntry`, `runCreate`, `roleOf`, `mayWrite` and
  `mayChangeEvent` for a phone with no account, recorded before stage (b),
  must stay exactly the same after it (a golden table, the `test:golden`
  way);
- `updateUser`, `signInWithOtp` and `verifyOtp` appear in one file,
  `lib/accountClient.ts`, imported only by the account screen and
  `/dashboard` — never by a layout, `EnsureMember`, a trip page or scoring;
- no route outside `/api/account/` and `/api/club/` refuses for want of an
  account (`requireAccount` lives there alone);
- every migration from 084 adds account terms to a policy or function only
  inside an `OR` beside the existing membership test;
- and `scripts/rls-check.sql` gains a block that pretends to be an
  anonymous guest and an anonymous organiser and reads the stage 4 answers
  unchanged.

### The stages

**(a) Sign-in, sign-out, delete, privacy — no new powers.** No migration.
Starts with a spike on a Vercel preview: the anonymous upgrade by code, and
the `email_exists` → sign-in → merge, on the pinned supabase-js. Builds
`lib/accountClient.ts`, an account screen (Settings tab on events, Trip
Setup's foot on trips, a run challenge's Settings), `/api/account/merge-ticket`,
`/api/account/merge`, `/api/account/delete`, and the privacy notice's
Accounts section (the address, why, kept until deleted). Ross first: E's
dashboard settings and a Resend key. *Phone check:* sign in mid-round on a
scoring phone and keep scoring; sign in on a second phone and see its events
kept; install to the home screen and sign in there; sign out and score;
delete the account and still see the event.

**(b) My events at `/dashboard`, ownership, claiming.** Migration 084:
`trip_private.owner_id` (`REFERENCES auth.users ON DELETE SET NULL`),
`claimed_at`, `account_trips()`, and the `OR` in `writable_trips()` and
`organiser_trips()`. **Paste before the deploy** — every owner is null until
the code writes one, so nothing changes. Undo: 071's two functions pasted
again, `DROP FUNCTION account_trips`, `DROP COLUMN owner_id, claimed_at`.
`/dashboard` is a client page asking `/api/account/events` with the token:
owned, then entered. The padlock reads the peek's `organiserBy`. *Phone
check:* a signed-in organiser opens their event on a phone that never had
the PIN and is organiser; a helper given the PIN is organiser for twelve
hours and changing the PIN ends theirs, not the owner's; a phone with no
account sees every page as before.

### D117–D122 (Ross, 14 Nov 2026)

- **D117 — club members are the pro tier.** One function, `mayUseFeature`
  in `lib/tiers.ts` (pure, the only copy), answers "may this account use
  this feature" from one fact: is it a member of a verified club. **Today it
  answers yes for everyone**: every feature in its registry is marked
  `everyone`, and moving one to `club` is one line. It is never asked on
  the way to joining, playing, scoring or watching — those are not features
  in the registry, and `test:no-account` fails a trip, scoring or entry file
  that imports it. The fact arrives from `/api/account/me` (the account's
  verified clubs), so a phone with no account is simply "not a member" —
  which today still means yes.
- **D118, D119 — the club skin.** A club sets a crest, its name, one colour
  and one header photo, shown **only inside its members area**
  (`/club/[slug]/…`). No fonts. The meaning colours — accent (live, action),
  gold (won), rust, side-a, side-b — are never re-pointed. The look itself
  is being designed in Claude.ai; below is only how it is held together.
- **D120 — one list of a member's events**, club and open together, each
  marked which, loaded after the page like My events (the same
  `/api/account/events`, widened).
- **D121, D122 — stats across the platform.** A summary row written once
  per signed card, so a golfer's stats never re-read hole scores across
  events. Each row says whether it is a **club round** (the event is a
  verified club's) or **open** (an open event, the name self-claimed). A
  club reads only the rows from its own events.

### How a club's colour is held (D118, D119)

**A third set of `--gd-*` values, scoped to one wrapper.** Today there are
two sets — `:root` (day) and `html.dark` (night), plus the print copy of the
day values. The club set is four new tokens and nothing else:
`--gd-club` (marks, rules, the header band), `--gd-club-deep` (club-coloured
words), `--gd-on-club` (words on the band) and `--gd-club-tint`
(`color-mix` over `var(--gd-club)`), each with a `--color-club*` twin in
`@theme`. Their house values in `:root` are bark, so a club with no colour
looks like Green Dot. The members area's layout (a server component) draws
one `<div data-club style="…">` carrying the club's values **for both modes
at once** (`--gd-club-l`, `--gd-club-d` and so on), and `globals.css` picks
them: `[data-club] { --gd-club: var(--gd-club-l) }`,
`html.dark [data-club] { --gd-club: var(--gd-club-d) }`, and the print block
the day values — so the theme switch works live without a reload, exactly
as today's tokens do. **A `[data-club]` rule may declare only `--gd-club*`**,
and the inline style is written only from hex the server has checked
(`/^#[0-9A-F]{6}$/`, at save and again at render), so a club's value can
never reach another token or carry anything but a colour.

**The colour is checked and adjusted, never refused** — `lib/clubColour.ts`,
pure, the only copy, run on the server at render from the one hex the club
chose (only that is stored, so a better rule later moves every club):
- *Day*: `club` clears 3:1 against cream and white (a mark, WCAG 1.4.11);
  `club-deep` clears 4.5:1 against both (words); `on-club` is ink or white,
  whichever clears 4.5:1 on `club`.
- *Night*: the same floors against the dark page and card.
- *Adjusting*: keep the hue, step the lightness (darker by day, lighter at
  night) until each floor clears, easing chroma only to stay in sRGB. The
  hue is never moved: a club's colour is its identity.
- *Beside the meaning colours*: distance measured as the match sides already
  measure it (`colourDistance`, ΔE over Lab, in `lib/matchSides.ts`).
  Too close to the emerald (Ireland is full of green clubs) and the club
  colour is stepped further in lightness, never re-hued — and it is never
  used anywhere a meaning colour speaks, so the two cannot collide on a
  board or a button.
- The club's admin sees the colour as it will show in both modes before
  saving, with a line when it was adjusted.

**What it touches in `test:branding`.**
- *The palette is defined once*: the club tokens join the list, house value
  `var(--gd-bark)`, no hex of their own in the stylesheet.
- *The named mixes are tokens*: its pattern allows `color-mix` over bark,
  ink or accent only; `--gd-club-tint` over `var(--gd-club)` is added.
- *Dark mode is the same tokens with night values*: the club tokens' night
  value is the `-d` variable, under `html.dark [data-club]`.
- *The print block*: re-points the club tokens to the day values too.
- *One primary action per screen* and *Emerald is an accent*: unchanged —
  the primary button stays deep emerald inside a club area.
- **New, *A club's colour is decoration***: the `club` utilities appear
  only in an allowlist of members-area files; never in `lib/resultTone.ts`,
  `lib/matchSides.ts`, `lib/teamColors.ts`, `buttonClass` or a pill; no
  full-height club wash; `[data-club]` declares only `--gd-club*`; and
  `lib/clubColour.ts` run over awkward choices (white, black, a yellow, a
  near-emerald, a near-gold, a red beside side-a) clears every floor in both
  modes.
- The style lab is untouched: its attributes sit on `<html>`, the club's on
  a wrapper, and neither names the other's tokens.

**Crest and header photo.** A Supabase Storage bucket, `club-assets`, read
publicly, written only by the server, which resizes on upload (crest
512px, photo 1600px wide, WebP) so a page never carries a camera's original.
Shown only for a verified club. The words over the photo sit on a scrim —
for the design.

### The stages, from (c)

**(c) Clubs and members.** Migration 085:
- `clubs` — id, slug (unique), name, `colour` (hex or null, CHECK
  `^#[0-9A-Fa-f]{6}$`), `crest_path`, `header_path`, `verified_at`,
  created_at. The skin's columns go in now; they cost nothing until (d)
  draws them.
- `club_members` — club, user (`auth.users ON DELETE CASCADE`), role owner |
  admin | member, created_at; one row per account per club.
- `club_invites` — club, email (lowercased), role, token hash, expiry, used.
- `trip_private.club_id` (`ON DELETE SET NULL`).
- `account_trips()` widened: owner, or owner/admin of the event's club, the
  club verified. Members are not organisers.
- The `club-assets` bucket (or made in the dashboard — say which when built).
- All three tables server only: RLS on, no policy, `service_role` by name.

**Paste before the deploy** (no club exists, so nothing changes). Undo:
084's `account_trips()` again, drop `trip_private.club_id`, drop the three
tables and the bucket. Builds: making a club, inviting, joining by invite,
Ross's approval in `/admin` (H), putting an event under a club, the public
club page, `mayUseFeature` (yes for all), and D120's one list on
`/dashboard`. Ross first: nothing beyond (b) — invites spend Resend's
emails. *Phone check:* make a club, invite a second email, approve it,
put an event under it — the second account (an admin) is organiser there,
a member is not, and both see it in their one list marked as the club's;
a phone with no account sees the event exactly as before.

**(d) The club skin.** No migration (085 holds the columns). Builds
`lib/clubColour.ts`, the `[data-club]` wrapper and tokens, the uploads, and
the members area — once the look comes back from Claude.ai. *Phone check:*
a green club, a yellow club and a white club, each by day and at night —
words readable, emerald still meaning live, nothing outside `/club/`
changed.

**(e) My golf and the card summaries.** Migration 086:
- `account_players` — account ↔ a claimed player, written when a
  signed-in phone claims a name (the entry route knows both). Never read off
  `trip_members.player_id`.
- `card_summaries` — one row per player per signed round: trip, round,
  player, course, tee, played_on, holes, gross, par, Stableford points (off
  the full handicap — an allowance is a board's), course handicap, putts,
  fairways hit and tried, greens in regulation and holes counted, eagles or
  better / birdies / pars / bogeys / doubles or worse, `origin` (`club` |
  `open`), `club_id`, `rules_version`, written_at. UNIQUE (round, player);
  indexed by player and by club. Nothing that depends on the rest of the
  field (gained on the field moves as others sign) — a player's own card
  only.
- Both server only: RLS on, no policy, `service_role` by name.

**Paste before the deploy.** Undo: drop both tables (they are derived —
rebuilt by the backfill).

*Writing a row.* The commit happens in the browser (`handleCommit`), so the
browser never writes the summary: once its commit lands it asks
`/api/stats/card` with the round, fire-and-forget, and the server reads the
round's own rows through `eventReader`, checks the card is finalised, builds
each row with `lib/cardSummary.ts` (pure, built on `lib/holeStats.ts` — no
second copy of greens in regulation or anything else) and upserts. The
nightly cleanup is the backstop: finalised rounds with no summary, written
then. **Once per signed card, rewritten only when the card changes**: Edit
Scorecard, a card check that re-scores a course, a void (rows deleted), a
handicap correction, the event moving into or out of a club (`origin`
rewritten for the event in one update), and a `rules_version` bump. A
one-off backfill writes every round signed before 086, North West 26
included — read only on its scores.

*Reading.* My golf: the account's players, then their summaries. A club's
stats: its rows by `club_id`, from a server route that checks the asker is
a member — never the others. Origin decides what is shown where: a club's
page shows only club rounds; My golf shows both, marked.

*Phone check:* sign a card, see it on My golf within a page load; edit a
hole and see the row follow; a club round and an open round marked apart;
a club's page shows none of a member's open rounds.

**(f) Club season.** The Golfer of the Year concept above, read off the
club's summary rows. Migration, if any, decided then.

### What D117–D122 cost in reads

| What | When | Reads |
|---|---|---|
| `mayUseFeature` | per screen that asks | none of its own — the account's clubs ride in `/api/account/me`, one query, once a page load, signed-in phones only |
| The one events list (D120) | opening `/dashboard` | one wave of three in parallel (the account's `trip_members`, `account_players`, `club_members`), then one of two (those events' `trips`, their clubs' `clubs`) — five small queries, never per trip page |
| The club skin | each members-area page | one `clubs` row by slug, which the page reads anyway; the colour maths is arithmetic |
| Writing a summary | once per signed card | four reads of that one round (round, holes, handicap snapshot, scores) and one upsert — a few dozen rows |
| Rewriting | per edit, check, void, handicap fix | the same, for that round |
| Backstop | nightly | one anti-join, finalised rounds without summaries |
| My golf | opening it | two queries, one row per card — today's per-trip stats page reads 18 rows a card, every hole, and only within one trip |
| A club's stats | opening its page | one query by `club_id`, past the 1,000-row cap through `readAllRows`; worth a shared copy (`lib/sharedCopy.ts`) once a club has a season of it |
| Backfill | once | every signed round's scores, once |

A phone with no account pays none of it: nothing above runs unless a page
asked by a signed-in account, or a card was signed — and signing a card
costs that phone one extra request it does not wait for.

### Open with Ross
- What the padlock means to an owner: shutting it can end a PIN grant
  (D61) but not ownership. Proposed: an owner's padlock shows open, and a
  tap shows "Organiser through your account" with Sign out.
- Two phones on one account claiming different names in one event: the
  account's own claim wins at a merge, and each phone's later entry writes
  its cookie's. Harmless today; (e) uses its own table.
- Whether the sign-in screen should say "We sent a code" the same way for
  a new and an existing email (it can; the API still tells the two apart).
- Resend's paid plan before (b).
- Whether a match card (a knockout's or a session's) gets a summary row
  too. It has a gross a hole, so it can; proposed after stroke cards.
- What an open round shows a club: proposed nothing (D122), even for its
  own members' open rounds.
- A club changing its crest or photo after Ross verified it: shown at once,
  or held for another look.
- Whether an account may leave a club itself, and whether a member list is
  visible to other members.
