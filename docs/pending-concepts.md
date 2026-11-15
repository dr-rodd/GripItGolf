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

## Accounts and clubs (D94–D140)

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
  (`trip_members` cascade, a `club_members` row is unlinked and stays on the club's list, `trip_private.owner_id` set
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

**(a) Sign-in, sign-out, delete, privacy — no new powers.** **Built 14 Nov 2026, unlinked**
(`/account`; `ACCOUNTS_LINKED` in lib/account.ts off until Ross has set E's
dashboard settings and tried it on a phone — then flip it and add the
links). No migration.
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

**(a2) Green Dot members sign-in (D128–D133).** Built 14 Nov 2026,
behind `ACCOUNTS_LINKED`, on `/account` only — the build is described in
the D128–D133 entry below. Migration 084.

Stages (b) onward were redrawn on 14 Nov 2026 at 21:05 — see **"The stages
from (b), redrawn"** below. The first draw's detail for clubs, the skin and
the summary row is kept under "Detail kept from the first draw".

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

### Detail kept from the first draw (c)–(f)

Superseded as a plan by the redraw below, and kept for its detail — the
members list, decredentialling, what leaving means, the privacy draft, the
summary row. Stage letters and migration numbers here are the old ones.

**(c) Clubs and members.** Migration 085:
- `clubs` — id, slug (unique), name, `colour` (hex or null, CHECK
  `^#[0-9A-Fa-f]{6}$`), `crest_path`, `header_path`, `verified_at`,
  created_at. The skin's columns go in now; they cost nothing until (d)
  draws them.
- `club_members` — **the club's own list of its members, which its owners
  and admins keep** (Ross, 14 Nov 2026): club, name, **member number** (the
  club's own, optional, unique within the club), **GUI number** (the
  national membership number — Golf Ireland's, still called GUI by clubs;
  optional, unique within the club), email (optional, for the invite), role
  owner | admin | member, `user_id` (`auth.users ON DELETE SET NULL` —
  **null until an account is linked to the row**), added_at. A row exists
  before anybody has an account: the list is the club's, the link is the
  person's.
- `club_invites` — a member row, email (lowercased), token hash, expiry,
  used. Accepting links the signed-in account to that row.
- `trip_private.club_id` (`ON DELETE SET NULL`).
- `account_trips()` widened: owner, or owner/admin of the event's club, the
  club verified — read through the member row's `user_id`. Members are not
  organisers.

**Decredentialling** (Ross, 14 Nov 2026). An account's club standing is
never stored on the account: it is "is there a row on a verified club's
list linked to me", asked afresh on every request (`account_trips()`,
`mayUseFeature`, the members area). So **taking a member off the list
decredentials them at once** — organiser through the club, the pro tier
(D117) and the members area all end on their next page load, with no session
to revoke. The GUI number is what makes that dependable: a club keeping its
list from its own records (a pasted export, a yearly renewal) matches rows
by GUI number, so a lapsed member drops off by number even where their name
or email changed, and the same person in two clubs is one GUI number in each.
The list is administered on the club's members page (add, edit, remove,
paste a list, see who is linked), owners and admins only; the numbers are
server only and shown masked like Golf Ireland's (`maskMembershipNumber`).

*Answered* (Ross, 14 Nov 2026):
- **A club brings its list** — names, member numbers, GUI numbers and
  emails — and the members area takes it in whole (a pasted list or a file).
  Each person links themselves to their row by making a personal account and
  keying in a code; **which code is still to decide** (proposed: a code in
  the invite email to the address on the list, so only the person who reads
  that inbox can link that row — the same proof sign-in already rests on).
- **One GUI number per account.** A second account claiming a number
  already linked is held for the club to settle, never quietly moved.
- **GUI numbers are optional.** Most club members have one, not every
  account will; a member row without one links by its email and code
  alone, and decredentialling then goes by the row.
- **The privacy notice gains a Clubs section**, shipped in the same deploy
  that opens clubs — never before, because until then no club list is held.
  The draft is below.

**What leaving means** (Ross, 14 Nov 2026) — golf is never lost by a
membership changing:
- **A membership that lapses keeps all its golf.** The rounds played stay
  on every board and in every summary, as they were.
- **A club removing a member severs them from the club, nothing more.** The
  row is kept, marked removed (`removed_at`), its link to the account cut,
  and the access it gave ends at once. **A club can never delete anybody's
  personal account.**
- **The club chooses whether a removed member still appears on its
  leaderboards** — a choice per member (`club_members.on_boards`, shown by
  default), which hides them from the club's boards and leaves their scores
  where they are, so the choice can be undone.
