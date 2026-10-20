# Golf Ireland

A league that reads its cards from Golf Ireland. Players hand their scores
in to Golf Ireland as they always do, find themselves in their club's
membership and link that membership to their name in the league, and Green
Dot reads in the cards that meet the league's rules. The use case it was
built for is a **winter league**.

Partner access to Golf Ireland's Clubhouse API was asked for in October
2026 (the email is at the bottom). Everything here is built on the
assumption that it is granted, **club by club** (below). Until it is, and
until their documentation arrives, the one file that would talk to them
refuses every call, and **no Golf Ireland branding goes on the live site**.

## How access is expected to come: club by club

The working assumption (Ross, October 2026). If Golf Ireland grants
anything, it will be at **club level**: Golf Ireland gives Green Dot access
to one club's members, **with that club's permission**. It will not be a
national door that any golfer opens for themselves. So:

- **A club is the unit of access.** Green Dot holds one credential per
  club that has said yes, and reads that club's members and their cards
  with it. Nothing is reachable for a club that has not said yes.
- **Players do not sign in to Golf Ireland.** They search their club's
  membership on Green Dot, find themselves, and link that member to their
  name in the league. No Golf Ireland login and no per-player tokens.
- **A league is tied to the club or clubs it draws on.** The creation form
  offers only clubs that have granted access. A winter league is usually
  one club's own; an inter-club league names each club, and each player
  searches their own club's membership.
- **A club can withdraw.** Its credential is then ended, every link to its
  members ends with it, and their imported cards are deleted, the same as
  each of them unlinking.

### The membership search

The search gives a player a way to find *themselves*. It must not become a
way to browse a club's members, which is the club's data, not the player's.

- **Searched, never listed.** No member list is shown. A search needs a
  surname, or a membership number, and returns only close matches inside
  the league's clubs.
- **A match shows only enough to recognise yourself**: the name, and the
  membership number partly hidden. No handicap, no address, no history
  until the link is made.
- **The search runs on the server**, on the club's credential. It is never
  in the browser and never cached beyond the request.
- **One member feeds one player per league**, and one player has one
  member. This is the same rule the Strava links keep.

### Proving a member is who they say

Without a Golf Ireland sign-in, nothing stops somebody picking another
member's name. The assumed answer, until Golf Ireland offers better:

- **The player ticks consent and picks themselves**, and that is a link
  *requested*, not made. No card is read for it yet.
- **The organiser confirms it.** They know their members, and this is the
  league's existing require-approval answer put to work. Confirmed, the
  cards are read.
- If Golf Ireland offers its own check (a code sent to the member's
  registered email, or a confirmation in their app), it replaces the
  organiser's step. Both shapes should be asked for.

## The model

| Piece | Where | What it is |
|---|---|---|
| The rules | `lib/golfIreland.ts` | Every decision, pure: the score source, the inclusion rules, what a card must be (`normaliseCard`), whether it counts (`cardIssue`), what a sync adds and removes (`planImport`), what a player may put forward (`pickIssue`). **All of it holds under the club model unchanged** |
| The client | `lib/golfIrelandClient.ts` | The calls Green Dot needs. **A placeholder until the documentation arrives**: every call refuses with `GolfIrelandNotReady`. **Its shape predates the club model** (see below) |
| The league's answers | `lib/leagueSetup.ts` | `scoreSource` and `golfIreland` ride on `trips.bracket_setup` with the league's other answers, so the question needs no migration |
| The tables | migration 056 | `golf_ireland_members`, `golf_ireland_links`, `golf_ireland_cards`, `courses.golf_ireland_id`. All three tables closed to the browser. **Written for per-player sign-in** (see below) |
| The tests | `npm run test:golf-ireland` | Against a fake Golf Ireland that pages its cards and can fail a page |

### What the club model changes in what is already built

Stages 1 and 2 were written assuming each player signs in to Golf Ireland,
the way Strava works. Under the club model:

- **The rules (`lib/golfIreland.ts`) stand.** Which cards count, the card
  checks and the sync plan do not care how access was given.
- **The client changes shape.** Out: the sign-in link, the code exchange
  and per-player refresh. In: a club credential, `searchMembers(club,
  query)`, `cards(club, member, from, to)` and a check that the club's
  access still stands. The signed `state` (`lib/signedState.ts`) stays
  Strava's; Golf Ireland no longer needs it.
- **Migration 056 needs revising before anything uses it.**
  `golf_ireland_members` holds a token per member. Under this model it
  becomes a plain record (member id, club, name), and a new
  `golf_ireland_clubs` table holds the one credential per club with when
  it was granted and withdrawn. `golf_ireland_links` gains when the
  organiser confirmed the link. **Don't apply 056 yet.** If it has already
  been applied there's no harm, because nothing reads it, and the revision
  becomes a migration on top of it.

