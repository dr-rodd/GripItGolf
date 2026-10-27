# Event use cases

How real groups use a Green Dot Golf event, told as stories, by Ross. Each
story is followed by what it means for the build: what is already there,
what is new, what is still to be answered, and the order to build it in.
One section per use case. More are coming.

The stories decide the design. Where this file and the code disagree, the
code is what is live and this file is what was decided: the difference is
work still to do, and each section says which parts are built.

## The three shapes, as decided October 2026

A tournament is asked its shape in time before anything else
(`LeagueSchedule` in `lib/leagueSetup.ts`). Writing the winter league down
settled what two of the three shapes mean:

- **Series**: a run of **distinct events**, each with its own result, that
  together feed an overall leaderboard. The events may be **unplanned**
  (added one at a time as the group plays) or **recurring** (a number of
  events, every so many weeks or months).
- **Continuous**: a **period** in which players submit scores. **No
  leaderboard for an individual day**: the overall is the only result.
- **Standalone**: unchanged. One day, or a run of days.

**What this changes.** A series used to be a numbered list with no dates
at all, and "every Wednesday" belonged to continuous, which picks its
playing days inside a period. Under the decision above, a set of dated,
repeating playing days is a series (each Wednesday is its own event), and
continuous loses its day picker. **The series half is built** (stage 1,
below); continuous keeps its day picker until stage 6. No real league had
been created when this was decided, so nothing live needs carrying over.

## 1. A winter league (series)

### The story

A club's winter league. There are rules for the overall leaderboard (the
overall board is already built), and the leaderboard page shows **each
event's results and the overall**.

**Unplanned.** At the start of play somebody adds the day's event on the
Scoring tab by choosing its date. Every player in the group linked to Golf
Ireland who hands in a card **on that course that day** has it counted for
that event automatically.

**Recurring.** Alternatively the league is planned: so many events, every so
many weeks or months (every Wednesday, say). **The next event appears the
day after the previous one**, to build a bit of anticipation, rather than
the whole winter being on show from the start.

**Not every event counts.** If there aren't enough players, or the day is
rained off, the event can be set **not to count** towards the overall,
before or after it is played. It still has its own leaderboard if anybody
scored, but that leaderboard is clearly greyed out. This is a formal
version of the casual rounds trips already have.

**Not every card counts.** Any single player's card on an event can be set
not to count, behind a PIN pop-up. This is mainly for Golf Ireland: a player
in the group might be playing a *different* Golf Ireland competition on the
same course that day, and their card must not be swept into the league by
mistake.

**The Scoring tab is the league's history** as well as where scores are
entered: every event in a list. A gear on it opens an event's
settings: whether it counts, which players' cards count, and the handicap
for that day.

### What is already built

- **The overall board and its rules**, chosen in the league's creation
  wizard (the embedded `LeaderboardSetup`).
- **The "how do the days relate" answer** (`dayBoards`: separate, one
  running total, days and overall), and the code that reads it on the
  leaderboard (`boardGrouping`). But a day only gets a leaderboard of its
  own when the organiser makes one by hand, on the per-day formats page
  (`/trip/[code]/organiser/days`).
- **Series creation**: a numbered list of events, a venue each, no dates.
  More events can be added later through Trip Setup, reached from the
  organiser area.
- **Casual rounds** (`rounds.casual`): scored as usual, kept off **every**
  leaderboard, including the round's own. The switch lives on a trip's
  round page and is hidden on events. The round summary already shows a
  casual round's result by reading it with the flag cleared, which is the
  precedent for a greyed-out event leaderboard.
- **Golf Ireland**, stages 1 to 4 (`docs/golf-ireland.md`): the league's
  rules (which clubs, every qualifying card or players choose, 18 or 9
  holes, which weekdays, any course or league venues only), and players
  linking themselves to their membership, confirmed by the organiser.
  **Reading the cards (stage 5) is not built**, because it waits on Golf
  Ireland's documentation. And today a card is matched to the league's
  *dates*, never to a particular event.
- **The Scoring tab** lists the rounds. Adding a round from it is a trip's
  door and is switched off on events.
