# Leaderboards — what a trip plays for

**`lib/leaderboards.ts` is the current model.** A trip carries an ordered **list** of complete competitions in `trips.leaderboards` (migration 022). The first is the primary.

This replaced a model where every choice was a flag on one object, so any combination was expressible — including meaningless ones like a team format on an individual board. **A leaderboard is either fully answered or it is not in the list.** That is what lets the scoring module trust what it is handed.

## Three independent questions

A league board is three answers, and they do not constrain one another:

| Question | Answers |
|---|---|
| Who is ranked | individuals · teams |
| How a round is scored | Stableford · Strokes · Quota *(individuals only)* |
| *(teams only)* how the players combine | better ball · hero · cut the dead weight |
| How the rounds add up | total them · pay by finishing position |

Discard (0–2 worst rounds) and **how ties are broken** are asked of **every** league board; a Quota board is asked one more, **which scale** its points are earned on.  A draw asks nothing — it is generated at random.

**Every combination is a board that exists and is implemented.** `everyBoard()` is that grid, and the form offers cells from it and nothing else, so settings can never ask for maths that has not been written. This is the whole design: the renderer's capability is the fixed thing and the form is a selector over it, rather than each new option needing new scoring code.

**"Custom points" used to sit beside Stableford and Strokes as a third way of scoring a round.** It never was one — it is Stableford, paid out by position — and having it in the wrong slot is what forced discard to be switched off for it, made the prize table hang off two unrelated fields, and made teams ask the same question again under the name `aggregation`. Splitting scoring from combining is what opened up nett-strokes team formats and strokes paid by position, neither of which was expressible before.

**Quota** (`lib/quota.ts`, the only copy of its rules): every player chases their own number — 36 minus course handicap — with points earned off the **gross** against par. **Which points is the trip's own choice**, made on the board when it is created (`quotaScale`) and offered as two scales — see *Which quota* below. The round's result is points minus quota, **signed** — positive beat it, negative fell short, higher is better. The handicap enters exactly once, in the target: a board allowance reduces the course handicap before the subtraction (`allowedHandicap`, same as everywhere), never the per-hole points. A plus handicap is negative and pushes the target above 36. **Individual-only** — the quota is personal, and no team format says whose number a composite card would chase; `scoringsFor`, `everyBoard` and `parseLeaderboards` all enforce it, so a team quota board cannot be made, offered or read back. The stored `scores.points` are Stableford's, so `scoresForBoard` restates a quota board's per-hole points even at the full allowance — that is why the early-return there checks the scoring too. The live panel in scoring offers a Quota tab only when a trip board actually plays it, and it is handed **the scale rather than a yes/no** (`quotaScale`, threaded from the trip route): whether the tab appears and what it counts are the same answer, and two props could disagree — the card in your hand counting Chicago while the board counted Liverpool is exactly the class of bug this app keeps closing. A pts/quota sub-toggle sits in the same pill nett/gross uses: pts is the points accumulated, quota the signed distance to breaking even, and a finalised card always reads as its distance — higher is better — because "38 points" says nothing without knowing the quota.

**Team formats** (`lib/teamScoring.ts`): `better_ball` (best score on each hole), `hero` (best single card carries it), `cut_dead_weight` (everyone counts except the worst card of the day — that player is back in next round; ties broken by id so the same total is produced every time). Each works on either scoring: `teamRoundPoints` takes a `basis`, and `beats()` is the one place the direction lives — lowest wins on strokes, highest on Stableford.

**Uniqueness.** `slotKey` is every answer that changes the maths — including which teams play it — so two boards are the same only when they would produce the same table. **Stableford totalled and Stableford paid by position are two boards** — an order of merit and a daily prize are a normal pair to run together, and the old model could only hold one of them. The tab names them apart (`Stableford` / `Stableford prizes`). **Matchplay is capped at one per trip**, whoever it is between — a second draw is a different tournament, not a second view of this one. `parseLeaderboards` enforces all of this on read too, not only in the form.

`formatKey`/`isFormatFree` are the same question with the teams left out, and are what **the form** asks. It has to: which teams a board is played by is settled afterwards, on the team screen, so while a board is being made there is nothing to tell two same-format boards apart — and their tabs would read identically. Trips set up under the older form can still hold two, so the reader keeps using `slotKey`; the team screen refuses to merge them onto one sheet, which is the only way they could collapse into each other.

**The form** (`LeaderboardSetup.tsx`) asks the same questions in the same order every time, each opening the next; nothing is hidden by an earlier answer. Question numbers are counted rather than written down, since teams ask one more. "Add another leaderboard" sits underneath from the start so it is clear more is possible, but is disabled until the primary is complete. Adding a second offers the same cascade with whatever is running shown as **In use**.

