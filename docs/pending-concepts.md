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

## Forgot PIN (D67)

Ross, 11 Nov 2026. **Not built yet** — it needs stage 4's server-side PIN
setting (`lib/pinHash.ts`, `app/api/event/actions.ts`), which is in. Today a
forgotten organiser PIN cannot be recovered at all: the server keeps only a
salted, slow hash and never the PIN.

**Scope: the organiser (admin) PIN only.** The public PIN is changed by the
organiser, who can already do it from the organiser area.

**The rules.**

- "Forgot PIN?" sits under every organiser PIN box: `OrganiserLock`,
  `InlineUnlock` and the organiser area's ask. It calls a new route, which
  emails a reset link to the event's email (`trips.lead_email`, or wherever
  D62 moves it). **The address never reaches the browser.**
- The route answers "Sent" whether or not the email went, so it cannot be
  used to learn anything — except when the event has no email at all, when
  it says: "This event has no email on file. Write to `SITE.supportEmail`."
- Limits: 3 emails per event per hour, plus a per-address limit like
  `/api/entry`'s (`checkPin`'s way: the address only ever hashed). Over the
  limit still says "Sent".
- The link carries a random token. **Only its hash is stored**, with the
  event, an expiry 30 minutes out and a used flag. One use. The nightly
  cleanup deletes old ones. A new table, so it carries its own grants:
  server only (`service_role`), RLS on, nothing for phones.
- `/reset-pin/[token]` sits outside the trip tree, like `/enter`. New PIN
  twice, 4 to 8 digits, not equal to the public PIN. Saving:
  - stores the new hash the D64 way (`hashPin`, salted and slow);
  - clears `organiser_until` on every `trip_members` row for that event, so
    every other phone is organiser no longer (D61's mechanism);
  - grants this phone organiser for 12 hours;
  - goes to the organiser area, unlocked.
- **The PIN is never emailed and the server never keeps it.**
- Privacy notice: one line saying the event's email is also used to send PIN
  reset links when asked.

**Screens** (existing tokens and kit only, no new rules, nothing for
`test:branding`).

1. **PIN box.** "Forgot PIN?" link under Unlock, accent colour, 48px tap area.
2. **Tapped.** The box's contents cross-fade (160ms ease-out; instant under
   Reduce Motion) to: "Forgot your PIN?" / "We'll email a link to choose a
   new one to the address this event was made with." / primary "Email me a
   link" / secondary "Back".
3. **Sent.** An accent-tint tick and "Sent. Check the email this event was
   made with. The link works once, for 30 minutes." / muted "Not there? Look
   in spam, or ask again in a few minutes." / secondary "Done". **Failed:**
   "Couldn't send just now. Try again."
4. **The email.** Subject "Choose a new PIN for <event>". Body: "Someone
   asked to reset the organiser PIN for <event> (code <CODE>)." / "Tap below
   to choose a new one. The link works once, for 30 minutes." / button
   "Choose a new PIN" / "Didn't ask? Ignore this email. Your PIN hasn't
   changed and nobody can change it without this link."
5. **The reset page.** `t-h1` "Choose a new PIN", the event's name and code
   under it, fields "New PIN" and "Type it again", hint "4 to 8 digits.",
   note "Saving ends organiser access on every other phone. This phone is
   organiser for the next 12 hours.", sticky primary "Save PIN". Errors in
   rust under the field: PINs don't match; too short or long; same as the
   public PIN. A used or expired link: "This link has expired or has
   already been used. Ask for a new one from the padlock on the event."

**Tests to write with it.** A token works once and expires; the address
never appears in a client file or prop (`test:client-boundary`); a reset ends
every other phone's organiser access.

**Phone check, when built.** On a test event tap the padlock, Forgot PIN?,
Email me a link; the email arrives; set a new PIN and land unlocked; a
second phone that was organiser is locked on its next action; the same link
refuses a second use.

**Open until built.** Where D62 moves the event's email (this reads it from
wherever that lands); the email send reuses `lib/email.ts`'s Resend path,
which is a silent no-op without `RESEND_API_KEY`, so an unset key must read
as "Couldn't send just now" here, not "Sent" with nothing sent — except that
the route's answer must not reveal whether an address exists.
