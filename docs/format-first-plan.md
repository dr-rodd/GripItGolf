# Plan: format first, and the platform names the leaderboard (D77–D90)

Claude Code's plan for the 13 Nov 2026 brief (D77–D90), against master at `407b0d4`, approved by Ross on 13 Nov. Each stage is its own deploy, tested on greendot.live before the next one starts. Nothing below needs a migration through stage 6; stage 7 may not need one either (see there).

---

## What I found that shapes the plan

- **Creation today.** Only a standalone league asks "Enable Dynamic Overall Leaderboard?" The steps are details → field → dynamic → (sessions → overall | venues) → ready. Series and continuous go details → venues → deadlines → field → ready, and never ask a per-round format. A plain league's per-round formats exist only afterwards, on the organiser's "Formats by day" page (boards scoped by `roundIds`). The Finish step holds the leaderboard grid, the days question (`dayBoards`), tee times, collaboration and the PINs. **Stats (`track_stats`) is not asked at creation anywhere.**
- **Storage already holds both shapes.**
  - A league is its whole-event board, plus any day boards scoped to one round.
  - An Overall is `overallBoard` plus one `session: true` board per round.
  - `withOverallOn` / `withOverallOff` / `withSessionFormat` in `lib/sessions.ts` move between the two, and none of them deletes a session board. Nothing new is stored.
- **Names.** A board has no name field. Every tab is `boardTitle(lb)`, used in about a dozen places. "Session n" comes from `sessionName`. "Round n" is typed out in about 15 places. One is wrong today: the round summary says "Round n" on a session.
- **Stage 5's question (what session match cards store).** Answer: one row per player per hole in `session_match_scores`. Singles and fourball store each player's own gross. Foursomes stores the side's one ball under its first player. Nothing writes to `scores` or `live_scores`, and every stroke board reads only those. So **today a stroke board reads nothing from any Matches session**, not only foursomes. A card also stops when the match is settled (5&4 leaves four holes blank), and a conceded hole has no score. `buildRows` gives the round an empty column and carries on.
- **Stroke foursomes (stage 7).** Stroke scoring is per player from end to end: the cards, the locks, `round_handicaps`, and the trigger's points. Nothing models two players on one ball yet. The nearest thing is the session card's "kept under its first player".
- **There are no shared "existing event" fixtures.** Each test builds its own boards, and `test:golden` holds 23 rendered cases. Stage 1 builds the fixture set the brief asks for.

## One principle the stages rest on

**The rule proposes; the stored boards are the truth.**
- `eventShape` runs when an event is made and when a round's format changes.
- Every screen reads the shape from what is stored: an Overall board means Overall. Nothing is re-derived on read.
- This is what keeps old events byte for byte. An event made with Dynamic = Yes over identical Stableford sessions stays an Overall, even though the rule would now say League. It is never switched silently.

---

## Stage 1: the reading rule (no screen changes)

New file `lib/eventShape.ts`, pure, with a test in `scripts/test-event-shape.ts` (added to `npm test`):

- **`eventShape({ formats, tags })`**
  - `formats` is one `SessionFormat | null` per round (null means TBC). `tags` is the tag count.
  - It returns `{ main: 'league' | 'overall' | 'ask', unit: 'Round' | 'Session', ranks: OverallRanks, faceOff: boolean, reason }`.
  - The rules, in order:
    1. TBC rounds are ignored.
    2. Any Matches round → `overall`.
    3. Stroke only, one format → `league`.
    4. Stroke only, different formats → `ask` where they fit one board (the same scoring, every player keeping their own card), else `overall` with the reason (`mixed_scoring`, `shared_cards`).
  - `ranks`: tags when there are 2 or more, else individuals. `faceOff` only when there are exactly two tags and Matches.
  - `unit` is Session exactly when `main` isn't `league`.
  - `reason` is a key the read-back card turns into a sentence (stage 3).