**A board can be changed after it is made**, on the same cascade, from the gear on its card. That is safe because a board owns no data: scores are the player's, keyed by player id, and a board is only a way of reading them. Editing re-reads the cards already entered — nobody re-enters a score — so the section is **not** gated on the trip being in draft. The board being edited is left out of the "in use" checks, or it reports itself as a clash with itself. Changing *who is ranked* restarts the cascade; a board that stops ranking teams gives up its sheet, and one that starts ranking them takes a fresh one rather than inheriting somebody else's teams.

Anything stored that cannot be understood is **dropped, not repaired** — a half-understood board would quietly score a trip wrongly, while no board sends the organiser back to a form that says so.

## Handicap allowance

**A board can be played off a percentage of the course handicap** (`lib/handicapAllowance.ts`). It is the last question of the cascade, asked of league boards only, and stored as `handicapAllowance` on the board.

| Competition | Standard allowance |
|---|---|
| Four-ball stroke play / Stableford — i.e. any team board here | 85% |
| Individual (singles) | 95%, and clubs may scale 85–100% locally |
| Foursomes (alternate shot) | 50% of the partners' **combined** handicaps — no format on this platform to attach it to yet |
| Four-ball match play | 90% of the difference from the lowest player — a different shape of calculation; the draw is left at full |

`suggestedAllowance` names the recommended figure; it is **not** pre-selected. A reduction changes what every card on the trip is worth, and one applied because nobody scrolled far enough is noticed at the prize-giving. The organiser can pick any whole percentage from 10 to 100, or leave it off.

**Nothing is ever stored at a reduced handicap.** `round_handicaps.playing_handicap` is the full WHS figure, `scores.stableford_points` is what the trigger computed from it, and gross is gross. `buildRows` applies the board's own percentage when it reads the cards — Stableford points recomputed from the gross, strokes nett off the reduced figure. At 100% the stored points are returned untouched, so a board that never asked scores exactly as it always did.

That is the whole reason it is applied on read. Store the reduction and a second board on a different allowance becomes unscoreable: the number it needs was rounded away when the first one was written. It is also what makes `scoresForBoard` and `boardHandicapFor` necessary — the scorecard sheet that opens off a board row has to restate both the points and the printed handicap at that board's allowance, or a board totalling 33 opens a card adding to 36.

**The percentage comes off the unrounded course handicap** (`exactCourseHandicap`, `lib/courseHandicap.ts`), never off the whole number a card shows. 11.63 displays as 12, but 90% of those two are 10 and 11 — rounding twice loses a shot. `allowedHandicap` rounds once, at the end, to the nearest shot and **not** truncated: 16 off 85% is 14, not 13.

`round_handicaps` cannot hold the unrounded figure, because the Postgres stableford trigger reads that column and disagrees with itself about fractions — `FLOOR(h/18)` and `MOD(h::INT,18)` split 17.5 into no shot on any hole where 18 gives one on every hole. So the exact value is rebuilt from the tee instead, via `round_handicaps.tee_id`: `RowContext.exactHcpFor` on the leaderboard, `PlayerSetup.exactHcp` while scoring. Where no tee was recorded the stored whole number stands.

**Every board takes that same handicap, whatever its allowance** — including at 100%. The snapshot is a fallback, never a preference: it is seeded with the player's index (below), so preferring it on unreduced boards and the real figure on reduced ones would put one round in two places on two tabs of the same page.

**Stableford points at 100% still come from the trigger, which stays canonical.** That is not an exception to the above. The card writes the handicap the trigger reads, so once both work off the tee they agree by construction. A reduced board has no stored answer to agree with and works its points out from the gross — that split is `boardPoints`, and the same split is in `LiveLeaderboardPanel`. The one thing that *never* comes from storage is the handicap.

**`round_handicaps` is seeded with the player's handicap *index*, not their course handicap.** Trip creation, finalise, adding a round and every handicap edit all write `Math.round(players.handicap)`, because no tee has been chosen yet and a course handicap needs a slope and a rating. Scoring must therefore prefer the tee whenever it has one — `resolveCourseHandicap` in `LiveScoringFlow.tsx`. It did not, which is how the player picker (computing from the chosen tee) and the score card (reading the placeholder) came to show handicaps several shots apart, with `lockPlayers` writing the placeholder back over the real answer.

**On the scoring card**, the allowance is display only. `allowanceCycle` collects every percentage the trip's boards play off (always including 100), highest first, opening on the primary board's. A control in the top-right of the scoring header — the same box as the back button opposite it — walks that list, and the playing handicap, the points badges, the running totals, the confirmation scorecard **and the live leaderboard beside it** all follow it. It only exists when something is actually reduced. What gets written does not move when it is tapped: `PlayerSetup` carries `exactHcp` (unrounded, the figure everything derives from), `playingHcp` (whole, written) and `displayHcp` (reduced, shown) as three separate fields for exactly that reason. The player picker lists every allowance beside the playing handicap before the round starts.

The live board is swiped to from inside the card, so it has to answer the same question the card does — `LiveLeaderboardPanel` takes the same `allowance` and recomputes points from the gross under a reduction, since the points stored beside a live score were worked out at the full handicap.