## What the organiser decides, in the league's creation form

**Which clubs** the league draws its members from: only clubs that have
granted Green Dot access are offered. Under the club model this sits with
the rules below.

**Where the scores come from** (`ScoreSource`): scored here live, from
Golf Ireland, or both. Absent is live, which is every league stored before
the question.

**Which Golf Ireland cards count** (`GolfIrelandRules`), asked only when
Golf Ireland is a source:

- **How a card gets in**: every card that qualifies, automatically, or the
  players choose which of their qualifying cards to put forward.
- **Holes**: 18, 9, or either.
- **Days**: any, or chosen weekdays ("only Saturdays"). Every day ticked is
  stored as absent, the same as none.
- **Where**: any course, or the league's own venues only. Venues are
  matched on `courses.golf_ireland_id`, so a venue not yet matched cannot
  take a card. For a club's own winter league this is usually its own
  course.

Every card must also fall inside the league's dates. A series has no dates,
so its window runs from the day it was made with no end (`leagueWindow`).

**Scored both ways**, a player who scored a league day live already has
that day's card in the league. A Golf Ireland card from the same day is set
aside ("Already scored on Green Dot that day") so the round never counts
twice. The live card is kept because it is the league day's own. Flipping
that is one line in `cardIssue`.

## What a player's link means

- **Consent is ticked before linking** and stored with the link
  (`golf_ireland_links.consented_at`). The club's permission covers Green
  Dot reaching its members; the player's own tick covers their cards on
  the league's board. Both are needed.
- **A link is only made once it is confirmed** (above), and no card is read
  before then.
- **Unlinking deletes their imported cards at once** (decided October
  2026), and their standing re-tells without them. The app does the
  deleting, explicitly, because nothing cascades from a link row.
- **The club withdrawing does the same** for every one of its members.
- A refused request on the club's credential is a retry, never a deletion,
  the same rule as Strava's refresh. Only a withdrawal Golf Ireland confirms
  ends a club's access.

## What is assumed about Golf Ireland until their documentation arrives

- Access is per club, granted with the club's permission (above).
- A club's members can be searched by surname or membership number.
- A card carries the day it was played, the course, 9 or 18 holes, and the
  gross and Stableford totals with the handicap of the day. **Hole-by-hole
  scores are welcome but optional**: nothing needs them.
- Only accepted cards are listed. A card that disappears from the list was
  withdrawn, and leaves the league too, but **only when the list was
  complete**: a card missing from a list cut short may be on the page not
  read.

If any of that is wrong, the change belongs in the client and in
`normaliseCard`, and nowhere else.

**The Stableford figure on a Golf Ireland card is Golf Ireland's own**,
played off their handicap of the day. It is the official number, so the
board reads it rather than re-scoring the card through our trigger, and a
card can come from a course this platform does not carry. That is why
imported cards have their own table rather than becoming `scores` rows,
which need one of our rounds and one of our courses.

## Branding

**No Golf Ireland branding goes on the live site** (agreed October 2026)
until Golf Ireland has given written permission to use it. Showing their
logo before then would suggest a partnership that doesn't exist. Every push
to `master` is live, so the branding stays **out of the repository**: not
in `public/`, and not behind a switch. Ross holds the zip Golf Ireland
supplied.

When permission comes, the design is already worked out:

- **What was supplied**: a 1500×500 photo banner, the circle logo
  (719×719, colour on white) and a 32px icon of the mark. No SVG, and no
  brand guidelines.
- **A linked player's badge**: a mini seal (teal ring, white disc, the mark
  cut from the circle logo) beside the name at 20px, read aloud as "Linked
  to Golf Ireland". It reads on both themes down to 16px. The 32px icon is
  too small to stay sharp on a phone, which is why the mark comes from the
  circle logo.
- **The link card**: the logo across the top, **on white in both themes**.
  On the dark palette the teal "IRELAND" nearly vanishes, and recolouring
  their logo isn't ours to do.
- **Courses**: the circle logo as supplied, its square white corners made
  transparent. It shows **only on a course whose figures came from Golf
  Ireland**, never on the hand-researched ones. That needs a marker on
  `courses`, added with the course-data import.
- **The banner stays out.** It is a teal photograph, and the style guide is
  emerald on cream.
- Used exactly as supplied, never recoloured, with a `test:branding` check
  limiting which files may show it, the same discipline as Strava's logo.
- **Ask Golf Ireland for**: an SVG of the mark and the logo, the minimum
  size, clear space, and whether a white version on dark backgrounds is
  allowed.