- **`shapeKey(format)`**: the format without its allowance (D86). `formatKey` and `sameFormat` include the allowance and stay as they are for their current callers.
- **`roundFormatsOf(boards, roundIds)`**: reads a stored event back into formats. For each round it takes the session board, else the day board (`dayBoardFor`), else the first whole-event league board that isn't a tags board, else TBC. This is how every existing event goes through the rule in the tests.
- **`storedShape(boards)`**: what is stored. `overall` if `overallOf(boards)`, `knockout` if `hasMatchplay` and nothing else, else `league`.
- **`boardName(lb, boards)`**, the one naming function:
  - the Overall → "Overall"
  - a single board → "Leaderboard"
  - the first whole-event league board when a secondary sits beside it → "Primary"
  - every other board → its `boardTitle`, as today
  - the Knockout → untouched
- **Tests:**
  - every row of the brief's table
  - TBC and empty
  - allowance-only differences giving `league`
  - two tags + Matches → face-off; three tags → no face-off
  - a fixture set in `scripts/fixtures/event-shapes.ts`: a trip with one board, a multi-day league with day boards, a series with a TBC round, a continuous league, a Ryder Cup, an Overall over identical sessions, a knockout. Each is checked through `roundFormatsOf` → `eventShape` and `storedShape`.
  - the input type carries no player count, and a source grep fails if `eventShape.ts` mentions `players`, `field`, `entrants` or `.length` on anything but formats or tags.

## Stage 2: words on screen (display only, events only)

- **Tab text** (`TripLeaderboardClient.tsx`, the tab strip and the title card) uses `boardName` in place of `boardTitle`. A day board keeps "Day n · …".
  - One board: the strip and the title card are hidden today, so nothing visible changes. The bottom tab bar already says Leaderboard.
  - With a secondary: the first tab reads "Primary", and its facts line still says "Stableford · Running total · 95% handicap".
- **Round vs Session** comes from `storedShape(boards).unit`. A small `unitLabel(shape, round, rules)` in `lib/eventShape.ts` replaces the scattered "Round n" strings on:
  - the round summary (fixes "Round n" on a session)
  - the Scoring tab, the hub's league section, `LeagueRounds.tsx`
  - the leaderboard's round switch (Round / Period / Session)
  - The tee sheet, export and bracket strings are checked one by one, and only those that can show on an Overall event change.
- **Trips are not touched until stage 8** (D47). The naming is gated on `isEvent`.
- **Tests:** `test:golden` is updated deliberately in its own commit, and only the cases with two or more boards change (a tab word). `test:leaderboard`'s tab assertions and the `test:periods` source string are updated. A new check: an event with one board renders exactly as before.

## Stage 3: the creation wizard, format first (`CreateLeagueForm`)

- **Steps:**

  | Schedule | Steps |
  |---|---|
  | Standalone, series | details → field → **Format** → (deadlines) → **Settings** → ready |
  | Continuous | details → field → venues ("Where cards are played") → **Format** (one card, plus "Which card counts in a period?") → Settings → ready |

  - No step title says "leaderboard".
  - `STEP_TITLES` keeps its name, because `test:branding` greps for it.
  - The knockout doors (`CreateTripForm matchPlay`, `CreateKnockoutForm`) are untouched. Their bracket is their format.
- **Format step:** `SessionList` becomes `RoundList`, worded by the rule's unit.
  - Each card has a day, a venue (TBC only on a series, as now), an optional name, and a format.
  - **Round 1** asks its format and its settings: handicap %, counting scores, tie rule, and discard where it applies. `FormatPicker` gains the missing questions behind the existing `offers*` gates in `lib/leaderboards.ts`, so the form can't offer what the parser drops.
  - **Later rounds** start as "Same as Round 1". **Change format** (new: today the tiles sit open, and `test:sessions` asserts the words are absent) opens the formats already used, a new one, or Format TBC.
  - "Same as Round 1" with only the allowance changed stays Same, and is stored as `roundAllowances` (D86).
  - A one-round event is one card.
  - The Matches count ("How many matches?") stays on a Matches round's card.