## From settings to the board

`lib/boardRows.ts` is the join. `buildRows(board, context)` takes **one** leaderboard and the trip's scores and returns that board's rows; everything it needs comes off the board itself. Two boards on one trip can therefore be scored genuinely differently — Stableford keeping every card beside Strokes dropping the worst. Under the old model discard was one number on the trip and the team format one setting on the trip, so that was not expressible: it was one answer applied twice.

**A casual round never reaches a board.** `rounds.casual` (migration 031) marks a round scored as usual but kept off every leaderboard — a subgroup's extra game. `buildRows` drops those rounds and their scores before any board reads them, which is the only place the rule lives; the leaderboard page also leaves them out of the round columns, and the cheap standing path (`simplePlacing` in `lib/hubStanding.ts`) filters at its query — `test:hub` holds the two paths together on it. A round summary still shows its own result: `fetchRoundRows` clears the flag for its single round, the same way it drops the discard rule, because a round's result is that round's result whether or not the trip counts it.

The leaderboard page renders `Leaderboard[]` and nothing else. Tabs are the league boards in list order; matchplay is a button, never a tab, because a draw is not a table.

**Two shells, not one builder per format.** `individualRows` and `teamRows`, each taking how a round is scored and how the rounds add up; `combineRounds` is the second axis and is shared by both, because totalling rounds or paying positions means the same thing whoever is being ranked.

`combine: 'position'` places each round on its own result and pays the table. **The round column then shows what the position was worth, not the score that earned it** — otherwise the total would not add up beside its own columns. Prize points are always higher-is-better, whatever earned them, so a nett-strokes prize board is placed lowest-first and then totalled highest-first.

**Old trips are read, not migrated.** `lib/leaderboardsCompat.ts` turns `trips.formats` into the boards those flags always described: teams first, then each individual board ticked (all inheriting the single trip-wide discard, exactly as they always did), then the draw. `parseLeaderboards` also reads the first shape of the current model — `scoring: 'custom'` and `aggregation: 'custom_points'` both come back as Stableford paid by position, and a team board with no scoring at all reads as Stableford, which is the only thing that model could mean. A stored list always wins; an empty one means a trip from before the column existed, not a trip playing for nothing. Delete the file whole once no trip has an empty `leaderboards`.

**A better-ball board names its own count.** `countingScores` on the board — how many of the team's scores make the composite card on each hole, asked in settings directly under the format (chips for 1 and 2, a keypad behind "Something else" up to `MAX_COUNTING_SCORES`). **Absent reads as 2**, which is what the maths always counted for a board that was never asked, so every stored trip scores exactly as it did; the explicit default is likewise kept off the object. `countingScoresOf` resolves it, `describeBetterBall` is the one copy of the wording, and a count above a team's size simply caps out at everyone. The question belongs to `better_ball` alone — hero and cut-the-dead-weight judge whole cards.

**Team format options survive the switch.** `better_ball` with a grandstand finish is not expressible as a leaderboard — the form asks for the format and its counting scores, never the finish. `teamScoringFor(board, legacy)` hands back the trip's old `team_scoring` verbatim when the format matches (a per-board `countingScores` still wins, since only a board that was asked carries one), so a trip mid-way through is never silently re-scored. Options from a *different* format are not carried across. `aggregate` was retired from the form but stays in `ALL_TEAM_FORMATS` so trips running it still read and score as themselves.

## Pairing names

A pairing is written as its players' names with `&`. Duplicate first names take as much surname as they need and no more, and everyone in a clash grows together so the names stay the same length: `Ross Gr & Ross Ga`, or `Ross Grad / Ross Gran / Ross Gree` with three. `shortNames` in `lib/matchplayEntrants.ts`.

## Competition formats (superseded)

> The model below is the **previous** one. `parseFormats` still reads it so existing trips keep working, and the leaderboard page still uses it where it has not been migrated. New work should use `lib/leaderboards.ts`.

Trip settings are a **decision tree** — questions asked in order as the organiser scrolls, each answer opening what it opens. The tree is `lib/tripSetupFlow.ts` (pure); `TripSetupClient.tsx` renders it rather than deciding it, so the order has one source of truth. Stored in the `formats` JSONB column on `trips`; the model is `lib/formats.ts`.

| # | Question | Opens |
|---|---|---|
| 1 | **Who competes** — teams, individuals, or both | Everything below |
| 2 | **League, matchplay, or both** | The branches for whichever is on |
| 3 | **League scoring** — Stableford / Strokes / Custom points | Discard (the two stroke-based boards) and the prize table (Custom) |
| 4 | **Matchplay format** — singles or pairs | Only a real choice with teams on |
| 5 | **Team scoring** — how team points are worked out | Teams + league only |
| 6 | **Pick the teams** | Teams only |

Both axes allow more than one answer. A trip can rank individuals and teams off the same cards, and can run a league and a knockout side by side.

