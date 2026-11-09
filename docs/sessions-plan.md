# Plan: sessions, Matches and the Dynamic Overall Leaderboard

Claude Code's plan for the 9 November 2026 brief ("sessions, matches and the Dynamic Overall Leaderboard (Ryder Cup capable)", version 2). This file covers the architecture that the brief left to Claude Code. The brief's own sections still hold the rules. **Stage 1 (the date freeze) shipped on 9 Nov, `8da50c7`.** Each stage below waits for Ross's yes and is checked on greendot.live before the next one starts.

---

## The three storage decisions

### 1. Session matches get their own table, not `matchplay_matches`

Migration 067 adds **`session_matches`**, **`session_match_scores`** and **`session_match_concessions`**. Each carries `trip_id`, has RLS on, and has grants per the 057 rule. They are browser-written like `match_scores`, so `anon` gets access with open policies, and `service_role` is granted access.

Why not a discriminator column on `matchplay_matches` (the brief's other option):
- **`writeDraw` deletes every match on the event by `trip_id`** (`lib/drawStore.ts:61`). One missed filter there erases a Ryder Cup.
- `UNIQUE (trip_id, round_number, slot)` was built for bracket positions, and `next_match_id` cascades.
- The winner check (`ck_matchplay_winner`) has no way to store a **half**, and a session match must be able to end halved.
- 13 files query the table by trip (`knockout.ts`, `matchplay/page.tsx`, the hub, `organiser/bracket`, `matchCards.ts`, `matchplayStore.ts`, `drawStore.ts`…). Every one would need the filter forever, and a new one would forget it.

With a separate table, **no bracket reader changes for storage**, and "a session match never appears in a bracket" holds by construction. A test also greps that nothing reading `matchplay_matches` mentions sessions, and the reverse.

A `session_matches` row is one match: `round_id`, the tee time (or order-of-play position) `slot`, side A and side B as player ids (two each for fourball), `result` (`a` | `b` | `halved` | null) and `margin`. **It is made when the card is first opened** on a full row (an upsert on `(round_id, slot)`). Until then, the match is simply the tee time's two sides. Its players are copied in at that moment and fixed once the card has a score (5.2's rule). The organiser's PIN reopens it.

### 2. The match card serves both, it is not copied

`lib/matchCard.ts` (the rules) and the card's components stay the one copy. The card page and `MatchCardClient` take a **match source**: `knockout` reads and writes today's tables, and `session` reads and writes the new ones. Only the table names and the finalise step differ. A session finalise writes `result` and never touches the bracket's `persistWinner`.

The differences are rules in `lib/matchCard.ts`, held by `test:match-card`:
- **No 19th hole**: a session card stops at 18.
- **Finalise at all square records a half.**

The session card lives at `/golf/event/[code]/session/[roundId]/match/[slot]/card`. It is its own address, so a session match id can never be handed to a bracket page.

### 3. Formats and the Overall ride in `trips.leaderboards` (no migration)

- **`Competition` gains `'matches'`.** `hasMatchplay()` and every `=== 'matchplay'` check stay `'matchplay'`-only, so no bracket reader ever sees a session board. `parseLeaderboards` learns the new value. A deploy rolled back past this would drop such boards on read, never misread them as a bracket.
- **A session is a round. Its format is a board scoped to that round alone** (`roundIds: [roundId]`, the existing mechanism the per-day formats use), marked `session: true`.
  - "Same as Session 1" copies Session 1's board onto the new round.
  - **Format TBC is the absence of a board** for that round.
  - Before a round has a venue (a TBC venue, so no `rounds` row), the session is keyed by its golf item's id (`leagueRoundKey`, as deadlines already are) and moved onto the round when the venue makes it.
- **The Overall is a board with `kind: 'overall'`**. It holds `audience` (tags, individuals or teams) and a feed per session:
  - `{ position: points table }` for stroke sessions, from the existing `customPoints`, ties through `placeRound`;
  - `{ match: win / half / loss }` for Matches sessions, defaulting to 1 / ½ / 0;
  - `{ none }` for a session that does not count.

  Results are worked out on every read. Only the rules are stored. The rules live in a new **`lib/overall.ts`**, pure.
- **Whether an event has an Overall** is whether a board with `kind: 'overall'` exists. There is no second flag that could disagree with it.

---

## Every bracket reader, and what it does with session matches

Session matches live in their own table and their boards are `'matches'`, never `'matchplay'`. So nearly every reader is unchanged **by construction**. The plan still checks each one.