## Stages

Built the way Green Dot Run was: each stage tested on greendot.live before
the next.

1. **Done.** The rules, the placeholder client and a fake Golf Ireland for
   the tests. Nothing on screen. The rules hold under the club model; the
   client's shape gets revised with stage 2.
2. **Written, but needs revising for the club model: don't apply yet.**
   Migration 056, reworked to hold a credential per club, members without
   tokens, and confirmed links.
3. The creation form's questions: the clubs, where the scores come from,
   and the rules. A warning on the venues step when "league venues only"
   is chosen and a venue is not matched to Golf Ireland yet.
4. Linking a player, on the screen where they claim their name: consent,
   the membership search, the request, the organiser's confirmation,
   unlinking (which deletes their cards). The link also fills in their
   handicap index.
5. Reading the cards: nightly, plus a "Fetch my scores" button and one for
   the organiser. The players-choose list, each card with its reason when
   it does not count. The league board reading Golf Ireland cards beside
   live ones. The scoring tab saying where the scores come from when live
   scoring is off.
6. The privacy notice's Golf Ireland section (written before it opens, as
   `/privacy` promises), the terms, and these docs.

Branding goes on only once Golf Ireland permits it, whichever stage that
falls in.

Later, separately: course and tee data from Golf Ireland (the email's first
point), through the same validators the bulk import uses
(`lib/courseImport.ts`).

## Questions still open

- **What the club's permission looks like on paper.** A form Golf Ireland
  holds, or an agreement between Green Dot and each club? It decides what
  Green Dot keeps as a record of each club's yes.
- **How a member proves they are who they say.** The organiser's
  confirmation is the assumed answer; a check run by Golf Ireland would be
  better.
- **What the membership search may return**, and whether Golf Ireland
  allows it at all, or wants a membership number typed in full instead.
- **What retention Golf Ireland's terms require.** Unlinking deletes at
  once. What happens to the cards when a league finishes is not decided,
  and may be theirs to say. Strava's answer was to freeze the standings and
  delete the copies (`docs/run.md`).
- **Whether a league board may show another player's card total.** It is
  what a league is, and the consent says so, but it is worth having in
  writing, as it was with Strava.
- **Logo use**: written permission, an SVG, and their guidelines (above).
- **The environment variables**: `GOLF_IRELAND_CLIENT_ID`,
  `GOLF_IRELAND_CLIENT_SECRET`, `GOLF_IRELAND_API_BASE` (https only). All
  three unset means Golf Ireland is not set up, and every league scores live
  as before. Under the club model the per-club credentials live in the
  database, not here; these remain Green Dot's own partner keys.

## The email, October 2026

> **Partner API enquiry: Green Dot, live scoring for golf societies and leagues**
>
> Dear Golf Ireland team,
>
> I'm writing to ask about partner access to the Clubhouse API for Green Dot
> Golf (greendot.live), a live-scoring platform I've built and run
> independently.
>
> **About Green Dot.** Green Dot gives golf trips, societies and small events
> live hole-by-hole scoring, with leaderboards that build themselves from the
> scores submitted by users across stroke play, Stableford, team and match
> play formats.
>
> The platform carries close to 90 Irish course ratings, each researched and
> checked by hand. We have run a number of golf trips, which is what I
> initially devised it for.
>
> **What I'm asking for.** I'd propose a read-only integration:
>
> 1. Course and tee data (course rating, slope, par, stroke index, and PCC
>    where available). This would replace manual research and make every
>    playing handicap on the platform match the official figure.
> 2. Consent-based access to a golfer's Handicap Index and score record, only
>    for players who explicitly link their own account, and revocable at any
>    time. This would allow season-long orders of merit for societies and
>    groups, fed by rounds already recorded with Golf Ireland.
>
> I am not seeking to post or amend scores.
>
> Green Dot is self-funded and free to use, with no advertising and no
> current plans to monetise. I'm not in a position to pay licence fees at
> this stage. If the platform grows as I hope, there is a clear use case in
> running local leagues that may garner a small fee.
>
> **Data protection.** Any integration would be read-only, limited to
> consenting players, and handled under GDPR, with data kept only as long as
> a league needs it. I'm happy to complete whatever due diligence,
> agreements or sandbox testing your process requires.
>
> Other national bodies already support this model. The Danish Golf Union
> allows independent apps to look up member handicaps with the player's
> consent, and the USGA licenses independent apps such as TheGrint as
> handicap data affiliates that sync with GHIN.
>
> I'd be grateful for the chance to discuss this, or to be pointed to the
> right person.
>
> Kind regards,
> Ross O'Grady, support@greendot.live