**Teams lead when both are on.** Teams is the main competition: the team tab is first and opens by default, with the individual boards behind it. `mainCompetition(f)` and the tab order in `leaderboardTabs(f)` both encode this.

`discardWorst` (0–2) drops a player's weakest rounds. It applies to Stableford and Strokes; Custom is a prize table by position, so dropping a round there is a separate idea and the question is not asked for it alone.

#### The Discard switch, and why the board opens with it off

A board that drops a round is showing a total with a card missing from it, and the missing card is the first thing anybody asks about. So the leaderboard **opens on the plain arithmetic** — every round counting, the columns adding to the total beside them, nothing struck through — and offers the rule as a switch in the head of the table. Off by default, and only present at all when the rule actually took a round away from somebody.

Three things move together when it is tapped, and they have to:

- **The round cells.** A dropped round strikes through only while the switch is on.
- **The total.** `BoardRow.total` is always the competition's figure, after the discard, because that is what decides the trip and what the hub's standing line and a round podium are asking for. `BoardRow.totalAll` is the second figure, present *only* where something was dropped — so its absence is the reliable "nothing was discarded" answer, and `totalAll ?? total` is exact rather than a guess.
- **The order.** A board sorted by a total it is not showing reads as broken. `orderRowsUndiscarded` is the board's *own* comparator asking a different column — not a third ordering. See the note on the two orderings in `CLAUDE.md` before adding a fourth.

The switch's caption says what is on screen ("Showing every round" / "Worst round set aside"), never what the rule is: the rules line above the table already states the rule, and "Worst round dropped" sitting directly above "Every round counting" reads as a contradiction rather than as a rule and a view of it.

**The board's default order is therefore not the competition's order** while the switch is off. That was chosen deliberately over the alternative — always showing the after-discard result and using the switch only to reveal the working. It is worth re-examining once a trip is actually being decided by a discard rule.

A static render cannot tap the switch, so `test:leaderboard` holds the off state and the switch itself in the markup, and holds the on state at the row level through `buildRows` / `orderRowsUndiscarded`. The two discard cases in the golden master were re-recorded for this change; their diff is the whole behaviour change in one place.

### Reading stored settings — three generations, no migrations

`parseFormats` reads every shape this app has written, so nothing was ever migrated:

| Generation | Shape | Reads back as |
|---|---|---|
| 1 (flat) | `{individual_stableford: true, teams: true}` | Individual league, singles draw |
| 2 (nested) | `{individual: {stableford: true}, matchplay: true}` | Same |
| 3 (current) | `{individual: true, teams: false, league: {…}, matchplay: {on, format}}` | Itself |

The current shape is detected **positively** — by a `league` key, or a `matchplay` that is an object. Detecting the old shapes instead missed a row that only said `{teams: true, matchplay: true}`: no `individual` key to spot it by, and the draw was silently dropped on read.

Neither older shape could express a pairs draw, so both always read back as singles. A teams-only generation-2 trip gets `league.stableford = true`, since teams were always scored as a league and it would otherwise return with nothing to play for.

A trip with nothing switched on has no storable form — `parseFormats` returns the default instead — so settings **refuse** such an answer rather than saving it. `emptyFormatsReason` names the switch that does what the organiser meant: unticking the last board is not how you turn the league off.

### Custom points

A prize table paid by finishing position each round — 10 for the winner, 5 for second, and so on. Logic in `lib/customPoints.ts`, all pure.

- Default table is the inverse of the field: eight players gives 8, 7, 6 … 1
- Any position may be edited, 0 to 100. Zero is allowed
- **An untouched default follows the field; an edited table is padded with zeroes.** `resolveCustomPoints` tells them apart with `isDefaultCustomPoints`, and both the form and `boardRows` go through it. A default is a *shape* — a point per player, dropping one — not a set of numbers, so it has to keep up; a decision is a decision and must survive somebody signing up. Padding everything is what left a trip of six paying first and second only: the board was made while the field was two, `[2, 1]` went into storage, and every later arrival was padded in on nought. **A team prize board makes this certain rather than merely likely** — teams are picked after the board exists, so the field is always empty at the moment the table is generated
- The field is the players, or on a team board the **teams**. Two is the floor in the form, because a table with no rows cannot be answered — but that floor is a guess, and the note under the table says so when nobody has joined yet
- Positions are decided on that round's Stableford result
- **What happens to players level on the day is the board's tie rule, below.** Reading the table against a round's finishers is `placeRound` in `lib/tiebreak.ts`, not a second function here — because what two level players are *worth* is exactly the thing the tie rule decides

## Breaking ties

`lib/tiebreak.ts` is the only copy. Three answers, asked of every league board and stored as `tieBreak`:

| Setting | On the board | What it pays two level players |
|---|---|---|
| **Tiebreak** | the cards split them | different prizes — the better back 9 takes the better place |
| **Everybody Wins** | they share the place | each takes the **best** of the prizes their places cover |
| **Even Split** | they share the place | those prizes pooled and shared |