- **Read-back card** at the foot, using the hand-off's spec. It names the board and why, from `eventShape`'s `reason`:
  - "Every round plays Stableford, so the rounds add up to a total."
  - "Your sessions include matches, so each one pays points to the Overall."
  - The facts line comes from `boardFacts`, and two tags show their colours through `lib/matchSides.ts`.
  - Under it, **"Add a secondary leaderboard"** opens today's `LeaderboardSetup` grid for secondaries only.
  - When the main board is the Overall, the card also holds what the Overall ranks and each session's feed (`OverallSetup`, moved here), so "Finalise the Overall" disappears as a step.
- **Settings step:** tee times, who books, collaboration, the PINs and the score source (Golf Ireland), moved unchanged from "Ready to go". **Stats is new to creation:** a yes/no writing `track_stats`, which the create route already accepts.
- **Removed:** `DynamicQuestion` and its Yes→No guard, the "venues" step for a standalone league (venues are on the round cards), and the `dayBoards` question. A round's own format is now a secondary, so "separate / running total / days and overall" has nothing left to answer. Stored answers are still read.
- **Saving** goes through the rule, and only through it:
  - `league`: one board from Round 1's format, with no `roundIds`, first in the list, plus `roundAllowances` for any round whose allowance differs, plus the secondaries.
  - `overall`: today's `overallBoard` + session boards + secondaries, exactly as built (`lib/sessions.ts`).
  - Round ids are made in the browser for both shapes, as the Overall does now.
  - The save becomes one pure function, `boardsForCreation(drafts, shape, answer, secondaries)` in `lib/eventShape.ts`, tested on its own.
- **Tests updated on purpose:**
  - `test:sessions` (the removed question, the key arrays, "Change format" now present)
  - `test:league-setup` (the step and save snippets)
  - `test:periods` (where the period question lives)
  - `test:event-permissions` and `test:tee-sheet` (the snippets that moved to Settings)
  - New: the step list per schedule, and a check that no step title contains "leaderboard".

## Stage 4: stroke rounds in different formats (D90)