- **A member deleting their own account leaves their golf on the
  leaderboards**: names and scores belong to the events they were played
  in. **The club may then delete that golf if it wants** — an owner or
  admin's deliberate act, through the organiser's existing delete a player
  (which takes the scores with it), never automatic.

**Privacy notice — the Clubs section, to ship with stage (c).** "A golf club
on Green Dot can keep its list of members here: each member's name, the
club's own member number, their national (GUI) membership number if they
have one, their email address, and whether they are an owner, admin or
member. The club's owners and admins add, change and remove those details,
and are responsible for them being accurate; Green Dot holds them for the
club, to let members link their own account and to show them the club's
events, members' area and results. A member links their account themselves
with a code sent to the email on the club's list. Only the club's owners
and admins see the list, and membership numbers are shown partly hidden.
One GUI number links to one account. When a membership lapses, the golf
played stays. When a club removes a member, their link to the club ends at
once and the access it gave with it; their own account is never touched by
a club, their names and scores stay with the events they played in, and the
club decides whether they still appear on its leaderboards. If you delete
your account, your golf stays on the leaderboards it was played on, and
the club may choose to delete it from its own events. A club's list is
deleted when the club is closed, and a member can ask the club, or write to
the support address, to be taken off it." (Plus Clubs as a reason under "Why we may hold it" —
the club's legitimate interest in running its membership — and the club as
a source of data under "What every event holds".)

**Paste before the deploy** (no club exists, so nothing changes). Undo:
084's `account_trips()` again, drop `trip_private.club_id`, drop the three
tables and the bucket. Builds: making a club, the members list (with member
and GUI numbers, pasting a list), inviting, joining by invite,
Ross's approval in `/admin` (H), putting an event under a club, the public
club page, `mayUseFeature` (yes for all), and D120's one list on
`/dashboard`. Ross first: nothing beyond (b) — invites spend Resend's
emails. *Phone check:* make a club, invite a second email, approve it,
put an event under it — the second account (an admin) is organiser there,
a member is not, and both see it in their one list marked as the club's;
take the member off the list and their members area closes on the next
page load;
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

### D105–D134 (Ross, 14 Nov 2026, 21:05, from the Claude.ai project list)

The rule above all is unchanged (D94): nobody ever needs an account to
join, play, score or watch. An account only adds — OR-ed onto today's
rules, never AND-ed. Recorded here as they were given; **the full text of
D105, D106, D109, D110, D111, D114, D115, D119 and D120 lives in the
Claude.ai project list and is not reproduced here** — what this file holds
of them is what the entries below and above say.

- **D107 (agreed)** — an event owned by an account and with no PIN asks
  who may change its settings: **"Just me"** (the default) or **"Anyone in
  the event"**. Only an owned event is asked; every other event without a
  PIN stays as today (every member the organiser).
- **D108** — juniors. **A junior profile never gets a username or a
  password** (D131's rule holds it: `app_metadata.junior`, set only by the
  server, refuses both).
- **D112 (agreed)** — a **closed** event decides **who may be in the
  field**, never who must sign in. A listed club member is drawn and scored
  with no account.
- **D113 (amended)** — **members-only leaderboards apply to club events
  only**; a watch link shows one outside. Every event made outside a club
  stays exactly as today, byte for byte.
- **D116 (amended)** — clubs and their members are **one stage**, and a
  club may exist with no members yet.
- **D117 (amended)** — pro comes from membership of a verified club, **or
  later an individual entitlement** (a stats package bought by one person).
  The one function, `mayUseFeature`, takes club membership OR an individual
  entitlement; **both answer yes for everyone today; nothing is sold.**
- **D118 (agreed)** — the skin is **the Pints mockup**: club artwork, crest,
  name, one club colour — detail in D123–D127.
- **D121, D122 (agreed)** — stats across the platform; a club sees only its
  own events' rounds; **open-event rounds are marked self-claimed and never
  feed a handicap or a club honour**.
- **D123–D127 — the Pints club skin.** D123 the art's strengths (how
  strongly the club artwork shows behind each part of a screen); D124 a
  light and a dark version of the art; D125 **the club colour is for
  identity only** — never a meaning (live, action, won, a side); D126 the
  art supply spec (what a club hands over: sizes, formats, the two
  versions); D127 **the members' tab bar: Home · Comps · Board · Stats ·
  Club**.