**Countback is back 9, then back 6, then back 3, then back 2** — holes 10, 13, 16 and 17 up. `SEGMENTS`/`segmentFrom` are that list, once. Beyond the back 2 the card has nothing left to say and the tie stands, and a tie that stands is *shared*, exactly as Even Split shares it. On strokes the better back nine is the **lower** one; the direction comes from the scoring, never from the total, so a strokes board paid in prize points still reads its cards the right way round.

**Absent means Even Split**, which is what every board did before the question existed — so no trip already on the platform is re-scored. A board being *made* defaults to **Tiebreak** (`DEFAULT_TIE_BREAK`, seeded by the form). Two different defaults for two different questions, deliberately. An Even Split is never stored, the same way an allowance of 100 is not.

### Rounds added up have no back nine

A trip total is several cards; there is no ninth hole of it. So `overallTie` is a second answer, asked only under Tiebreak:

- **`level`** (default) — each round is still split on its own back 9, and the trip total is left level.
- **`last_round`** — the total is broken on **the last round both entrants played and neither dropped**. A discarded round is not part of the total, so it cannot decide it.

**A board counting a single round is the exception and is always broken**, because there the total *is* that card. A round summary is exactly that board, which is how a round's own result gets the tie rule the trip asked for.

`countbackByRound` rides on a `BoardRow` **only** when the board breaks its overall tie that way. That is what lets `orderRowsUndiscarded` — handed rows and no context — reorder for the Discard switch without silently breaking a tie the board was told to leave alone.

### Saying a countback decided it

**Not on the board.** It was, briefly: a superscript 9/6/3/2 in a green dot hanging off the figure. It read well on its own and badly in place — the totals column is `w-14` and pinned, so a mark on it pushed the one column on the board that must not move, and the round columns were no better. It also needed an 11px exception to the type floor, which is a sign on its own.

So the fact lives on the **round tiles that drop out when a row is tapped**, which is where the card it describes already is. In words — "Back 9" — set directly above **View**, the only part of that tile always free: the note beside the course name may already be carrying a hero, and the score is a number that must not be crowded.

It appears only where a card actually decided something, on the round it was read off:

- `tieBadgeByRound[round]` — that round's own prize, on a board paying by position
- `tieBadge` + **`tieBadgeRoundId`** — the whole board's order, on the round the countback ran over. That second field exists for exactly this: the overall tie is broken on one round (the last both played and neither dropped) and, once the badge came off the total, saying *which* is what gives the fact a tile to land on.

Two other things changed on that tile at the same time, both for the same reason — it is a small card and most of what it said was being cut off:

- **It no longer says "Scores in".** The round picker in scoring still does, and should: there the tile is all there is. Here the score sits on the same line two inches to the right, so the words were telling you what the number already had. `ROUND_NOTE` is untouched — the leaderboard's tile just declines to use that one.
- **The note runs to two lines before the ellipsis** (`line-clamp-2`, not `truncate`). "In play — carried by Rosaleen" is an ordinary note and it was losing the half that named the player, so the one thing on the tile with something to say was the one thing being clipped.

### Places

`BoardRow.place` is golf's, not the array index: two level are both 1st and the next row is 3rd. It is stamped by `placed()` after sorting, so it always matches the ordering on screen — the Discard switch reorders and re-places together.

### One countback

`compareRows` in `app/scoring/LiveLeaderboardPanel.tsx` used to carry its own, and the trip leaderboard broke the same tie alphabetically — so two players level could be ordered one way inside the scoring card and the other way on the board. Both now read `lib/tiebreak.ts`. The in-play panel is still **not** asked which setting the trip runs: it is the card in your hand mid-round, and countback is what a group on the eighteenth green means by who won.

### Matchplay: singles and pairs

A draw is between **players** (singles) or **pairings** (pairs). A pairing IS a team of two, so pairs requires teams — `isPairsMatchplay(f)` returns false without them however the stored value reads.

- **Teams are locked at two** under a pairs draw: banner above team selection, `n/2` on each column, refused drags, disabled dropdown options, and a finalise block if the sheet is broken. `lib/teamLimits.ts` is the single rule (`PAIR_SIZE`, `teamSizeLimit`, `canJoinTeam`, `pairsBlockedReason`).
- **Teams are called pairings** throughout the pairs UI — `teamNoun(f)` gives the words.
- **A pairing is never named on the draw.** A tile carries its two players' first names side by side ("Ross & Dave"); "Team B" tells nobody who is playing. Elsewhere — team lists, the team leaderboard — a team keeps its name. `lib/matchplayEntrants.ts` does the naming; members are ordered by handicap so a pairing reads the same every time.
- Auto-balance already paired high with low at two per team (snake draft, second lap reversed), so it was unchanged.

