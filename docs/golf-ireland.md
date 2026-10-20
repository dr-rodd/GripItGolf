# Golf Ireland

A league that reads its cards from Golf Ireland. Players hand their scores
in to Golf Ireland as they always do, link their Golf Ireland account to
their name in the league, and Green Dot reads in the cards that meet the
league's rules. The use case it was built for is a **winter league**.

Partner access to Golf Ireland's Clubhouse API was asked for in October
2026 (the email is at the bottom). Everything here is built on the
assumption that it is granted. Until it is, and until their documentation
arrives, the one file that would talk to them refuses every call.

## The model

| Piece | Where | What it is |
|---|---|---|
| The rules | `lib/golfIreland.ts` | Every decision, pure: the score source, the inclusion rules, what a card must be (`normaliseCard`), whether it counts (`cardIssue`), what a sync adds and removes (`planImport`), what a player may put forward (`pickIssue`) |
| The client | `lib/golfIrelandClient.ts` | The five calls Green Dot needs (sign-in link, code for tokens, refresh, cards, revoke). **A placeholder until the documentation arrives** — every call refuses with `GolfIrelandNotReady` |
| The league's answers | `lib/leagueSetup.ts` | `scoreSource` and `golfIreland` ride on `trips.bracket_setup` with the league's other answers, so the question needs no migration |
| The tables | migration 056 | `golf_ireland_members` (tokens), `golf_ireland_links` (who feeds whom, with consent time), `golf_ireland_cards` (the cards read in), `courses.golf_ireland_id`. All three tables closed to the browser |
| The tests | `npm run test:golf-ireland` | Against a fake Golf Ireland that pages its cards and can fail a page |
| The state | `lib/signedState.ts` | The signed trip-and-player that travels through the sign-in page — **shared with Strava**, one copy |

## What the organiser decides, in the league's creation form

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
  take a card.

Every card must also fall inside the league's dates. A series has no dates,
so its window runs from the day it was made with no end (`leagueWindow`).

**Scored both ways**, a player who scored a league day live already has
that day's card in the league. A Golf Ireland card from the same day is set
aside ("Already scored on Green Dot that day") so the round never counts
twice. The live card is kept because it is the league day's own. Flipping
that is one line in `cardIssue`.

## What a player's link means

- **Consent is ticked before linking** and stored with the link
  (`golf_ireland_links.consented_at`).
- **Unlinking deletes their imported cards at once** (decided October
  2026), and their standing re-tells without them. The app does the
  deleting, explicitly, because nothing cascades from a link row.
- A refused token refresh is a retry, never a deletion — the same rule as
  Strava's.

## What is assumed about Golf Ireland until their documentation arrives

- Linking is a sign-in on Golf Ireland's own page, handing back an access
  token, the way Strava works.
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

## Stages

Built the way Green Dot Run was: each stage tested on greendot.live before
the next.

1. **Done.** The rules, the placeholder client and a fake Golf Ireland for
   the tests. Nothing on screen.
2. **Done, apply by hand.** Migration 056.
3. The creation form's questions: where the scores come from, and the
   rules. A warning on the venues step when "league venues only" is chosen
   and a venue is not matched to Golf Ireland yet.
4. Linking a player, on the screen where they claim their name: consent,
   the sign-in, the callback, unlinking (which deletes their cards). The
   link also fills in their handicap index.
5. Reading the cards: nightly, plus a "Fetch my scores" button and one for
   the organiser. The players-choose list, each card with its reason when
   it does not count. The league board reading Golf Ireland cards beside
   live ones. The scoring tab saying where the scores come from when live
   scoring is off.
6. The privacy notice's Golf Ireland section (written before it opens, as
   `/privacy` promises), the terms, and these docs.

Later, separately: course and tee data from Golf Ireland (the email's first
point), through the same validators the bulk import uses
(`lib/courseImport.ts`).

## Questions still open

- **What retention Golf Ireland's terms require.** Unlinking deletes at
  once. What happens to the cards when a league finishes is not decided,
  and may be theirs to say. Strava's answer was to freeze the standings and
  delete the copies (`docs/run.md`).
- **Whether a league board may show another player's card total.** It is
  what a league is, and the consent says so, but it is worth having in
  writing, as it was with Strava.
- **The environment variables**: `GOLF_IRELAND_CLIENT_ID`,
  `GOLF_IRELAND_CLIENT_SECRET`, `GOLF_IRELAND_API_BASE` (https only). All
  three unset means Golf Ireland is not set up, and every league scores live
  as before.

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