- **The organiser PIN**, which can be asked for in place (`InlineUnlock`)
  rather than sending anybody to the organiser area.

### What is new

1. **Dated series events.** Each event carries a date. Unplanned: an "Add
   the next event" button on the Scoring tab (date and venue). Recurring:
   the creation wizard asks how many events, how often (every N weeks, or
   every N months) and from when, and makes them all.
2. **The next event appears the day after the previous one** on the hub and
   the Scoring tab. The organiser area still shows the whole plan.
3. **Every event gets its own leaderboard automatically**, beside the
   overall, without anybody making a day board by hand. It is the overall
   board's rules read over that one event, worked out on screen rather than
   stored as a second board, so the two can never disagree.
4. **An event that does not count.** Set before or after; the overall skips
   it; its own leaderboard still shows, greyed, saying it does not count.
5. **A card that does not count.** One player, one event, behind the PIN.
   The same switch serves the Golf Ireland mix-up and any other reason.
6. **A Golf Ireland card belongs to an event** when it was played on that
   event's date at that event's venue. Part of Golf Ireland's stage 5.
7. **The gear on the Scoring tab**: an event's settings in one place
   (counts or not, whose cards count, the day's handicap).
8. **Continuous, redefined**: a period, any qualifying score counts, no day
   leaderboards. Its "every week on one day" option moves to the series.

### Ross's answers (October 2026)

1. **Two levels of settings.** The organiser area (the "settings page")
   governs the whole event and sets the **default rules for each event**.
   The gear on the Scoring tab manages **one event**: switching a submitted
   round off — **a toggle, never permanent**, because it may be done by
   accident — and overriding any of the defaults for that day, the handicap
   setting among them. The overrides sit in their own sub-tab so the gear
   stays uncluttered.
2. **Who may change what is decided in the creation form** (the
   participant permissions), and the sensitive things sit behind the PIN.
3. **No real leagues have been created yet**, so continuous can change
   freely.
4. **Monthly keeps the weekday** — the second Wednesday, not the 14th.

Second round of answers, the same day:

5. **Words.** Within a league the events are **rounds** ("Round 3"), the
   whole is the **league**, and the players are **the field**. "As you go"
   is **Ad hoc**.
6. **One venue is presumed.** Same venue every round is on by default; off,
   each round picks its own or is left **TBC**. A TBC round cannot go live
   or take scores until somebody chooses its venue, on the Scoring tab or
   the hub, where every upcoming round is listed and a TBC one is paler
   until it is chosen. Choosing a venue can be the organiser's alone (PIN)
   or the field's — a permission in the creation form and the organiser
   area.
7. **The field on the homepage.** Adding a player happens on the hub's
   field list, by anyone when `add_players` is on, behind the PIN otherwise.
8. **The handicap setting per round is the allowance.** A handicap **cut**
   between rounds is a good idea kept for later, in
   `docs/pending-concepts.md`.

Still open:

- **Golf Ireland's cards**: worth asking them whether a card says which
  competition it was played in. If it does, a card can be matched to the
  league's own competition and the mix-up in the story can't happen at all;
  the card switch stays as the backstop.

### Build order

Each stage tested on greendot.live before the next, as with Green Dot Run.

1. **Dated rounds — built, October 2026, no database change.** The
   creation wizard asks a series **Ad hoc** or **Recurring**, then the first
   round's date; recurring adds how often (every 1–12 weeks or months) and
   how many rounds, and makes them all (`seriesDates` in
   `lib/leagueSetup.ts`; monthly keeps the weekday, and a fifth Wednesday
   carries on as the last). The repeat is stored (`LeagueSetup.repeat`) and
   the count is the rounds'. The trip runs from the first round to the last,
   each at its calendar offset from the first, as a continuous league's days
   are. **Same venue every round** is on by default; off, each round picks
   its own or is left **TBC**.

   **A TBC round is a dated golf item with no course and no `rounds` row**
   — `rounds.course_id` is NOT NULL, about forty files read a round's
   course, and a round nobody can score is better not existing than
   existing at a course it is not at. So it cannot go live by construction,
   and no screen that reads rounds had to change. Its number is held by its
   place in date order: `leagueRounds` lists a league's rounds, TBC ones
   included, numbered, and `nextRoundNumber` gives the next; creation writes
   `round_number` = date position, leaving a TBC round's number free.

   The Scoring tab and the hub's Schedule both list the league's rounds
   (`app/trip/[tripCode]/LeagueRounds.tsx`): a TBC round paler and dashed,
   "Tap to choose the venue" (`TbcRoundTile`), and **Add round** on the
   Scoring tab — a date after the last round (`nextRoundIssue`), the last
   venue presumed, or TBC. Both write through `lib/leagueRoundStore.ts`, not
   `saveItinerary` (whose "last + 1" would hand a held number to somebody
   else): the trip's end moves on first; a TBC item is claimed only while
   still TBC, so two phones cannot both make its round; a round that cannot
   be made leaves no half-made item. Who may: the organiser with the PIN,
   asked in place, or the field through the series-only permissions
   **`add_rounds`** and **`set_venues`** (`permissionsFor` keeps them off
   every other event's list). The picker's add-course door reads
   `add_courses` there (`CourseSelect`'s `allowAdd`). A dateless series made
   before this keeps its numbered list. On the way: a round added after
   creation no longer gives a pending handicap a scratch snapshot
   (`addRounds` in `lib/itineraryStore.ts`).
   **The Field — built, October 2026.** On an event the hub's Players
   section is **The Field**, and under the names sits **Add a player**
   (`app/trip/[tripCode]/AddToField.tsx`): somebody else's name, unclaimed,
   for its owner to claim — the join screen is still where a player adds
   themselves. Anyone may when `add_players` is on, the organiser with the
   PIN asked in place otherwise. A blank handicap is pending; a given one is
   snapshotted onto every round that exists. A trip's hub is unchanged.
2. **Every round's own leaderboard, and rounds that do not count — built,
   October 2026, no database change.** A league's leaderboard has a round
   switch, **Overall · Round 1 · Round 2…**, in the course switch's place
   (`series` on `TripLeaderboardClient`): a round's leaderboard is the
   league's own boards read over that round alone through `withOnlyRounds`,
   worked out on screen, never stored as a second board. A round can be set
   **not to count** — rained off, short of players — from a **gear** beside
   its tile on the Scoring tab (`RoundSettings` in `LeagueRounds.tsx`; the
   organiser's, PIN asked in place). Off is `rounds.casual`, the flag a
   trip's casual round uses, so the overall skips it through the one rule in
   `buildRows`; picked on the switch, its own result still shows, read with
   the flag cleared for that round alone (the round summary's way) and
   greyed under a line saying it does not count. Never permanent: the scores
   are untouched, and switching back counts them again. The Scoring tab, the
   hub's round list and the round's own page say "Doesn’t count".
3. **The gear, filled in — built, October 2026, no database change.** The
   gear beside a round on the Scoring tab opens on **Round** — whether the
   round counts (stage 2) and **each player's card in it**, a toggle each —
   with **Rules** on its own tab: **the round's handicap allowance on each
   leaderboard**, the league's own as the default ("League (95%)", 100, 95,
   90, 85). All the organiser's, PIN asked in place; nothing touches a score.

   *A card that does not count* is a key `${roundId}:${playerId}` in
   `LeagueSetup.cardsOff` (`cardKey`, `tidyCardsOff`, `cardsOffWith`). It
   was going to need migration 057; it did not, because only the creation
   wizard ever writes a league's setup, and the gear's writer reads it fresh
   and merges (`setCardCounts` in `lib/leagueRoundStore.ts`) so nothing
   else in it is lost. `buildRows` drops a switched-off card first
   (`withoutCardsOff`, beside the round rule), so it is out of every board,
   the round's own included; the hub's cheap standing filters it too, and
   the leaderboard, the hub, a round's summary and the export are all
   handed the list. The in-play panel inside a scorecard does not read it —
   it is the card in your hand. When Golf Ireland's cards arrive (stage 5)
   the same key switches one of them off.

   *A round's own allowance* is `Leaderboard.roundAllowances` (round id →
   percent), read by `allowanceOf(lb, roundId)` wherever a board reads a
   round's cards — the Stableford, strokes and quota paths, team cards, the
   scorecard sheet — and by the live card's handicap switch
   (`allowanceCycle(boards, roundId)`), so the group sees what they are
   playing off. Never stored reduced, like any allowance. Written by
   `setRoundAllowance`, merged into the stored board (`withRoundAllowance`);
   one that only repeats the board's own is dropped on reading. Viewing one
   round on the leaderboard, its facts line gives that round's allowance.
4. **The next round appears the day after the previous one, and the
   Scoring tab as the league's history — built, October 2026.**
   `revealedLeagueRounds` (`lib/leagueSetup.ts`) is the one rule: every
   round dated today or earlier, plus the first after today unless a round
   is being played today, newest first — so the next round sits on top and
   the history runs down. Before the first round the first is shown. The
   Scoring tab and the hub's round list both draw it, and say "N more rounds
   to come — the next appears the day after this one is played" without
   saying when. Adding a round still reads the whole plan, so no number is
   handed out twice. Not yet held back: the hub's up-next countdown, which
   reads rounds directly — on a round's own afternoon it can name the next
   one a day early.
5. **Golf Ireland cards to rounds, by date and venue — built, October 2026,
   against the fake; live once Golf Ireland's documentation arrives.**
   A card belongs to a round when it was played on the round's date at the
   round's venue (`roundForCard` in `lib/golfIreland.ts`, Golf Ireland's id
   for the venue being `courses.golf_ireland_id`). **Worked out on every
   read, never stored**, so a round re-dated or given its venue later picks
   up its cards with nothing to migrate. In a league of rounds a card that
   is no round does not count, and says which half missed
   (`cardIssue` with `CardContext.rounds`: not a round's day / not that
   round's venue / that round's venue not matched to Golf Ireland yet — the
   last one is ours to fix, not the player's).

   *On the board*: `readRoundCards` (`lib/golfIrelandCards.ts`, server
   only — the table is closed to the browser; asks nothing unless the
   league reads Golf Ireland) places the stored cards on their rounds
   (`cardsOnRounds`, one card a player a round, the lower card id kept) and
   hands them to the board as `RowContext.roundCards`: the leaderboard as a
   prop, the hub and a round's summary through `fetchTripContext`, the
   export too. `buildRows` reads one only for a player with **no Green Dot
   card in that round** — a round scored here is the round's own. A
   Stableford board takes Golf Ireland's points as they stand (the official
   figure; with no holes there is nothing to restate under an allowance), a
   strokes board takes their course handicap off the gross, cut by the
   board's allowance; quota and team boards read none, because they need
   the holes. The round's tile on the board says "Golf Ireland card" and
   opens no empty scorecard. The hub's cheap standing hands a Golf Ireland
   league to the full path.

   *The way out*: the round's gear lists a Golf Ireland card beside the live
   ones ("Golf Ireland card · 34 points") and switches it off by the same
   `cardKey`, through the same `withoutCardsOff`. The Scoring tab reads the
   round as "Scores in" once a card is on it.

   *Reading the cards in*: Fetch my scores (the player's link card) and
   Fetch everyone's scores (the organiser area), through `syncLeague` —
   `docs/golf-ireland.md`, stage 5. In a league of rounds every card is
   checked against the rounds before it is stored.

   *Still waiting on Golf Ireland*: the cards arriving at all — the
   client's five calls refuse until the documentation arrives, so both
   buttons say Golf Ireland is not connected yet; the nightly run comes with
   the real client. And `courses.golf_ireland_id` has to be filled in for a
   venue before it can take a card — nothing on screen sets it yet.
6. **Continuous, redefined.** After question 3 is answered.

## 2. Corporate match play (a knockout)

### The story

Ross, October 2026.

> A corporate match play: a knockout over a period, matches played on
> different courses — people play whatever course they are a member of and
> bring a guest. Match play in general has dates that rounds need to be
> completed by. A standalone match play (one day, or a weekend at one
> venue) has more flexibility in formatting, and the leaderboard page
> becomes the bracket page. Up to 64 competitors for now.
>
> If it's a match play event there is no need for stroke play: people
> amend the bracket with the long press, as they do now. But give an option
> on the add page for a match play input — players enter scores and it
> informs the match. Every score can be overridden, but a result finalised
> by manual entry needs a PIN to change.
>
> Because the course isn't known until the match is arranged, the shots
> given and received aren't known either until the course is chosen.
> Players set a home club from the homepage, and can add contact details if
> they want.
>
> For added security the creation form can have a separate public PIN and
> admin PIN, so other people can't get in and change things.
>
> The homepage is a bird's-eye view of the tournament — maybe some stats,
> such as matches played — but mostly what matters to the player: their
> next match. Tapping into it they choose the venue, amend their handicap,
> and go to scoring. The Scoring tab is a portal of the bracket rounds, each
> tapped through to its matches; the player's own match is at the top,
> active, and the others are listed but inactive.
>
> Most of this is built and just needs linking together.

### What is already built

- **The draw and its storage**: `matchplay_matches`, one row per match
  (migrations 014/016/019), drawn by `generateBracket` in `lib/matchplay.ts`
  (seeded in registration order; byes settled at the draw) and written by
  `createBracket`. Pairs draws too.
- **The bracket page** (`/trip/[code]/matchplay`, `MatchplayBracket.tsx`):
  the progression styling — a decided match tinted, the winner's bar and
  margin, the champion filled, faded columns and dimmed connectors — and the
  **long press** that opens the decide sheet (margin, winner, a warning that
  later results are voided). No PIN on it.
- **Deciding from the cards**: a bracket round linked to a golf round
  (`roundLinks`), decided by one of eight methods (`lib/matchDecision.ts`),
  applied in the browser to empty matches only; "Cards disagree" when a card
  changes after.
- **The setup form** (organiser area → Format): strict or relaxed, a field
  ceiling, entry, a qualifier, **a deadline per bracket round**, finalise.
  Stored in `trips.bracket_setup`. The draw reads none of it yet, and the
  deadlines show nowhere but the form.
- **The hub's next-match line** (`lib/nextMatch.ts`): "Plays Ross ·
  Semi-Final", one caption, no link.
- **Creation**: continuous → match play has its own lean door
  (`CreateKnockoutForm`: name, period, field, PIN). Standalone → match play
  is the trip wizard with nothing telling it match play was picked. **Neither
  writes a match play leaderboard**, so the bracket says "Match play isn't
  switched on" until somebody adds one in Trip Setup.

### What is new

1. **Match play as its own shape** on the tournament door, beside
   standalone, continuous and series — then one-off or ongoing.
2. **A match play event plays from creation**: its board is made with it,
   so the bracket is on.
3. **The deadlines at the top of the bracket**, each round's "play by".
4. **The leaderboard tab is the bracket** on a match play event.
5. **Up to 64** (the draw stops at 32 today).
6. **The hub's next match as a card**: opponent, deadline, venue, your
   handicap, and the way to scoring; plus a bird's-eye line (matches played).
7. **The Scoring tab as the bracket's portal**: the rounds, each opening its
   matches, your own on top and active.
8. **A match's own course**, chosen when it is arranged, so the shots
   given and received can be worked out. Needs a column on
   `matchplay_matches` — a migration.
9. **A home club** on a player, and optional contact details, set from the
   hub. Columns on `players` — a migration.
10. **A match play card on the Add page**: players enter the holes, the
    match is told the result; overridable; a manual result once finalised
    needs the PIN.
11. **A public PIN beside the admin PIN.** A second hash on `trips` — a
    migration. What it locks is question 1 below.

### Will it break at 128 or 256?

Not in the logic: the draw (`seedOrder`), round names ("Round of 128"),
the progression and the database columns all work for any power of two. The
draw's own ceiling is a constant (32 today, 64 from stage 1), set low on
purpose. What strains is the bracket screen: tiles are a fixed 98px apart,
so a 128 field's first column is about 6,300px of scrolling and 256 twice
that. It works, slowly. Going past 64 is a screen job (a zoomed-out
overview, or one column at a time), not a rebuild.

### Ross's answers (October 2026)

1. **Two PINs.** The **public PIN** protects entry to the league and
   viewing its pages. The **admin PIN** (today's organiser PIN) protects
   destructive actions within the event and overriding scores.
2. **Contact details: the player chooses** — shown to the public (the
   field) or to their opponent only.
3. **The match play card is shots per hole** — each player's gross, the
   shots worked out from the course — **with a concession option** for a
   clear win, so a hole (or the match) can be given without entering
   scores.
4. **Build in pairings.** Pairs draws exist; the card and the match page
   carry them too. Event creation will need reworking eventually to be less
   onerous — noted, not now.

### Build order

1. **Match play as its own shape, playing from creation — built, October
   2026.** The tournament door asks the shape alone: Standalone, Continuous
   and Series go straight to the league wizard (the format question is
   gone), and **Match play** asks when the matches are played — **One-off**
   (the event wizard, `CreateTripForm matchPlay`) or **Ongoing** (the lean
   knockout door). Both are made with the bracket's board (`knockoutBoards`)
   and the seed `{ format: 'match_play', schedule? }` (`knockoutSeed`), and
   `isKnockoutEvent` reads that raw seed — the parser refuses a partial. The
   draw goes to 64 (`MAX_BRACKET`; the setup offers 16, 32, 64). **The
   date each round is played by sits under the round's name** — "Play
   by Sat 14 Nov" (or "Was due…" in rust once past with a match still
   open) — the setup's deadlines lined up with the rounds actually drawn
   from the Final backwards (`drawDeadlines`, `deadlineNote`). **The
   leaderboard tab is the bracket** on a match play event whose boards are
   all match play (a redirect to `/matchplay`, which keeps the tab lit and
   drops its back-to-leaderboard button); add a board beside the draw and
   the table returns, its strip linking to the bracket as on a trip. The
   draw itself is still made from Trip Setup's match play panel, reached
   from the organiser area.
2. **The hub's next match and the Scoring tab's portal — built, October
   2026.** `lib/knockoutPortal.ts` reads the draw from one player's side
   (pure: `portalRounds` — every bracket round with its play-by date and
   "n of m played", the player's own match first, byes not listed as
   matches; `currentRound`, `myNextMatch`, `describeProgress`,
   `describeResult`), fed by `readKnockout` (`app/trip/[tripCode]/
   knockout.ts`: the rows in one shape for singles and pairs, a pairs
   entrant being the pairing on the draw's own sheet). **The hub** carries
   `NextMatchCard` on a match play event — "Your next match · Quarter-Final",
   "v Dave", the play-by date (rust once past) — opening the match, with
   the draw at a glance under it ("12 of 31 matches played · Quarter-Final");
   the one-line caption stays a trip's. **The Scoring tab** is the bracket's
   portal (`KnockoutPortal`): a card a round, the current one open, the
   player's own match on top, active, the others listed with their results,
   greyed and inert. **A match's own page** (`/trip/[code]/match/[id]`):
   who plays whom, the round, the play-by date, each side's handicaps, the
   result once there is one, and the player's own handicap amended in place
   (`MyHandicap`, written as Trip Setup writes it). The result is still
   recorded on the bracket by the long press.
3. **A match's course and the shots; a player's home club and contact
   details; the walkover; the PIN on a result already in — built, October
   2026. Needs migration 057, applied by hand.** Migration 057 gives
   `matchplay_matches` its `course_id`, `played_on` and `tees` (`{ player
   id: tee id }`), `players` a `home_course_id`, and makes
   `player_contacts` — phone, email and who sees them — **closed to the
   browser** (RLS on, no policies, the server's grant only), because an
   opponent-only number cannot sit in `players`, which anybody with the
   code can read. `lib/matchArrangements.ts` is the one copy of the rules:
   `matchStrokes` (each tee's course handicap, the draw's allowance off the
   unrounded figure, then the difference from the lowest — singles and
   fourballs alike; nothing until every player has a handicap and a tee),
   `shotHoles` (through `shotsReceived`, the ladies' index for a woman),
   `normaliseContact`, `contactShown` (yourself always; the field when
   public; the opponent only otherwise) and `walkoverChoices` (a player
   concedes an open match to the other side; the organiser awards either
   side, a result already in included). **The match page** shows the venue
   and day, each player's tees, "Gets 4 shots · holes 3, 7, 11, 15", and
   each contact as allowed, with **Choose the venue** (`MatchArrange` — the
   players' home clubs as chips first, the course picker, the day, a tee
   each; the players in the match, or the organiser with the admin PIN) and
   **Walkover** (`MatchWalkover`, written through `persistWinner` as "W/O"
   so later rounds cascade exactly as the bracket's own sheet does). The
   arrangement is read in its own fail-soft query, so the page stands
   before 057. **The hub** carries "Your home club and contact"
   (`MatchDetails`): the home club on the player row, the contact through
   `/api/match/contact`, saved only for the player this phone claimed.
   **On an event's bracket, changing a result already in needs the admin
   PIN** (`MatchplayBracket`'s `lock`, asked in place before the change
   sheet opens); recording an open match stays open, and the cards still
   fill empty matches by themselves. A trip's bracket is unchanged.
4. **The match play card — built, October 2026. Needs migration 058,
   applied by hand.** Ross: a slightly different card from the usual one,
   **the top of the draw on the left and the bottom on the right**, players
   entering their own scores with **a concede-hole button**; a result the
   card settles **completes in the bracket by itself**, and is amended with
   the admin PIN; **the admin PIN also finalises a match that doesn't
   feature the user**. Migration 058: `match_scores` (a player's gross a
   hole, keyed match/player/hole so two phones interleave) and
   `match_concessions` (a hole and the side that gave it), browser-written
   like every scorecard, RLS on with open policies, granted by name.
   `lib/matchCard.ts` is the one copy of the card's rules: `shotsOn` (the
   arrangement's shots on this hole's index), `holeOutcomes` (a pairing's
   better nett; **a hole counts only once it is finished on both sides**,
   or conceded — the bracket's `readMatch` treats a hole one side has as
   lost, right for a signed card, wrong on the green), `cardState` (the
   wording is `matchDecision`'s `marginLabel`/`progressLabel`, now exported
   — "3&2", "2 up thru 14"), `openingHole`, `shouldWrite`. **Level after
   18 they go down the 19th** (Ross, 21 Oct 2026; migration 059 widens the
   card's hole numbers to 36): `playCard` adds extra holes played off the
   course's own holes — **the 1st by default, changed by a dropdown on the
   hole** (Ross, 21 Oct; `extraCourseHole`, `matchplay_matches.extra_holes`,
   migration 061), each later one following on from the one before — shots
   as the round gave them, until one is won — "at 19th" — and `cardState` stops counting the moment a match
   is settled, so playing out a 3&2 for fun cannot change it. **The card**
   (`/trip/[code]/match/[id]/card`, opened by **Score this match** once the
   shots are known): one hole at a time, a strip of all eighteen showing
   who won each (◂ ▸ =), each player's − and + with their shots as dots, a
   Concede hole button under each side; every tap saved as made, one write
   at a time per box; re-read every fifteen seconds through `usePoll`. Once
   settled the result goes into an empty match by itself (`persistWinner`,
   so the next round fills); from then on the card is read-only and changes
   need the admin PIN, as on the bracket, and over a result already in
   (entered by hand, a walkover) only the organiser's deliberate **Put … in
   the bracket**. A match the viewer is not in is read-only until the admin
   PIN is entered.
   **Built (stage 4, with Ross's 21 October additions):** the live board
   — every open match with anything on its card, read on the server through
   the card's own setup (`readLiveMatches` in
   `app/trip/[tripCode]/match/matchCards.ts`), a **Live now** section at the
   top of the Scoring tab's portal (each opens its card, read-only to anyone
   not in it), a green Live line on a match in the round lists and on the
   hub's next-match card when it is yours; refreshed through `usePoll`.
   And the result colours, sitewide (`lib/resultTone.ts`): **gold for
   winning, the duller gold for up, the brown for down, solid brown for
   lost, green for live and nothing else**.
5. **The public PIN** (entry and viewing), beside the admin PIN. **Built**
   (migration 060, `trips.public_passcode_hash`, applied by hand):
   `lib/publicPin.ts` is the one copy. Optional, set at creation on every
   event door (`PublicPinField`; never the admin PIN itself) and changed or
   taken off in the organiser area (`PublicPinCard`). The trip layout reads
   it alongside the kind and **redirects** a phone that has not entered to
   `/enter/[code]` — a redirect, because a layout renders beside its page
   and a gate drawn in place of `children` would still send the page. The
   door takes the public PIN or the admin PIN (which also unlocks the
   organiser's side) and leaves a cookie holding the PIN's hash, so changing
   the PIN asks everybody again. The same soft lock as the admin PIN.
6. **The draw** (Ross, 21 Oct 2026). **Built:** the whole draw can be made
   in the creation form (both match play doors, `CreationDraw`), left for
   later, or **set for a date and made by the nightly job** (`/api/cleanup`
   → `app/api/match/dueDraws.ts`) from whoever has joined by then — at
   random, by handicap, or in an order the organiser set (late joiners after
   by handicap). Three ways to make it (`lib/bracketDraw.ts`, the one copy;
   `BracketDrawer` the one builder, at creation and at
   `/trip/[code]/organiser/draw`):
   - **Random** — out of a hat, drawn again as often as wanted; seated as a
     seeded draw would be, so byes fall where a draw puts them; no seed
     numbers shown.
   - **Seeded** — a numbered list: typing a number moves a player to it,
     dragging the handle renumbers, and it can start from handicap order
     (pending last) or be shuffled as often as liked.
   - **Pick the matches** — the draw sized off the field so far
     (`emptySlots`), each empty place a dropdown of the players not yet
     placed; a place left empty is a bye; a match empty on both sides is
     refused (`manualIssue`).
   Every method produces **the first round, slot by slot**, which
   `bracketFromSlots` (`lib/matchplay.ts`) turns into the tree —
   `generateBracket` is now seeds → slots → that. One writer, `writeDraw`
   (`lib/drawStore.ts`, browser and server alike), which **refuses a draw
   in play** (`drawInPlay`: a played result, or one hole on one match
   card — a bye is awarded, not played). The plan rides in
   `bracket_setup.draw` (`DrawPlan`, `rawDrawPlan`, carried through the
   setup form's save) — **no migration**. Creation gives players their ids
   up front so a draw made there can name them.

   **Next phase — the draw editor (agreed, not built; these decisions are
   why the draw is stored as first-round slots):**
   - Reached from the organiser area behind the admin PIN: the same builder
     with an **edit toggle**, names dragged between places.
   - **Only the base of the tree is ever edited** — first-round places,
     never a later round. A first-round match **in play or finished** (any
     hole on its card, or a result that was played) shows **disabled grey**
     and its players cannot be moved; moving one means voiding that match
     and every one before it first. A bye is not in play and can be
     replaced by a player.
   - Editing a draw in play warns first, in a pop-up that says what will
     and will not be touched, and that in-play cards and bracket results
     can be voided by hand if the organiser wants (the card's own void,
     the bracket's long-press), or the **whole event restarted, voiding
     every score** — the only way an in-play match is ever changed here.
   - **Growing the draw: add a round below.** Unallocated players go in by
     the dropdown, or the system places them. The current first round
     becomes the second; every in-play match's two new feeder places show
     disabled (they are already decided), and new players can only go into
     the parents of vacant places. Ross's worked case: 14 players in play in
     a round of 16 with one vacant place, 4 more join — add a round of 32;
     the in-play matches' parents are grey, and the 4 go into the
     non-disabled parents of the vacant place. This means renumbering
     `round_number` (and the deadlines line up from the Final back, as
     `drawDeadlines` already does), and the stored `roundLinks` by number
     need shifting with it — the one awkward part, to be designed then.