**Storage.** `matchplay_matches` has a team column beside each player column, with `entrant_type` (`player`/`pair`) saying which set a row uses (migration 019). Every constraint guarding the player columns is mirrored for the team ones. `lib/matchplay.ts` and `lib/matchplayProgress.ts` are untouched — they care only that a side has an id — and the mapping lives in `toStored`/`toRow` in `lib/matchplayStore.ts` and nowhere else. A row with no `entrant_type` is a pre-pairs row and reads as singles.

The bracket page reads `entrant_type` from the **rows**, not from current settings: a draw made before the format was switched is still a real draw, and reading it against the wrong entrant kind renders a column of blanks.

### Deciding a knockout from the cards

A bracket round can be **linked to a round of golf** and told how a match on it is settled. Once the cards are in, the winners follow from them and nobody taps a name. `lib/matchDecision.ts` is the arithmetic (pure, no app types); `lib/matchResults.ts` is the half that turns a `RowContext` into what it asks for. Stored as `roundLinks` on the matchplay board in `trips.leaderboards` — **no migration**, and a draw with no links is exactly the draw it always was.

**A link is stored against the bracket round's *number*, not its name.** A field growing from seven to nine turns a Quarter-Final into a Round of 16 and adds a round below it — every name shifts, the numbers do not.

Seven methods, in two shapes that behave differently:

| | Method | Settled |
|---|---|---|
| **hole by hole** | Stableford matchplay · Strokes matchplay gross · Strokes matchplay nett | when somebody is more holes up than there are holes left — or the holes run out |
| **the whole card** | Total Stableford · Total strokes gross · Total strokes nett · Total quota | only when both cards are complete: the eighteenth can turn over any lead |

That difference is why **"3&2" is a real result** and a total has none like it — the last two holes were never played. `marginLabel` only uses the ampersand form when the match ended early; one that went the distance is simply "2 up".

**Handicaps follow each method's own convention.** A *matchplay* nett is a **difference**: the lowest course handicap in the match plays off scratch and everyone else receives the difference on the stroke index — worked out across all four players in a four-ball, not per side. A *total* nett is each player off their own full course handicap, exactly as a strokeplay board reads them. No allowance is applied anywhere: a knockout has none, and `lib/handicapAllowance.ts` says why.

**A pairing reads as one card.** Every method builds a per-hole card per side first — for singles that is simply the player's own — so nothing downstream asks how many people are on a side. Better ball is the rule, and `bestOnHole` comes from `lib/teamScoring.ts` so a four-ball and a team board cannot disagree about which way strokes sort.

**Quota is the one exception**, and deliberately: a quota is a target for a whole round (36 − course handicap), so no share of it belongs to the ninth hole and there is nothing to take the better of there. A pairing's quota is the **better of its two members' own cards**.

## Which quota

`lib/quota.ts` owns the table and the target. **Two scales**, differing only in what going under par is worth:

| Scale | Bogey | Par | Birdie | Eagle |
|---|---|---|---|---|
| `liverpool` | 1 | 2 | 3 | 4 |
| `chicago` | 1 | 2 | 4 | 8 |

Above par they agree — a bogey is one point and a double bogey nothing wherever you play — so that half is written once and the scales only answer for the holes they actually disagree about. Going further under par continues whatever step the scale is on: an albatross is 5 on Liverpool, 16 on Chicago.

**There was a third**, an in-between 1/2/4/6, and it was the default for exactly as long as it took somebody to notice it differed from Chicago at eagle alone. Two names for nearly the same thing is worse than one name, so it was retired and the boards playing it moved onto Chicago — which is why `DEFAULT_QUOTA_SCALE` is Chicago rather than the first row of the table. That re-scores any Quota board set up before the merge: eagles are worth 8 where they were worth 6.

**The scale is the trip's, chosen once.** A Quota leaderboard is asked when it is created (`quotaScale` on the board) and every reader takes it from there — the board itself, and the live panel's Quota tab, which receives the scale rather than a yes/no so the card in your hand cannot count Chicago while the board counts Liverpool. `tripQuotaScale(boards)` is that answer.

**A matchplay link may override it, for the knockout alone.** `RoundLink.quotaScale` is absent by default and the picker opens on "Same as the trip — Chicago style", so a trip playing Liverpool all week says so once. The resolution order is the link, then the trip, then the default, and it is written out in one place: `readBracket` in `lib/matchResults.ts`.

The method list carries **one** quota entry, `quota_total`. It used to carry two — `quota_liverpool` beside `quota_chicago` — which put the choice of scale in two places with nothing keeping them in step. Links stored under either old name read back as the one method carrying the scale they named.

**A halved match is left halved.** A knockout needs somebody to go through and the cards did not say who, so the tile reads All Square and whoever was there records it. Inventing a winner from a seeding would be putting a name on a result nobody played.

**When the writing happens.** The auto-apply pass runs **in the browser, once, when the bracket is opened** — not during the page's render. Looking at a draw must not change it. And it **only ever fills an empty match**: `pendingResults` drops anything already carrying a winner, so a correction typed in by hand sticks, and reopening the page is a no-op rather than a second write. A card edited after a match was recorded shows as **Cards disagree** on the tile and is never silently resolved.