| Reader | What it does today | With sessions |
|---|---|---|
| `lib/leaderboards.ts` `hasMatchplay`, label (437), facts (823/845/896), parser (1009, 1189) | finds the bracket board; words it | unchanged for `'matchplay'`; new branches for `'matches'` (label "Matches", facts "Fourball · Matches · 90% handicap") |
| `lib/boardRows.ts:523` | a bracket board has no rows | `'matches'` gets its own builder: the session's match list |
| `lib/partnerships.ts` 87/102/261 | a draw's pairs govern and are fixed | `'matches'` governs its round and is **not** fixed: a fourball session's partnerships are made on the tee sheet. `governingBoard` **skips the Overall** |
| `lib/hubStanding.ts` 100/232 | a bracket lead has no standing | an Overall takes the full `buildRows` path |
| `lib/bracketSetup.ts` `isKnockoutEvent`, `kind.ts` `fetchIsKnockout` | read `bracket_setup.format` | a Ryder Cup is a **league** setup, so it is never a knockout; test added |
| leaderboard page (88), `TripLeaderboardClient` (1679) | redirect to `/matchplay`, bracket tab | unchanged; an Overall's switch is new |
| hub page (420–577), `readKnockout`, `NextMatchCard` | knockout view, next match | unchanged; a session "your match" card is new, read from `session_matches` |
| scoring page (106), `KnockoutPortal` | your knockout match on top | unchanged; a Matches session lists its own matches (5.4) |
| match page, `MatchActions`, card, `matchCards.ts` | one bracket match | unchanged as the `knockout` source |
| `matchplay/page`, `organiser/bracket`, `MatchplayPanel`, `TripSetupClient`, `LeaderboardSetup` (777/902/1257) | the draw | unchanged; `'matches'` is offered only as a session format, never in the board grid's bracket toggle |
| `api/match/dueDraws`, `drawStore`, `matchplayStore` | draws and results | untouched: a different table |

---

## Stages

**All eight shipped on 9 November 2026** — 1 `8da50c7`, 2 `879132a`, 3 `2664413`, 4 `355d04b`, 5 `5eb19ea`, 6 `41ca5fa`, 7 `644cac2`, 8 this commit. Two departures from the plan as written: **no migration 068** — a Matches session's tee sheet reads its matches from `session_matches` and mirrors each player's tee time into `tee_assignments`, so `tee_assignments` needed no `side` column; and stages 5 and 6 share one sheet (`session/MatchesSheet.tsx`), the order of play from the start.

Each stage ships alone. Every stage keeps the brief's section 8 tests green, including "No answers today's flow byte for byte" (golden tests on an event made without an Overall).

1. ~~**The date freeze.**~~ Shipped.
2. **Words and cards.** These on-screen strings change and nothing else:
   - the chooser's cards become League and Knockout, with the lines in 6.1, on Standalone and Ongoing;
   - the organiser area's Bracket row and help text;
   - "Knockout" wherever "match play" means the bracket.

   `createChoice` keeps `format=match_play` and adds `knockout` as an alias. `docs/copy-review.md` gets the entries.
3. **The question and sessions.**
   - The league wizard gains "Enable Dynamic Overall Leaderboard?" (No by default).
   - Yes leads to the running order worded as sessions: Session 1's format, then "Same as Session 1", Change format and TBC. **Matches and Foursomes appear but are disabled** ("Coming soon" until stage 5; Foursomes until stage 7).
   - Then back to the step that finalises the Overall, which at this stage has only the stroke feed.
   - Going from Yes back to No with sessions set asks first.
   - `lib/sessions.ts` holds the rules, pure.
4. **The Overall for stroke sessions.**
   - Points by position, the Overall · session switch (`withOnlyRounds`), and session boards ranked in their own format.
   - The organiser area's **Session formats** page, and turning the Overall on or off after creation (asks first, deletes nothing).
   - Remove the 8 Nov entry from `docs/pending-concepts.md`.
5. **Matches.**
   - Migration 067 (Ross applies it by hand).
   - The card's `session` source, halves, points per match, the session's match list on Scoring and the leaderboard, and the hub's "your match".
   - The new `score_session_matches` permission. It goes in the registry and the collaboration question: Strict means the match's players and the organiser, Relaxed means anyone.
   - **Until stage 6 a match is set by the organiser on a plain list**, so stage 5 can be tested on its own.
6. **Tee times as matches and the Order of play.**
   - The sheet's "vs" layout for a Matches session: fixed tag header, sides stacked upright, the per-side tag gate.
   - Order of play (numbered slots on the same `tee_assignments`, no clock).
   - The creation note (4.4).
   - The stroke sheet is pinned unchanged by a test.
   - **`tee_assignments` needs a `side` column**, so migration 068.
7. **Foursomes.** One ball a side off 50% of the combined handicap, and a per-side score on the card.
8. **Trips.** The same model in Trip Setup; every existing trip byte-identical.

## After the stages: two tags facing off (9 Nov 2026)

An Overall that ranks exactly two tags is drawn as a ticker instead of a table (D50): every point up for grabs a mark, each tag filling in from its own edge, a match in play softened in the colour of whoever is ahead; a Session dropdown under it; the session's matches one tappable row each. The points up for grabs come from **a match count per Matches session**, asked at creation and changed on the Session formats page — `OverallRules.slots`, in `trips.leaderboards`, so no migration. `lib/faceOff.ts` holds the sums; `test:sessions` the rules and the wiring. The order of play then gained − and + for each session's count (a vacant match still counts on the ticker) and became one session open at a time.

## For Ross

**Nothing above needs a decision before stage 2.** These are the points worth a look:
- **Two migrations** (067 at stage 5, 068 at stage 6) for you to apply by hand, as usual.
- The freeze fix reads any year **outside 2000–2099** as "no date yet", and lays out at most **three years** of days. Say if a longer event is ever wanted.
- **Matches can't be picked until stage 5.** At stages 3–4 it shows in the session format list as "Coming soon", so a Ryder Cup can be laid out but not played before then.