- When `eventShape` says `ask`, the read-back card becomes one question with two option cards:
  - **"One total across every round"** → League. The Primary is one board across every round, and each round whose format differs gets its own scoped board as a secondary (the day boards the leaderboard already draws).
  - **"Points per round"** → Overall, by finishing position (`feedFor`'s position default).
- **When does a single total make sense?** (Ross, 13 Nov 2026: "Any rounds that don't fit neatly on a leaderboard get an overall, incl mixing stableford and strokes.") Only when every round is scored the same way (all Stableford, all strokes, all quota) **and** every round gives each player their own card. Stableford beside better ball asks the question (check 5). Stableford beside strokes, quota beside Stableford, and (from stage 7) stroke foursomes beside anything go straight to the Overall, and the card says why. `eventShape` already holds this (`mixed_scoring`, `shared_cards`).
- **What the Primary scores** under "One total" (Ross: ok): Round 1's scoring, individual, at Round 1's allowance, with other rounds' allowances in `roundAllowances`. A round in another format (better ball on day 2) gets that day's own board as a secondary.

## Stage 5: secondaries beside the Overall

- `overallTabs` already lists league secondaries after the Overall. The wizard's "Add a secondary leaderboard" offers them on an Overall event too, through the same grid.
- **What a secondary can read:** stroke rounds only. A Matches session (singles, fourball or foursomes) has no stroke card, as found above. A new pure `unreadRounds(board, boards, rounds)` lists them, and the board's facts line names them, e.g. "Leaves out Session 2" (each fact is held to 28 characters). The board is never refused and the round is never dropped from the board. Added where the leaderboard builds its facts line (`TripLeaderboardClient`), so `boardFacts`' ten callers don't change.
- The grid shows the same note under a secondary before it is saved: "Counts Sessions 1 and 3; Session 2 is matches."

## Stage 6: changing the shape after creation

- **The Session formats page becomes the Formats page**, for every league event (`/organiser/sessions`, and `/setup/sessions` for trips at stage 8). It lists every round with its format, read through `roundFormatsOf`, and the same `RoundList` card.
- **Saving a change** runs the rule against the stored shape.
  - Same shape: saved as today (`withSessionFormat`, or the Primary's own format / `roundAllowances`).
  - **A crossing (League ↔ Overall):** a sheet asks first, showing the standings before and after side by side. Both come from `buildRows` over the stored boards and the proposed ones, on the `RowContext` the page already reads on the server, so no new route is needed. The sheet also says "Round 2 becomes Session 2". Saving goes through `withOverallOn` / `withOverallOff` + `withSessionFormat`. Nothing is deleted: a session board turned off stays and reads as that round's own board, as built.
  - Writes go through `changeBoards` (read fresh, then merge) rather than the page's current blind `update`.
- **Removed:** "Turn the Dynamic Overall Leaderboard on / off" and its confirm. The organiser row is called **Formats**, and its hint names the shape ("Leaderboard · 3 rounds" / "Overall · 4 sessions").
- "Formats by day" stays for adding secondaries per round. It is hidden on an Overall event as now.
- **Tests:** a crossing asks first; before → after → before gives back the same boards; no score or board is lost; an Overall never governs a round (existing test kept).

## Stage 7: stroke foursomes (new team format)

The biggest stage, and the one I'd plan again in detail before starting.
- `TeamFormat` gains `'foursomes'`: one ball a pair, alternate shot, off 50% of the combined handicaps.
  - The side's handicap is `foursomesStrokes`' sum: each player's unrounded course handicap, added, then the allowance once, through `allowedHandicap`. Reused, not restated.
  - The pair's ball is kept under its first player in `scores` / `live_scores` (the session card's convention).
  - The live card shows a partnership as one entry and locks both players.
- **Points are worked out from the gross with the pair's handicap**, when the board reads them (as Quota already does), never from the stored `scores.points`. Those are the lead player's own trigger figure, and nothing is stored reduced.
- An individual board over a foursomes round lists it as unread (stage 5's note), because the lead player's row is the pair's ball, not their own card.
- No migration as far as I can see. I'll check the trigger and `round_handicaps` before starting.

## Stage 8: trips

- Trip creation (`CreateTripForm`'s itinerary step, then Format and Settings) and Trip Setup's Formats door get the same model.
- Every existing trip renders byte for byte (D47): `test:golden`'s trip cases are unchanged, and the naming is switched on for trips only from this stage.
- Whether trips should see "Primary" at all is a question for you when we get there.

---

## Rules held by tests, throughout

- Old events and trips render and score byte for byte: `test:golden`, plus every existing suite, still green after each stage. Stage 2 is the only deliberate change, and only the tab word on multi-board events.
- Matches → Overall, never a Primary. The rule never reads player count. Allowance alone never changes the kind. A crossing asks first and deletes nothing. The Overall never governs a round.
- Every rule is in `lib/`, pure, with its own test. Client files export components only (`test:client-boundary`).

## Docs, per stage

CLAUDE.md, `docs/leaderboards.md` (the naming and the rule), `docs/sessions-plan.md` (D35 replaced), `docs/event-use-cases.md` (a club's one-round Stableford story), `docs/design-brief.md` (D77–D90), `docs/copy-review.md`. A new `docs/design-system.md` that points to `docs/style-guide.md`. This plan is committed here with stage 1.

---

## Ross's answers (13 Nov 2026)

1. **Any rounds that don't fit neatly on one leaderboard get an Overall, Stableford beside strokes included** (which in practice never happens). Built into the rule at stage 1.
2. One total scores Round 1's scoring, individual: **ok**.
3. A stroke secondary names every Matches session it can't read: **ok**.
4. The days question goes from creation: **ok**.

Also worth knowing: under D82, an Overall can no longer be *made* over identical stroke rounds ("points per round, every round Stableford"). Events already made that way stay Overall, by the principle above.

## Shipped

- **Stage 1** — `lib/eventShape.ts`, `scripts/test-event-shape.ts`, `scripts/fixtures/event-shapes.ts`. No screen changes.
- **Stage 2** — on an event, the leaderboard's tab and title card call the main board **Primary** beside a secondary (`boardName`); a round on an Overall event is its session (`roundLabelOf`) on the round summary (it said "Round n"), the Tee times tab and the organiser area's Starts card. Trips untouched, so `test:golden` did not move; one board on an event draws no tab or title, as before. The leaderboard's league round switch, the Scoring tab and the hub already said the right word.