The line under a tile lives in the 22px between it and the tile below (PITCH 98 less TILE_H 76) — which is why it is a caption rather than a third row: a tile is two 37px rows because two names and two figures is what fits on a phone.

#### The last round is centred

Every position of the bracket shows two columns pinned to the two edges of the screen, which is what makes the pair read as one draw. The last position has nothing on its right, so the same rule left the Final alone against the left edge with half a screen of nothing beside it — reading as a column that had failed to load rather than the end of the draw.

`centringShift` slides the whole view right as the last round arrives, until the final tile is centred. It is a **continuous function of `position`**, like every other coordinate in `lib/bracketLayout.ts`: the slide happens over the same swipe that brings the Final in, so there is no second animation to keep in step and the connectors stay welded to the tiles because they are offset by the identical number. A two-player bracket — a Final and nothing else — is centred outright, since there was never a pair to pin.

### Leaderboard

Each active board is a tab, teams first when teams are on. With more than one running, a title card above the board names it and states how it is being scored.

**The two boards are two jobs.** The **live** board is what the course is playing right now, and stays afterwards as that day's record — over and under par are coloured, because it is the vibe of a round. The **trip** board is the standing, and is more impartial: emerald on it means one thing only, still being played.

A round is **In play** — a glowing green badge — when a `live_rounds` row for it has status `active`. Recorded scores alone do not count; the scorecard has to be open.

**Green while the card is open, plain ink once it is in.** A round with uncommitted `live_scores` shows green and reads as *how far ahead of level it stands*. Once finalised it reverts to the total in ink. The legend's two swatches must not both be emerald — after the gold was swept out they were, so it drew two identical dots and claimed they told two states apart.

| Board | While in play | Once finalised |
|---|---|---|
| Stableford | against two points a hole — 27 off nine holes reads `+9` | the total |
| Strokes | nett against the par of the **holes played**, not of eighteen | the nett total |
| Custom | colour only — a prize table pays position, there is no level | the points awarded |
| Teams | colour only — level depends on the mode and team size | the total |

Level prints as `E`.

**A row's live dot is that player's, not the trip's.** It is on when a `live_player_locks` row puts them on a session still `active` — read off the open cards themselves, per player. It used to be inferred from "this player has a score in a round that is in play", so everyone who had teed off wore one the moment anybody opened a card, and kept it after signing their own. Not everybody plays every round, and a signed card is not live.

**An individual row carries no second line.** It used to count holes and rounds under every name — "42 holes · 3 rounds" — which is a lot of type saying what the round columns already show.

Committed scores always win over in-progress ones for the same hole.

**During live scoring, the leaderboard must fetch `live_scores` (uncommitted) alongside `scores` (finalised) and merge in real time.** Do not gate updates on "session finalised" — users want to see leaderboard movement while rounds are still in progress. Leaderboard pages must be `export const dynamic = 'force-dynamic'`, never ISR — a 30-second cache is enough lag to make team changes look stuck.

**Team scoring is best-2-of-3 per hole**, on both the page leaderboard and the live panel. Not best-1. Apply consistently.

#### Over par is weight, not colour

`lib/leaderboardStyle.ts` is the one place that decides, and both boards read it. Better than level is emerald; level is a quiet bark wash; **worse than level is *more* bark, never emerald.** The live board used to paint both sides of level emerald, so a round four over looked exactly as good as one four under. Which direction is better is passed in rather than guessed — Stableford counts up, strokes count down.

#### The board closes on a plinth

The card carries `rounded-2xl` and **deliberately no `overflow-hidden`** — that would make it its own scrollport and the sticky headings would then measure `top: HEADER_H` from the card's edge rather than the viewport's, dropping them a header's height down the table onto whoever is leading. The cost was that the last row's square white fill sat over the rounded corners, taking the card's own bottom border with it: the board ended on a hard white edge against cream with no line at all.

The flat edge is right — a table of figures should close flat, the way the headings open flat. What was missing was the line. So under the rows sits a 12px band with a `border-bark/25` top rule (a touch stronger than the `bark/12` between rows, because it closes the table rather than dividing it) and `rounded-b-2xl` beneath it, carrying the corners the card was always meant to have. It is tinted and `aria-hidden`, and it is 12px against a row's 44 — a base, not another player.

#### "In play" means somebody is holding a card

The badge reads `livePlayerIds`, not `activeRoundIds`. Tapping Start opens a `live_rounds` row **before anybody has been picked for it** — `startNewScorecard` even reuses a playerless one rather than making a second — so anyone who opened the scoring screen to look at it and backed out left a session active with nobody on it, and the badge called the trip in play until the nightly cleanup closed it. The locks on those sessions are the same signal a row's own live dot reads, so the board and the rows on it cannot disagree about who is out.