- **D128–D133 — Green Dot members sign in** (stage a2, built — below).
  D128 joining is the email and code, then a username and a password on the
  same screen, not finished until both are saved; D129 an account from
  stage (a) is asked for both the next time it signs in; D130 the username
  (3–20 of a–z, 0–9, `.` and `_`, stored lower case, unique ignoring case,
  no `@`, no leading or trailing dot, a reserved list refused, changeable,
  shown to nobody else yet); D131 the password (8–72, no other rule, a
  show/hide eye; juniors never); D132 signing in is one field, "Username or
  email", and a password — `@` means email — with "Forgot password?" by
  email and code, and one message for every failure, "Wrong username, email
  or password"; D133 **the words** — anyone with an account is **a "Green
  Dot member"**, a club's people are **"<club name> members"**, never a bare
  "member" on screen; the code keeps the word account.
- **D134 (proposed)** — a Green Dot member links their account to their
  player in any open event or trip, past ones included. **Claiming a name
  while signed in is the link.** One account per player per event. The
  member can unlink; the organiser can undo a wrong link. Linked rounds
  count to stats as self-claimed. A past event is reached through the
  normal door — its code, then the name — **never by searching**.

### D135–D140 (Ross, 15 Nov 2026)

- **D135** — only Green Dot members make events: trips, tournaments and run
  challenges alike. Joining, playing, scoring and watching never need an
  account (D94 stands). Built as (b3).
- **D136** — every event but a totally open one has an organiser PIN, and
  closing an event in its settings asks for one. A totally open event is a
  trip on "Any player"; a tournament and a run challenge are made with a PIN,
  as now. Answers D107: "Just me" is setting a PIN.
- **D137** — a PIN is chosen per event, never a member's one PIN carried
  over: lending one event's PIN must never lend all of them. A member may
  type the same one each time if they choose. Nothing pre-fills it.
- **D138** — a club event needs no PIN unless the club chooses one. **With
  no PIN a club event is closed, not open**: only the club's admins change
  it (today a PIN-less event is every member's to change — a club event is
  the exception). Built in (c)/(d) through b1's `EventFacts.ownerOnly` and an
  `organiser_trips()` branch on `trip_private.club_id`.
- **D139** — a club admin edits every one of their club's events: an
  account linked to the club's list with the admin role, signed in. *Taken as
  suggested*: "all events" means all of **that club's** events, never
  another club's or anybody's private trip; Green Dot's own `/admin` stays
  the owner's tools page and gains no event editing.