**The Poller on the page is deliberately left looser** (`activeRoundIds.length > 0`): polling is for noticing that scores have started arriving, and a board that only began polling once somebody was locked in would never notice the moment they were.

#### The round columns scroll

Past `INLINE_ROUNDS` (4) the per-round columns stop fitting a phone, so they scroll sideways while **Pos / Name and Tot stay put**.

The obvious build — one scroller around the whole table with the fixed columns `position: sticky` inside it — puts back the bug the board card's missing `overflow-hidden` exists to avoid (see `docs/design-system.md`): an element that scrolls on one axis is a scroll container on **both**, so the column headings' `top: HEADER_H` would start measuring from the card instead of the viewport. So each row owns its own strip, and `useSyncedStrips` keeps them on one scroll position; nothing above the sticky heading scrolls. Writing `scrollLeft` raises `scroll` again, so the write is flagged and the echo swallowed a frame later — clearing it in the same frame lets the strips fight each other.

`Strip` is declared at module level. Inside `Board` it would be a new component type every render, so React would rebuild the div and take the scroll position with it — the one piece of state the whole arrangement exists to keep.

## Team sheets, and how teams get apportioned

A trip can run a team league and a pairings knockout at the same time, played by different teams: four teams of three in the league, six pairings in the draw. The same players, arranged twice. So a team board names the **sheet** it is played on (`teamSet`), teams carry `team_set`, and membership is its own table (`team_members`, migration 023) because a single `players.team_id` cannot hold two answers. `players.team_id` survives as a mirror of the `main` sheet only — the frozen Donegal Masters archive routes read it. `lib/teamSets.ts` is the pure model; `lib/teamMembers.ts` is the only place that writes.

**Which boards share a sheet is answered on the team screen, not in settings.** It used to be a "Same teams?" question in the leaderboard cascade, which asks an organiser to arrange teams that do not exist yet. Now:

- every team board is created on a sheet of its own (`nextSheetId`) and starts **open** — `isBoardOpen` means "no teams on this board's sheet", read off the teams themselves rather than a second copy of the answer
- `/trip/[code]/teams` lists the team boards as tiles. Open ones tick, and **ticking several before confirming is what makes them share teams**
- `sheetForSelection` picks where a selection lands: a board that already has teams keeps them and the rest join it, so confirming never silently discards an arrangement; `main` leads, since it is the sheet `players.team_id` mirrors
- confirming writes the sheet onto the selection (`withSheet`, guarded by `sheetChanges`) and revalidates the trip, so the leaderboard tab shows the new tables without a reload. The teams themselves are already saved — every drag writes as it lands
- a board that has teams opens instead, showing them, with the way back into the picker on it

Team **size** rules are read off the boards in the current selection, never off the trip: a pairs draw fixes ITS teams at two and has no business resizing the league's (`lib/teamLimits.ts`).

The screen stays open once the trip is live. It has to — a player who joins halfway has to land somewhere, and their cards go with them.

### Who appears on which board

- **Players own their scores, not teams.** Scores are keyed by `player_id`; a team row is computed from *current* membership. Move a player between teams mid-trip and their scores go with them — no re-entry, no migration. Team points are a pure function of member scores under the trip's rules (`lib/teamScoring.ts`).
- A player added **after** teams were picked appears on the individual board immediately, and on a team board only once they are placed in a team.
- A team with nobody in it is not a row.

Both are pinned by tests in `scripts/test-leaderboard.tsx` rather than left as assumptions.

### Team scoring modes

When Team Play is on, `trips.team_scoring` (JSONB) decides how a team's points for each round are calculated. Logic lives in `lib/teamScoring.ts` — a pure function, unit-verifiable, takes any team size.

| Mode | Calculation | Options |
|---|---|---|
| `hero` | Best single individual card in the team counts for that round | — |
| `better_ball` | Composite card: best N Stableford scores on each hole, optionally opening up to the whole team over the closing holes | `countingScores` 1 to `MAX_COUNTING_SCORES`, `aggregateFinish` 0/1/2/3/6/9 |
| `aggregate` | Every member's score counts, over the closing X holes | `aggregateHoles` 18/9/6/3/2/1 |

`aggregateFinish` is the grandstand-finish rule: holes inside the closing stretch count **every** player rather than the best N, so a trailing team can still catch up. It can only raise a team's total, never lower it. Setting it to 18 is equivalent to the standalone `aggregate` mode.

Team sizes are deliberately **not** fixed for a team league — a team can have any number of players. `countingScores` above the smallest team's size is allowed (it just caps out); setup warns rather than blocks. A **pairs matchplay draw is the one exception**: it fixes teams at two, since that is what a pairing is.

This supersedes Donegal Masters rule 6 ("best-2-of-3") for trip pages — best-2 is now just the `better_ball` default, not a hard rule. The legacy DM leaderboard still hard-codes best-2.

**Future:** Skins, Nassau, Best Ball, Scramble, bracketed (rather than round-robin) matchplay.