- **D140** — a club event may still let others edit (a charity day run by
  the club with guests helping): the club opens it to the field ("Anyone in
  the event", today's open event) or sets a PIN and lends it. Closed is the
  default. *Taken as suggested*: the choice sits in the event's Who can edit
  — Club admins only / Club admins and anyone with the PIN / Anyone in the
  event.

**Joining, reordered (Ross, 15 Nov 2026):** the Join tab asks the email and a
password typed twice first; the emailed 6-digit code then confirms the email
(a code, not a link — a link opens outside a home-screen app and read as an
address when put in a template), the password is saved the moment the code is
right, and only the username is asked after. **An email that already has an
account is never sent a sign-in code**: the screen says it is already linked
to a Green Dot account and offers Forgot password and Sign in. *Cost:* the
screen now tells anyone who types an address whether it has an account;
Supabase's own rate limits are the only brake on guessing.

### Stage (a2) as built — Green Dot members sign in (D128–D133)

- **The rules** are `lib/account.ts`, pure, held by `test:account`:
  `usernameIssue` (D130, `RESERVED_USERNAMES`), `passwordIssue` (D131),
  `signInRoute` (`@` → email, else a username), `SIGN_IN_FAILED` (the one
  message), `credentialsRefused` (a junior), and the retry windows
  (`SIGN_IN_LIMITS`: 10 wrong per address in 15 minutes, 20 per name in an
  hour; username checks 60 per address in 10 minutes).
- **The server** is `/api/account` (logic in `app/api/account/account.ts`
  on an injected store): `status` (the username, whether a password is set),
  `username-check` (taken or free, rate limited), `set-username`,
  `sign-in` (a username is turned into its email on the service role and the
  password checked there — `signInWithPassword` on a throwaway client —
  and the session handed back for the phone to `setSession`; **a username's
  email never reaches a browser**; the phone's own events are moved onto the
  account as the code path does), and the earlier `ticket`, `merge`,
  `delete`.
- **The phone's half** is still `lib/accountClient.ts`, the only browser
  file that talks to Supabase's sign-in: `updateUser({ password })` on the
  signed-in session, `setSession`, the code calls. A phone signed in long
  ago that Supabase asks to sign in again before a password change is sent
  through "Forgot password?".
- **The screen** (`/account`, unlinked): Sign in | Join on one screen; Join
  is the email, the code, then a username and a password; "Forgot
  password?" is the email, the code and a new password; any account short of
  a username or a password is asked for what it lacks before it is done;
  signed in reads "Signed in as <username>", with the username changeable,
  Sign out and Delete my account.
- **Migration 084** (paste before the deploy): `account_usernames`,
  `account_attempts` (where wrong sign-ins and username checks are counted —
  `entry_attempts` cannot be shared: every row there belongs to an event),
  and `account_has_password(uuid)`, all closed to phones. The nightly cleanup
  clears `account_attempts` a day old.

### The stages from (b), redrawn (14 Nov 2026, 21:05)

Every stage below changes nothing for a phone with no account, and nothing
about an event made outside a club. Migration numbers follow 084.

**(b1) — built 15 Nov 2026** (unlinked, `/account/events`): owners, claiming
by email and by PIN, the owner's padlock, My events, and D134's link on
claiming with Unlink. Migration 085 as below, plus `claim_events_by_email()`.
Two choices made while building: **My events lives at `/account/events`**
while the account area is unlinked (`/dashboard` when it opens), and **a
name this account's phones claimed before signing in is linked too** when
My events loads — the phone is the account's from then on. A name another
account is linked to is never taken.

**(b2) — built 15 Nov 2026**: the organiser undoing a wrong link
(`LinkedPlayersCard`, organiser area and Trip Setup; the name, never who),
and an owner changing the PIN without the old one. No migration.

**D107 — answered (Ross, 15 Nov 2026, D136): "Just me" *is* setting a
PIN.** Every event but a totally open one has a PIN, and closing one in its
settings asks for it. Trip Setup's Who can edit reads "Just me" for a
signed-in owner (`AdminPinCard`), the passcode being what they lend a
helper; they never need it themselves. `trip_private.settings_by` is unused
and can be dropped in a later migration; 085's `organiser_trips()` branch on
it never fires while nothing writes it.

**(b3) — built 15 Nov 2026: only Green Dot members make events (D135).**
Every create wizard — trip, tournament, run challenge — is drawn inside
`MemberGate` (`app/dashboard/create/`): a phone with no account is asked to
sign in or join, and the account page sends it back to the same address
(`?next=`, `safeNext` in `lib/account.ts`). `/api/trip/create` refuses a
phone with no account, 403 `account_required`, whatever the screen says
(`CREATE_NEEDS_ACCOUNT`, `CreateStore.isMember`: a confirmed email, never
an anonymous phone). `ACCOUNTS_LINKED` is on: the landing page carries
"Green Dot members: sign in". The maker owns the event from the first moment
(b1's `recordOwner`). **Joining, playing, scoring and watching are
untouched**, and every event made before keeps working exactly as it did.
The privacy notice says an account is needed only to make an event. No
migration.

**(c) — built 15 Nov 2026: clubs and their lists.** Migration **086**
(below as drawn, plus `trip_private.club_access`). Built: setting up a club
(`/account/clubs`, unverified until Ross verifies it in `/admin/clubs`), the
list (`/account/club`: add one, paste a whole list, change, email a code,
take off — the row kept, the link cut — put back, still on the boards),
joining by the emailed code (8 characters, kept hashed, 14 days, one use,
wrong tries limited per address as PINs are; one GUI number to one account,
a clash held for the club), the club's events (`ClubEventCard` in the
organiser area and Trip Setup: put an event under a verified club you run;
Who can edit — Club admins only / Club admins and anyone with the PIN /
Anyone in the event), D120's one list (My events, the club's name on each),
`mayUseFeature` (yes for all), the privacy notice's Clubs section, and
deleting an account refused while it is a club's only owner. **Decided while
building — "Club admins only" is an organiser PIN nobody is given** (D136's
"Just me is setting a PIN", for clubs): every page already locks on a PIN,
the club's admins are organisers through `account_trips()` and `withOwner`
on any phone they are signed in on, and so the 35 files that read `pinSet`
did not change, nor did `organiser_trips()`. Choosing a PIN to lend (here or
on the PIN card) marks the event 'pin'. Not built: the public club page and
the members area (stage (e), with the skin), club invites by bulk send,
closing a club (by support for now).

**(b) My events, ownership and D134 linking.** Migration **085**:
- `trip_private.owner_id` (`auth.users ON DELETE SET NULL`),
  `trip_private.settings_by` (`'owner'` | `'anyone'`, D107 — read only for
  an owned event with no PIN);
- `account_players` — account, event, player, `linked_at`, `linked_by`
  (self or organiser); **UNIQUE (player)** — one account per player per
  event — and UNIQUE (account, event); server only;
- `account_trips()` (owned events) and the `OR` in `writable_trips()` and
  `organiser_trips()`; `organiser_trips()` also reads D107: an owned no-PIN
  event set to "Just me" makes only the owner its organiser.

Paste before the deploy (no owner exists, so nothing changes). Undo: 071's
two functions again, drop the function, `account_players` and the two
columns. **The link is written by `/api/entry`** when a signed-in phone
claims a name — the route already holds the user and the player, so it is
one upsert more, and only for an account. Unlinking is the member's
(their own link) or the organiser's (any link in their event). A past
event is reached by its code and the name, never searched. Linked rounds
are self-claimed. *Reads:* claiming, +1 write for an account, nothing for a
phone; My events, one wave of three (`trip_members`, `account_players`,
owned events) then the events' rows — loaded after the page. *Phone check:*
claim a name signed in and see the event in My events; claim the same name
from a second account and be refused; the organiser undoes a link; a phone
with no account claims exactly as before.

**(c) Clubs with their members — one stage, an empty club allowed
(D116).** Migration **086**: `clubs` (with the skin's columns, empty until
(e)), `club_members` (the club's list: name, member number, GUI number —
one per account, optional — email, role, `user_id` null until linked,
`removed_at`, `on_boards`), `club_invites`, `trip_private.club_id`, and
`account_trips()` widened to a verified club's owners and admins. All
server only. Paste before the deploy. Undo: 085's `account_trips()`, drop
the column and the three tables. Builds: making a club (empty), Ross's
approval in `/admin`, the list (paste or file), invites and linking by
code, removing (severing, never deleting an account), `mayUseFeature`
(club OR individual, yes for all), D120's one list of events, and the
privacy notice's Clubs section in the same deploy. **D138–D140 land
here**: `account_trips()` widened to a club's admins makes them the
organiser of every club event; `organiser_trips()`'s no-PIN branch gains
`AND NOT EXISTS (… p.club_id IS NOT NULL AND p.settings_by IS DISTINCT FROM
'anyone')` so a PIN-less club event is the admins' alone unless opened, and
`factsOf` sets `ownerOnly` to match. **The cost to name now**: the pages that
draw the padlock decide "no PIN, no lock" from the hash alone, so a closed
PIN-less club event must hand them `pinSet: true`-like — one fact more in
the layout's cached reads (`trip_private.club_id`, `settings_by`), read once
per page, not once per file. *Reads:* a members-area
page, one `club_members` row for the asker; the list page, the club's rows
(past 1,000 through `readAllRows`); nothing on any event page.

**(d) Club events and booking (D112, D113, D127).** Migration **087** if
anything needs storing beyond 086 (proposed: `club_entries`, an event's
field drawn from the list — a list row as a player with **no account
needed**, D112). A club event is any event with `trip_private.club_id`.
Closed means who may be in the field; booking uses the tee sheet as it
stands, with the field limited to the list. **Members-only leaderboards on
club events only** (D113): a club event's boards are read by its club's
members, or by anybody holding its watch link; every event outside a club
is untouched. The members' tab bar (D127: Home · Comps · Board · Stats ·
Club) is the club area's, never an event's. *Reads:* a club event page +1
(its club, once, in the layout's cached reads); the board's shared copy
(D91) unchanged.

**(e) The club skin (D118, D123–D127).** No migration (086 holds the
columns); art in the `club-assets` bucket, a light and a dark version
(D124). The scoped token set and the colour check as in "How a club's
colour is held" above — **the club colour for identity only** (D125). The
art layer: a club's artwork drawn behind its members area at the strengths
D123 sets per part, never behind a board's numbers or a scorecard.
`test:branding` changes **inside club space only** — the club tokens, the
art layer's strengths, and an allowlist of club-area files; every existing
section holds unchanged outside it. The supply spec (D126) is what the club
upload checks. *Reads:* none beyond the `clubs` row a members-area page
reads anyway; the art is two cached images.

**(f) The stats summary row per signed card (D121, D122).** Migration
**088**: `card_summaries`, as drawn under "Detail kept" (E), with `origin`
**`club` | `self_claimed`** — an open event's round is self-claimed and
**never feeds a handicap or a club honour**. Written by the server once per
signed card, rewritten when the card changes. *Reads:* as in the table
below.

### What the stages cost in reads

| What | When | Reads |
|---|---|---|
| Signing in (a2) | per sign-in | two small reads (the tries, the username) and Supabase's own check; a phone with no account none |
| D134 linking | per claim by an account | one upsert; a phone with no account none |
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
