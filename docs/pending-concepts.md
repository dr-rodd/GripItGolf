# Pending concepts

Ideas Ross has agreed are good but has not asked to be built yet. Each is
kept here whole enough to be picked up cold by a later session: what it is,
why it came up, what it would touch, and the questions to settle first.
When one is built, move its decisions into the doc that owns that area and
delete it from here.

## Club match play and Golfer of the Year — plan of 17 Nov 2026

*Ross, 17 Nov 2026: "make room for continuous matchplay in comps … Golfer of
the Year is also a continuous event, but a separate feature in Clubhouse."
Plan only — nothing below is built. Proposals are marked **P1–P14**; the
questions that change what gets built are **Q1–Q6** at the foot. Answered the same
day: D264–D271 at the foot. Stage 1 is being built.*

### What already exists, and is reused whole

A club match play competition is **a knockout event under a club** — the
two halves are both built, and this plan is mostly joining them:

- **The knockout** (story 2): `trips.bracket_setup` with
  `format: 'match_play', schedule: 'continuous'` (`knockoutSeed`), the draw
  (`lib/bracketDraw.ts` — `DrawPlan` with a go-live date and time, Irish,
  random / by handicap / by order / pre-made, made once by `makeDueDraw` and
  the nightly `runDueDraws`), round deadlines lined up **from the Final
  back** (`drawDeadlines`), a qualifying event by code with seeding
  (`Qualifying`, stored but never acted on), `matchplay_matches`, the match
  page (arrange course, day and tees, contacts, walkover), the match card
  (holes in order, NR, the 19th, Finalise, reopen), Live now, the bracket.
- **The club competition** (stages d1–d4, c1–c2): `trips.competition =
  'club'`, Club admins only (a PIN nobody is given), members only through
  the door, every player their own Green Dot account with the account's
  handicap index (D179), a player made from a list row the first time it is
  needed (`players.club_member_id`), entry rules (`EntryRules`,
  `entryRefusal`), the Clubhouse's Events and Calendar, Comps' rows and the
  competition's own pages under `/club/[slug]/comp/[code]`.

What is new: **creating one from the Clubhouse, entries with a closing
date, partners, a qualifier taken from the schedule, matches inside the
club area, and a result both sides agree.** Golfer of the Year is new
entirely, and reads only what is already stored.

### Part 1 — Club match play

**P1. What it is.** A verified club's knockout over weeks: Singles,
Fourball (better ball) or Foursomes (one ball a side). Stored as today's
continuous knockout plus `trips.competition = 'club'`; the club's
competition writer (`app/api/club/competition.ts`) makes it through
`runCreate` as it makes a stroke competition — no itinerary, no rounds
(`CreateKnockoutForm`'s lean shape), one matchplay board
(`knockoutBoards`; a pairs board for Fourball and Foursomes, so
`needsPairings` and the pairs draw hold). **No migration for the
competition itself**: everything new rides in `bracket_setup` (P3) and
`trip_private.entry_rules` (094).

**P2. Made in the Clubhouse only** (`keep_calendar`, Ross: "created in
clubhouse"). Events → **New competition** asks first *Stroke play (one
day)* or *Match play (over weeks)*; match play opens its own side panel,
`MatchPlayPanel` beside `CompPanel`. Change and Copy as for a stroke
competition, with the same rule: nothing that would move a player once the
draw is made. Officers in the members app see it and run it on the day
(walkovers, results, reopening) but do not make one.

**P3. The panel's questions**, in order — each answer at its default
unless changed:

| Question | Answers | Stored |
|---|---|---|
| Name | e.g. "Captain's Prize Matchplay" | `trips.trip_name` |
| Format | Singles · Fourball · Foursomes | the board (`teamFormat`) |
| Handicap allowance | Singles 100%, Fourball 90%, Foursomes 50% of the pair's combined — WHS's recommendations, changeable | the board's `handicapAllowance` |
| Who may enter | the stroke panel's own entry rules — genders, memberships, an age band | `trip_private.entry_rules` |
| How the field is made | **Members enter** (with an entries-close date and time) or **From a qualifier** (P8) | `bracket_setup.entry` |
| Biggest field | 8 · 16 · 32 · 64 — the cap, so the rounds are known now | `bracket_setup.maxField` (new) |
| The draw | **When entries close** (default) or a date and time; random, seeded by handicap index, or by qualifier finish | `bracket_setup.draw` (`DrawPlan`, `at` = entries close) |
| Round deadlines | a date per round of the biggest field, Final last — the existing `RoundDeadlines` | `bracket_setup.deadlines` |
| Where matches are played | Home course only (default) · Any course | `bracket_setup.venue` (new) |
| Level after 18 | Down the 19th (default — the card already does it) · Halved, replay | `bracket_setup.tie` (new) |
| Who sees it | Members (default) · Guests may watch | the door, as a stroke competition |

**P4. Deadlines are set for the biggest field and lined up from the Final
back.** A 32 cap asks five dates; if 11 enter, the draw is 16 and the first
date simply falls away — `drawDeadlines` already does exactly this. So
every deadline is set at creation, as asked, without knowing the entries.

**P5. Entries close at a date and time (Irish, `irishInstant`)** — asked
only when members enter. **The draw is made at that moment by default**
(the stored `DrawPlan` with `when: 'date'`), so "entries close" and "the
draw" are one event unless the club sets the draw later. More entrants than
the cap: entries close early when it is full, and say so ("Full — 32 of
32").

**P6. Where it stands** — `lib/compPhase.ts` gains a match play reading
beside the stroke one (one file, two pure functions): **Announced** (before
entries open) → **Entries open** → **Entries closed** (until the draw) →
**Round of 16 · play by Fri 5 Jun** (the round in play and its deadline) →
**Final** → **Finished** (the winner known — gold from here only, D171's
rule). The Summary card's phase line and Comps' rows read it.

**P7. Signing up** (members app, Comps → Upcoming → the competition's
Summary). An eligible member sees the rules — format, allowance, where
played, the tie rule — **the entries-close date, the draw date and every
round's play-by date**, then **Enter**. An ineligible one sees why, in
`refusalWords`' own words, and no button. Entered, the button is
**Withdraw**, until entries close. Entrants are listed (names only).
Entering makes the player row from the list row, as booking does.

- **Fourball and Foursomes: a partner, through the tee sheet's booking.**
  The entry list *is* a sheet of pair rows drawn with `TeeSeats` — your
  seat filled, the seat beside it **+ Join** — and picking a partner is the
  tee sheet's own picker (`lib/teeBooking.ts`, `bookingPlan`): the club's
  eligible members not yet entered, searchable. The pair is a team on the
  pairs sheet (`team_members.added_by` — medium security: you may take out
  yourself and whoever you added). **Enter without a partner yet** leaves
  the seat open — another eligible member may tap **+ Join** beside you
  ("looking for a partner") until entries close; a lone entry at close is
  not drawn (said beforehand).
- **The partner sees "Entered with Ross"** on the Summary, on Comps' My
  entries, and on Home's Coming up — and may withdraw themselves, which
  leaves Ross entered alone with an open seat (Q2).

**P8. A qualifier from the schedule.** "From a qualifier" picks one of the
club's stroke competitions on the Calendar (dated before the draw), or
**makes a new one there and then** through `CompPanel` with its own date —
and asks **how many qualify** (a power of two up to the cap) and the seeding
(by finish, or random among the qualifiers — the existing `SEEDINGS`). The
link is the qualifier's code in `bracket_setup.qualifying` (exists). **When
the qualifier is certified** (`rounds.certified_at`), the top N on its
Results — ties by the qualifier's own countback (`lib/tiebreak.ts`) — become
the field and the draw is made (`byStandings`). Before then the match play
Summary says "Field: the top 16 from the Spring Medal, Sat 4 Apr". A
Fourball or Foursomes qualifier must be a pairs competition — **not built
today** (club stroke competitions are singles), so a pairs match play's
field is members entering until it is (P13).

**P9. Next matches in the members app.** Comps gains a fourth segment,
**Matches**, beside Upcoming · My entries · Results (Q1): each of your open
matches across the club's match play competitions — the opponent (and your
partner), the round, the play-by date, the course and day once arranged —
and below them the ones you are out of, faded. **Home's Coming up carries
your next match** as one row while you have one. A match opens its own page
inside the club area, `/club/[slug]/comp/[code]/match/[id]`, drawing the
existing match page's parts (arrange, contacts, walkover) in the club skin,
and its card the existing knockout card — the same components, the club
footer, so a member never leaves the club area (D186's rule).

**P10. A competition's own sections** (the footer's competition set):
match play swaps Tee times · Scoring · Leaderboard for **Entries** (until
the draw) / **Draw** (the bracket, after it) · **Matches** (every match in
the round in play, Live now on top) · **Rules**. `lib/clubBar.ts` learns
the second set; the Summary stays the hub.

**P11. A result both sides agree** (Q3). One side finalises the card (or
records a result by hand); **the other side confirms** from their Matches
row ("Ross won 3&2 — Confirm · Not right"); confirmed, the winner goes
through. Not right sends it to the club's Officers, who settle it (the
existing organiser override on the bracket). An Officer may record any
result. A match unconfirmed after 48 hours is taken as agreed. The match
card stays browser-written (`match_scores`, members only from 077); the
confirm is a server route (`/api/club/match`) writing the winner through
`persistWinner`, so nobody's phone can put themselves through alone.

**P12. Handicaps** (Q4): each player's index **on the day the match is
played**, confirmed at the card's start as a stroke competition's are
(`IndexConfirm`), the shots off the difference (`matchStrokes`). The match
page shows the shots as they would stand today.

**P13. Not now:** a pairs stroke qualifier; consolation plates; seeding by
last year's finish; a member arranging a match by message inside Green Dot
(the contacts on the match page carry it); home-and-away venues.

**Deadlines passed** (Q6): informational, as everywhere else — the round's
line turns to "Was due Fri 5 Jun", the Officers see the overdue matches on
Clubhouse's **Alerts** and award a walkover or put both out (the
existing award). Nothing happens on its own.

### Part 2 — Golfer of the Year

**P14. A Clubhouse section of its own, "Golfer of the Year"** (sidebar,
`keep_calendar`), one table a year, and **as many as the club runs** — the
men's, the ladies', the seniors', each with its own entry rules
(`EntryRules`, the competitions' own — a ladies' Golfer of the Year counts
only the ladies). Each has:

- **Points by finish** — a table the club edits (default 1st 25, 2nd 20,
  3rd 16, 4th 13, 5th 11, 6th 10 … 15th 1), shared on a tie (two level for
  2nd both get 18), from each certified competition's Results.
- **Match play by stage reached** — winner, runner-up, semi-finalists,
  quarter-finalists (default 25 / 15 / 8 / 4), given as each round finishes.
- **Which competitions count** — by kind (singles stroke, match play), all
  the year's by default; and **each competition's weight**, changed on its
  row: ×0 (doesn't count), ×1, ×1.5, ×2 (a Major) — "certain events editable
  to contribute more or less".
- **Best N** — every result counts, or the best 8 (say), a club's usual rule.
- **Who appears** — Plays here members whose rows meet the entry rules.

**Stored**: migration **097**, `club_awards` (club, year, name, rules
jsonb with the per-competition weights keyed by event code), server only,
grants by name. **The standing is never stored** — worked out on every read
from certified Results and finished brackets, the way a board is, in one
pure file (`lib/clubAward.ts`), so changing a weight re-tells the table at
once and a reopened competition drops out until certified again.

**Members see it** at the top of Comps → Results ("Golfer of the Year — you
are 4th, 12 behind") and on its own page with every counting result, each
showing what it was worth. The Clubhouse page shows the same table and the
rules beside it.

### The stages (each tested on greendot.live before the next)

1. **Made in the Clubhouse.** The type chooser, `MatchPlayPanel`, the writer
   (`runNewMatchPlay` beside `runNewCompetition`), its rows on Events,
   Calendar and Comps, the Summary with the rules and every date, the phase
   (P6). Nobody can enter yet. No migration. `test:clubs`.
2. **Singles entries.** Enter / Withdraw, eligibility, the entrants list,
   entries closing, the draw made at close (the existing `makeDueDraw`,
   seeded by account index).
3. **Matches in the club area.** The Matches segment, Home's row, the match
   page and card inside the club shell, the competition's own footer set,
   result confirmation (P11), deadlines on Alerts.
4. **Partners.** Fourball and Foursomes entries on the seat sheet, "Entered
   with X", looking for a partner; **the knockout card learns Foursomes**
   (one ball a side — `foursomesStrokes` exists for session cards; the
   knockout card plays only better ball today).
5. **Qualifiers.** Picking or making one from the schedule, the field and
   seeding off its certified Results.
6. **Golfer of the Year.** Migration 097, the Clubhouse section, the
   standing, the members' card and page.

### Stage 5 as built (18 Nov 2026) — qualifiers

- **Picking or making one.** The Clubhouse panel's "From a qualifier" picks
  one of the club's stroke competitions this year, or **Make a new
  qualifier** opens New competition's own panel over it (`CompPanel`, which
  now hands back what it made) and chooses it on return. How many qualify
  (2 to 128, never more than the biggest field) and the seeding (by their
  finish, or at random) as stage 1 asked. **Singles only** — a Fourball or
  Foursomes match play's field is members entering (the panel offers only
  that, and `matchPlayFormIssue` refuses the rest), because the club's
  competitions are singles (P13).
- **The field, once the qualifier is certified** (`makeQualifiedField` in
  `app/api/club/qualifierField.ts`): every round of the qualifier certified,
  its finishers in its Results' own order (`readQualifierFinish` — the
  board's `buildRows`, so its countback breaks ties exactly as members read
  it), No returns out, and the first N who are still on the club's list and
  play here (`qualifiedField`) become the match play's players — each from
  their list row with the one index, linked to their account, a name on the
  list twice told apart. **Made once**: `club.fieldingAt` claimed by a
  compare-and-set, `club.fieldAt` stamped when done, a field already there
  never touched. Reopening the qualifier afterwards changes nothing.
- **Then the draw** (`qualifiedDrawPlan`): on the results — at once,
  seeded by the finish (`order`) or at random; on a date — that day; by
  hand — left for the club. The platform's draw job makes it
  (`makeDueDraw`, which now makes a qualifier's field first).
- **Three doors ask for it**: certifying the qualifier
  (`CertifyStore.afterCertified` → `afterQualifierCertified`, never in the
  way of certifying), anybody opening the match play's Summary once the
  qualifier is certified (`DrawDueAsk`, `drawDueNow`'s `qualifierCertified`),
  and the nightly job (`runDueDraws` also reads every club match play still
  waiting on its qualifier).
- **Where it stands**: "The top 16 from the Spring Medal, Sat 4 Apr — once
  its results are certified" (`matchPlayLine` with the qualifier's day),
  then waiting on the draw once the field is made (`matchPlayPhase` reads
  `fieldAt`), then in play.
- **No migration.** `test:clubs` holds the rules.

### Stage 4 as built (18 Nov 2026) — partners

- **A Fourball or Foursomes entry is a pair**: a team on the draw's own
  sheet (`set-2`), its two players made from their places on the club's list.
  On the Summary a member searches the list for a partner (`names` — names
  only, each greyed with why: entered already, no Green Dot account, the
  competition's rules) and taps **Enter with Dave**, or **Enter on my own —
  find me a partner**. The partner does not accept (Q2): they see **"You’re
  in with Ross"** on the Summary and **"Entered with Ross"** on Comps' rows
  and Home's calendar (`/api/club` home `partners`, `readPairPartners`).
- **Looking for a partner**: the field is drawn as pair tickets, two seats
  across a seam; a pair one short has a dashed seat with **+ Join** for any
  member who may enter (`join`). Joining takes no new place, so a full field
  still lets a member in beside somebody. A pair one short may also add a
  partner later (`partner`).
- **Taking out**: yourself, and a partner you put in (`team_members.added_by`,
  `mayTakeOutOfPair`) — never the one who put you in. A pair left with one is
  looking again; with nobody, it goes. The Clubhouse takes out anybody, each
  member on their own, and sees which pairs are still one short.
- **The cap counts pairs** (`enterIssue`'s `entered`, the Events table's
  booked column, the office's count). **A pair still one short when the draw
  is made isn't in it** (`drawnPairs`, in `makeDueDraw`) — said on the
  Summary beforehand.
- **Your next match** finds a pair's matches by its team (`readMyClubMatches`,
  `mySide` on the Summary), the opponent named as both players.
- **The knockout card plays Foursomes**: the board carries `teamFormat:
  'foursomes'` (kept by `parseLeaderboards` on a pairs draw); the card is one
  ball a side off the allowance of the partners' combined handicaps
  (`foursomesStrokes`), the side one entry with its score under its first
  player — exactly a Matches session's foursomes card. The match page says the
  side's shots under the side ("One ball · receives 3"). A Fourball stays
  better ball.
- **No migration.** `test:clubs` holds the rules and the route on a stand-in.

### After testing stage 3 (Ross, 18 Nov 2026)

- **Every club member sees every match play's draw**, with filters on the
  Matches and Draw sections (`DrawView`): a round, to play or played, a
  player's name. The Matches section opens on the round in play.
- **The biggest field is 16, 32, 64 or 128**, or no limit (`FIELD_CAPS`);
  `MAX_BRACKET` is 128 platform-wide and a draw has up to seven rounds.
- **Every match is on the club's home course** — the venue question is gone.
  The match page asks only the day and tees (`MatchArrange fixedCourse`).
  Other clubs' courses belong to interclub match play, below.
- **Only the Clubhouse takes an entry out** — an Officer no longer can; a
  member still takes themselves out until entries close.
- **Matches stay on the event's own pages** for now (the match page and card).
- **"Needs you" is Alerts**, in the Clubhouse's Overview.
- **The Clubhouse calendar filters match plays**: Every event, Without match
  play, Match play only.

### Stage 3 as built (18 Nov 2026) — the draw in the club area

A match play's footer reads **Field · Matches · Draw** in the slots a stroke
competition's Tee times, Scoring and Leaderboard hold. **Field** lists who
has entered; **Matches** shows your match and the round in play's matches;
**Draw** every round with its play-by date and results, and a link to the
full bracket. The Summary, once drawn, says the round in play and shows your
match — round, opponent, play-by date and **Open your match**. **The match
page and card are the event's own** (`/golf/event/<code>/match/<id>`),
exactly as a stroke competition's card opens on the event's scoring page:
arranging the course and day, contacts, the card, a walkover — all built and
tested there. Comps gains **Matches** beside My entries; Home leads with
**Your next match** (D266) — a match play is never "Live now". On a club
match play the card's Finalise says "This puts the result into the draw.
Nobody else is asked, so check it with the other side first." (D268). The
Clubhouse's page lists matches past their play-by date, filtered by round
and by how overdue, each opening its match page in a new tab for an Officer
to decide; Alerts says how many (D271). **No migration.** Pairs, a
qualifier acted on, and Golfer of the Year are stages 4 to 6.

### Stage 2 as built (18 Nov 2026) — entering

The Summary's card carries **Enter** for a member who may (Plays here,
their own account, the competition's entry rules judged on the day entries
close), **Withdraw** once in — until entries close — or the reason in the
competition's words, and the field so far (an Officer's **Take out** beside
each name until the draw). Entering makes the player from the list row with
the account's index; the field is capped, the later of two entries on the
last place taken back. The Clubhouse's page lists the field and takes an
entry out, logged. **Singles only** — a fourball or foursomes says entering
with a partner opens soon. Entrants are players to the event (so their match
cards open to them in stage 3). The draw: the platform's draw job, as
planned at creation, made the first time the Summary is opened after
entries close (else the 3am run), each entrant's index refreshed first.
**No migration.** Not yet: the bracket and matches inside the club area
(stage 3 — until then a drawn match play's Summary says "The draw is made"
and no more).

### Stage 1 as built (17 Nov 2026)

Made in the Clubhouse: Events → New competition asks **Stroke play** or
**Match play**; `MatchPlayPanel` asks the name, format and allowance (WHS's
100 / 90 / 50), who can watch and enter, how the field is made, the biggest
field (or no limit), when and how the draw is made, the play-by dates and
the three rules. `runNewMatchPlay` makes it (Clubhouse only, a qualifier
only one of the club's own competitions played before the first round is
due); `lib/clubMatchPlay.ts` holds every rule. Its row on Events shows its
format, entries of the cap and phase, with no Change or Copy yet; the
calendar marks entries closing, the draw and each play-by date; Comps lists
it as upcoming until it is drawn; its Summary shows the rules and dates,
and says entering opens soon. **No migration.** Not yet: entering (stage
2), the club area's draw and matches (3), partners (4), the qualifier acted
on (5), Golfer of the Year (6), and changing a match play after it is made.
**Watch for in stage 2:** the platform's draw job will try a club match
play's dated draw at entries close and, with nobody entered, let it go
(logged nightly) — stage 2 makes the draw from the entries and seeds it by
the account's index (players' `handicap` today).

### Ross's answers (17 Nov 2026) — D264–D271

- **D264 — no biggest field is an answer too.** "No limit" beside 8 · 16 ·
  32 · 64. With no cap the deadlines are set **from the Final back** — the
  Final, then "+ Add an earlier round" as many as the club likes — and the
  draw lines them up as it already does (`drawDeadlines`): a round earlier
  than the dates set has none.
- **D265 — the draw**: when entries close (default), **on another date and
  time**, or **by hand** — the Officers make it themselves, seeded or not,
  on the existing draw builder, as an organiser does today. Automatic
  draws are random or seeded by handicap index (or by qualifier finish).
- **D266 (Q1)** — a **Matches** segment in Comps, and **your next match on
  Home** first and foremost.
- **D267 (Q2)** — **a partner does not accept**: named, they see "Entered
  with X" and may withdraw themselves.
- **D268 (Q3)** — **no confirmation by the other side**: whoever puts the
  result in is shown a pop-up first ("This puts Ross through to the
  Quarter-finals. Nobody else is asked — is it right?") and confirms it.
  Officers can still change a result (the existing reopen).
- **D269 (Q4)** — the handicap is **the index on the day the match is
  played by default, changeable in the Clubhouse** per competition (or
  frozen at the draw).
- **D270 (Q5)** — Golfer of the Year is **points by position**, the table
  chosen in the Clubhouse.
- **D271 (Q6)** — a deadline passing is **informational**: the Officers
  see overdue matches on Alerts and decide, **with filters** (by
  competition, by round, by how overdue) because a club may have hundreds.

## Interclub match play (Ross, 18 Nov 2026) — named, not built

A club's match play keeps every match on its own home course. A match play
between clubs — a team from one club against a team from another, home and
away legs, or a pennant-style league of clubs — is a different competition
and needs the other club's course. Ross: "Extra courses would go under
interclub matchplay not yet created."

What it would need, when asked for:

- **Two clubs in one competition** — today a club event belongs to one club
  (`trip_private.club_id`). Either both clubs' Officers run it, or the host
  club does and the other is invited.
- **A venue a match** — home or away, from the two clubs' home courses
  (`clubs.home_course_id`), which is the course question `MatchArrange`
  already knows how to ask before `fixedCourse` narrowed it.
- **Teams of the club's players**, picked by each club from its own list — a
  tag a club, as the Ryder Cup model already does (`lib/tagBoards.ts`), and
  Matches sessions (`session_matches`) scoring each tie, the Overall summing
  them.
- **Handicaps** across clubs: each player's one index (D179), as now.
- Questions to ask Ross first: one fixture or a league of clubs; who picks the
  team and when; whether a club's members watch the other club's matches.

## Casual tee sheets at a club — what is still to come

Ross, 17 Nov 2026. **Built** (D253–D260): the club's casual tee sheet on the
home course, sunrise to an hour before sunset (`lib/clubTeeSheet.ts`,
`/api/club/tee-times`, migration 096). Agreed and not built:

- **A club with more than one course** — a sheet per course, each on its own
  sun, a competition taking only its own course's sheet (today a club's
  home course is the sheet, and a competition elsewhere takes nothing).
- **Times within a day per membership** — five-day members not before 10 am
  at weekends, juniors after 3 pm. Today a membership books on its playing
  days, all day.
- **A settings change for one season or one weekday** — a winter interval,
  threes on a Saturday morning. Today one setting runs every day.
- **Locks while a member books** — the competition sheet's freeze. Today two
  members booking the last place together are settled by the database (one
  place a seat): the second is told the time has just filled.

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

## Accounts and clubs (D94–D152)

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

### D141–D152 (Ross, 15 Nov 2026) — the three tiers, and the redraw from (d)

**Decided**
- **D141** — accounts are more visible on the front page.
- **D142** — three tiers. **No account**: nothing changes, ever (D94).
  **Dot member** (the code's and the docs' word; on screen still "Green Dot
  member", D133): an account, with a personal page. **Club member**: on a
  verified club's list and linked; sees the site through the club, and keeps
  every Dot member feature.
- **D143** — a Dot member's personal page: their events, their stats (the
  headline feature), and making events. Its tab bar is the club's (D127)
  less Club.
- **D144** — a Club member's default view is the club area; their open
  events and the events they made sit in its upcoming list.
- **D145** — one club per account, for now.
- **D146** — making a trip or event moves off the front page, onto the
  personal page and the club area.

**Proposed (checked against the code below)**
- **D147** — the front page by tier. Signed out: the code box stays first;
  under it a **Green Dot members** card (Sign in, Join, one line on what it
  gives); **Create an event goes**, and a quiet "Organise an event" goes to
  Join. Signed in: greendot.live opens the member's home, which carries the
  code box.
- **D148** — one home address, **`/home`**: the club area for a Club member,
  the personal page for a Dot member; signed out it goes to sign in.
  **`/club/[slug]`** is the club's public page.
- **D149** — the personal tab bar is **Home · Events · Board · Stats · Me**;
  Board opens the live event's board, else the latest, never empty. The club
  tab bar stays D127 (Home · Comps · Board · Stats · Club).
- **D150** — D145 is enforced on the server only: linking or setting up a
  second club is refused, naming the club. The tables stay able to hold more.
- **D151** — the personal page has no skin; only a club area does.
- **D152** — stage (f), the card summary row and its backfill, comes before
  or with the personal page.

#### Q1. Sending a signed-in phone to /home with no flash

The sign-in lives in the phone's storage (supabase-js keeps it in
localStorage), so the server never knows who is signed in when it sends `/`.
`/` is static today (built once, prefetched whole). The options:

| Option | How | Flash | Cost |
|---|---|---|---|
| A. **Head-script hint** (recommended) | The account code keeps a hint on the phone — `gd.tier.v1` = `dot` or `club:<slug>` — written on sign-in and status, cleared on sign-out and when the session is gone. The root layout's head script (already there for the theme and the style lab) reads it before the first paint and, on `/` only, does `location.replace('/home')` | None: nothing is painted before it runs | `/` stays static. A member pays one hop to a static page from Vercel's edge (tens of ms). A few bytes more in the head script on every page. `/?front` skips it for anybody who wants the old page. **It is only a hint**: `/home` checks the real session and sends a stale one to sign in |
| B. Cookie hint read by the server | The same hint as a plain cookie; `app/page.tsx` reads cookies and redirects | None | `/` turns dynamic: every visit becomes a server function call, no static prefetch, slower for the signed-out majority. The home-screen app has its own cookie jar (a second phone anyway) |
| C. Middleware / proxy | Reads the cookie in front of every page | None | Ruled out: no proxy or rewrite without a Vercel preview (8 Nov 2026), and it adds a hop to every request on the site |
| D. Redirect after the page loads | `useEffect` on the landing page | A visible blink of the front page, 100–300 ms | Cheapest, and the blink is exactly what Ross wants gone |
| E. One page, two faces | The head script sets `html.member` and CSS swaps the landing's blocks | None | No redirect, but the member's home is not `/home` (D148) — two copies of "home" |

The same hint lets `/home` choose the club layout or the personal one
before it paints, so a Club member never sees the personal page flash
first. The installed app's `start_url` stays `/`; the head script handles it
the same way.

#### Q2. Is D145 true already?

No. 086's `uq_club_members_user` is one row per account **per club**, and
nothing refuses a second club: `runLink` refuses only "already on *this*
club's list", and `create` allows `MAX_CLUBS_MADE` (5) clubs per account,
each with its maker as owner. **D150 is a small change**: `runLink` and
`create` both ask `clubsOf(user)` first and refuse while the account is on
any club's list and not removed — "Your account is on Lahinch's list. One
club per account for now." `MAX_CLUBS_MADE` then never bites. Taken off a
list (removed), the account is free to join another. No migration. Folded
into (e1).

#### Q3. A Club member making an event from the club area

**Proposed rule:** an owner or admin of the verified club is asked once,
"Whose event is this?", with **the club's** (the default) or **just mine**.
A club's event is made under the club, Club admins only (086's unheld PIN),
so the wizard's PIN step becomes "Lend a PIN to helpers? (optional)". Any
other Club member makes **their own** event with no question, because only
admins run club events (D139). The club area's upcoming list (D144) shows
the club's events to everybody on its list, and a member's own events to
that member alone. *Code:* the create route takes a `clubId` **beside** the
row — never a column, so `CREATE_COLUMNS` is untouched — checks the maker is
an admin of that verified club, and writes `trip_private.club_id` /
`club_access` in the same step as the owner. The four wizards' PIN steps
learn the optional wording (`MemberGate` already knows who is signed in).
Built with the club area, (h).

#### Q4. The order, with the club page first

**What the club page needs first:**
- **The look from Claude.ai.** D123–D127's full text lives in the Claude.ai
  list, not here, and the page's layout is still to come back as a hand-off
  spec: where the crest, name, header photo and art sit, the art's
  strengths, the scrim.
- **The colour rules** (`lib/clubColour.ts`, the `[data-club]` tokens,
  `test:branding`'s club section — as drawn under "How a club's colour is
  held").
- **Somewhere to keep the art.** A storage bucket, two more columns for
  D124's light and dark art, and resizing on upload. `sharp` is only in
  node_modules as Next's optional extra and is not in `package.json`, so it
  is added as a dependency, or the phone resizes the image before upload.
- **A verified club with art to show.**

It does **not** need (d) or (f): the public page shows the club and its
upcoming events, which 086 already links (`trip_private.club_id`).

The redrawn order:

1. **(e1) The club page and its skin (D118, D123–D127, D150).** Migration
   **087**:
   - the `club-assets` bucket (public read, server write) and
     `clubs.art_light_path` / `art_dark_path`;
   - `lib/clubColour.ts`, the tokens and the uploads, set from the club's
     page by its admins;
   - **`/club/[slug]`**, a verified club only (else 404): crest, name,
     header photo, art, colour, and its upcoming events.

   Plus D150's refusal (Q2).
2. **(f) The card summary row (D121, D122, D152).** Migration **088**,
   `card_summaries`, as drawn under "Detail kept", with the one-off
   backfill.
3. **(g) The front page by tier and the personal page (D141, D143, D146–D149,
   D151).**
   - No migration.
   - The head-script hint (Q1) and the landing's members card; Create an
     event comes off the front page.
   - `/home` with Home · Events · Board · Stats · Me. Stats reads (f); that
     is why (f) comes first.
4. **(h) The club area (D144, D127, Q3).**
   - No migration.
   - `/home` for a Club member: Home (the upcoming list) · Comps · Board ·
     Stats · Club, in the club's skin.
   - Making an event from it, by Q3's rule.
   - The list page moves under Club for its admins.
5. **(d) Club events and booking (D112, D113).** *Replaced 16 Nov 2026 by
   "Club competitions (D161–D175)" below — stages (d1), (d2), (d3), with
   migrations 089 and 090.*

Migration numbers are redrawn: 087 the club's art (was (d)'s), 088 the
summary row (unchanged), 089 club events.

#### Where /home fits what is there today (D148)

| Address today | From (g) |
|---|---|
| `/` | The front page; a signed-in phone goes on to `/home` (Q1) |
| `/account` | Stays the door: sign in, join, Forgot password, and where `?next=` lands. Signed in, it goes on to `/home/me` |
| `/account/events` | Becomes the Events tab, `/home/events`; the old address redirects (Next's own `redirects()` in `next.config.ts`, as the trip addresses do — no proxy) |
| `/account/clubs`, `/account/club` | Joining by code moves to Me; the list moves to the club area's Club tab in (h); the old addresses redirect then |
| `/dashboard` | Has no page today (only `/dashboard/create`). Redirects to `/home` |
| `/dashboard/create`, `/create`, `/golf` | Stay as they are, behind `MemberGate`; reached from `/home` and the club area instead of the front page |
| `/club/[slug]` | New in (e1), public, a server page with a shared copy |

#### Q5. What the personal page reads

The shell is static and draws at once from the hint. Everything else is
asked **after the page paints**, in one round trip from the phone
(`/api/account` `home`).

| Read | Queries | Shared copy |
|---|---|---|
| Who and which tier | username (1); the club rows and the club (2) | None: per person, `no-store` |
| Events (Home's upcoming, the Events tab) | owned, entered and linked (3); the club's events (1–2); the events' rows (1). `claim_events_by_email` once a session, not every load | None. Small: tens of rows for a busy golfer |
| Live now (Home, Board) | Only for events dated today: their rounds' active cards (1, a count) | None |
| Stats | The account's players (1, already read for Events) and their summary rows (1, indexed by player). Never a hole score | None. A season is tens of rows |
| Board | Nothing of its own: it opens the chosen event's leaderboard, which reads the **golf board's shared copy** (D91, at most 10 seconds old, one per event) | Yes: the event's board copy |

The club page (e1) is the only new shared copy: **one per club**, public
data (the club and its upcoming events), about 60 seconds old, built the
`lib/sharedCopy.ts` way.

#### Ross's jobs by hand
- **(e1):**
  - Bring the club page's look back from Claude.ai as a hand-off spec.
  - Paste 087 before the deploy.
  - Verify a test club, and give it a crest, a header photo and light and
    dark art (D126's spec).
- **(f):** paste 088, then tap the backfill once. It will be an admin-only
  button: this container cannot reach the database.
- **(g):** move Resend to its paid plan before more sign-ins are invited
  (question E). Nothing to paste.
- **(h):** nothing to paste. Choose what Comps shows before (d).
- **(d):** see "Club competitions (D161–D175)" below.

#### Phone checks
- **(e1):**
  - `greendot.live/club/<slug>` for a verified club: crest, name, photo and
    art by day and at night. A green club, a yellow club and a white club
    all readable, with emerald still meaning live.
  - An unverified club's address is "not found".
  - Linking a second club is refused, naming the first.
  - Nothing outside `/club/` has changed.
- **(f):**
  - Sign a card; its row appears.
  - Edit a hole; the row follows.
  - North West 26's rounds are there after the backfill.
- **(g):**
  - Signed out, the front page is the code box, then the members card, and
    no Create.
  - Signed in, greendot.live lands on Home with no blink, and the code box
    there joins an event.
  - Board opens a live board, else the latest.
  - Stats shows your rounds.
  - Sign out: the front page comes back.
  - `/account/events` and `/dashboard` land on `/home`.
  - The installed app opens on Home.
  - A phone with no account: everything as before.
- **(h):**
  - A Club member lands on the club area in the club's skin.
  - An admin makes an event "the club's" and it is locked to admins.
  - A plain member's own event is theirs alone.
  - Taken off the list, the person lands on the personal page on their next
    visit.
- **(d):** see "Club competitions (D161–D175)" below.

### Stage (e1) as built — the club page (15 Nov 2026; D123–D127, D150, D155–D160)

**Migration 087** (paste before the deploy): the `club-assets` bucket
(public read, WebP only, 2 MB, no phone policy — the server writes on the
service role) and `clubs.art_path` / `art_dark_path` (D155; 086's
`header_path` is left unused — the art is the header). **`/club/[slug]`**
(D157): the server draws the public face from `clubs` and the club's
guests-welcome events only (`publicClubEvents` — the HTML never carries a
members-only event), regenerated at most once a minute (`revalidate = 60`,
Next's own cache, in place of the shared server copy proposed under Q5: a
public page is the one place it serves better); a phone signed in to a
Green Dot account then asks `/api/club` `home`, and a member on the list
(verified club, linked, not removed) gets the members home in place — Home
(On now, Coming up), Comps (Upcoming, My entries, Results, D159), Board (the
live event, else the latest, else the next — a link to its leaderboard), Club
(their role; for admins the list and the look). Stats is held back until (f)
(`STATS_READY` in `ClubTabBar`), so the bar is four for now and Board is not
yet in the centre. **The flash:** a member's phone sees the public face for
a moment before the members home — the server cannot see the sign-in; D154's
hint in (g) removes it. **The colour** (`lib/clubColour.ts`): the stored hex,
stepped in lightness only until a mark clears 3:1 and words 4.5:1 on the page
and a card in each mode, words on a fill 4.5:1, and ΔE ≥ 20 from the emerald
and its deep; the wrapper `[data-club]` carries both modes' values and
`globals.css` picks them, the tokens `club`, `club-deep`, `on-club`,
`club-tint` used only on club pages (`test:clubs`). **The art**: one image,
multiplied by day, darkened by CSS at night unless the club gave a night
image, about 60% on the home and 20% behind the title elsewhere, faded by a
mask (`test:branding`'s second gradient exception), the grain laid back over
it at night (the third place `--gd-grain` is named). **Uploads**
(`/api/club/upload`, `runUpload`): the club's owners and admins, JPEG, PNG or
WebP under 4 MB (Vercel's request ceiling), art landscape and at least 1170
wide (D126), resized with sharp (D156, `app/api/club/images.ts`), kept under
a fresh name with a year's cache, the old one deleted. **The look** is set in
`/account/club` (`ClubLook`): the colour with a day and a night preview and
a line when it was adjusted, the crest, the art, the optional night art.
**D150**: `create` and `link` refuse an account already on a club's list,
naming the club. **D160**: `/admin` (Trips) shows the day's email count from
Resend (`lib/emailCount.ts`), the line saying to move to the paid plan past
50 — it needs a Resend key allowed to read, not only send.

### Stage (f) as built — the card summary row (15 Nov 2026; D121, D122, D152)

**Migration 088** (paste before the deploy): `card_summaries`, one row per
player per signed round, as drawn under "Detail kept", with `origin`
`club` | `self_claimed`, server only. **The rule** is `lib/cardSummary.ts` on
`lib/holeStats.ts` — the stats hub's own rules (an NR keeps only its tee
shot, an impossible putt count is dropped, a par 3 has no fairway); a gross
only for a card with every hole finished; points are the stored Stableford
points, off the full handicap. **Written** after a commit (the phone asks
`/api/stats/card` and never waits), after a void (the dashboard, `/admin`), a
card check's re-score, and **re-told** (origin only) when an event moves into
or out of a club or its club is verified or not. A missed one is filled by
the nightly job (40 a night) and the **backfill** on `/admin` → Trips → Fill
card summaries (as many as fit in fifty seconds a tap; North West 26
included, read only from its scores). Decided while building: **a casual
round's card is summarised** (kept off the boards, but still golf signed);
**the backfill finds signed rounds by their finalised cards** (`live_rounds`),
so a round played before cards were finalised there would be missed — none
is known. **Read** by the club area alone so far: Your season's three tiles
(rounds, average and best Stableford over full rounds) with the self-claimed
line, the Stats tab's rounds this year, and Competitions' results' top
club-round score ("Top score", from the summaries — not the event's own board,
which may rank by another format). The personal page (g) reads the same rows.

### Stage (g) as built — the front page by tier and the personal page (15 Nov 2026; D141, D143, D146–D149, D151, D154)

No migration. **The hint** (`lib/tierHint.ts`, Q1's option A): `gd.tier.v1`
in localStorage, `dot` or `club:<slug>` — a kind and a club's address, never
a name (D154). The root layout's head script runs it first: on `/` with
nothing after the slash, a hinted phone goes on to `/home` (or the club)
before any paint; on `/home`, a club hint goes on to `/club/<slug>`, so a
Club member never sees the personal page flash. `/?front` shows the front
page anyway. Kept true by the account code itself — every read of the
sign-in writes `dot` if there is no hint and clears it if there is no
account; signing out and deleting clear it; `/home`'s ask writes the club
or `dot`; the club page writes the club, and back to `dot` once taken off
its list. A phone signed in before the hint existed is noticed by the front
page once (it peeks at supabase-js's stored session without loading it —
`storedAccountSession`) and goes on to `/home`: one blink, once.

**The front page** (D147): the code box first, then the **Green Dot
members** card — Sign in, Join, one line ("Your events, your rounds and
your season in one place — and where events are made") — then a quiet
**Organise an event**, which is Join with `?next=/create`. **Create an event
is gone** (D146). One emerald button still: Join event.

**`/home`** (D143, D148, D149, D151): static, one ask after it paints
(`/api/account` `home`: username, events, the club if any, this year's
season and its courses). **Home · Events · Board · Stats · Me**, no skin,
the lit tab emerald.
- **Home**: the greeting with the username, the date, the code box, **Make
  an event** (→ `/create`, `MemberGate` as ever), then Live now, Coming up
  (date tiles) and Your season — each only when it has something.
- **Events**: what `/account/events` was (`app/home/EventsTab.tsx`) — the
  list, Your players with Unlink, Add an event you run.
- **Board**: the live event's leaderboard, else the latest result, else
  the next — never an empty board.
- **Stats**: Your season — the tiles and the rounds, `app/components/Season.tsx`,
  shared with the club area; the reads are one copy too (`app/api/stats/season.ts`).
- **Me**: Your account (`/account`), Clubs, Privacy, Terms.

**What moved:** `/account/events` and `/dashboard` redirect to `/home`
(Next's own `redirects()`); `/account` signed in just now goes on to
`/home`, reached already signed in it is the settings; Sign out lands on the
front page. **Not yet:** a Club member is sent on to their club's page
(the members area there), until (h) brings it under `/home` with Q3's
"Whose event is this?"; `/account/clubs` and `/account/club` stay where
they are until then. **Departure from the plan's table:** `/account` does
not redirect to `/home/me` — Me links to it, so it stays the settings page,
and the tabs are one page (`/home?tab=…`) rather than `/home/me` and
`/home/events`.

### Club competitions (D161–D175) — plan of 16 Nov 2026, replacing stage (d)

*From Ross's notes of 16 Nov and the Claude.ai project doc
club-competitions-flow-2026-11-16. Plan only. D161–D173 are below as handed
over; **D174 and D175 were named but their text was not in the message**, so
nothing here plans against them yet.*

**Scope:** a verified club's standalone, single-round stroke play
competition — Stableford or strokes, singles. Made in the club area from a
short form, no PIN, no entered field, lived inside the club area as a child
of Comps; the club header and `ClubTabBar` never change. **Every event
outside a club behaves exactly as today**, and so does every club event that
is not a competition (`trips.competition` null — below).

**Phases** (`lib/compPhase.ts`, pure, the one copy): **Announced** (before
the tee sheet opens) → **Booking open** (`TeeRules.opens` through
`irishInstant`, until the first tee time) → **In play** (from the first tee
time, or the first card started, until scoring closes) → **Awaiting sign-off**
(scoring closed: every booked player has a signed card or a No return) →
**Certified**. Inputs: the date, the sheet's opening and first time, the
booked count, signed count, No returns, whether any card is open,
`certified_at`. *Edge to note:* a competition with a card nobody signs stays
In play, with "3 cards still open" for its admins, until they sign, void or
mark No return — the rule as written.

#### Answers

**1. The shell — (a), a real route `/club/[slug]/comp/[code]`.**

| | (a) its own route | (b) the event layout draws the club shell |
|---|---|---|
| Paints first | The club skin from the server (art, crest, colour — the face the club page already reads), the competition's name, date and phase, and one section | The club skin over the event's pages — but only after the layout has read the event's club: **+1–2 reads in the layout of every club event**, every page |
| Reach | Competitions only | Every club event, competition or not; the organiser area, Trip Setup and the rest would need the event's own tabs, which `ClubTabBar` cannot carry |
| A non-member, members-only competition | The public face and "<club> members: sign in" — no event data in the HTML (the door, below) | The same gate would have to live in the layout |
| A non-member, guests welcome | The competition read-only in the club's skin, no tab bar, "Back to <club>" | The club's tab bar leading into members-only tabs |

(b) changes the one layout every event goes through and adds reads to
it; (a) adds a route and touches no event page's behaviour. **(a).**

- **Sections:** a `Segmented` (Tee sheet / Scoring / Leaderboard), only the
  phase's own (Announced: none, the details; Booking open: Tee sheet; In
  play: all three; Awaiting sign-off and Certified: Scoring and
  Leaderboard / Results). Each is `?view=`, rendered on the server, one
  section's reads at a time — the `Segmented` is links, so each is
  prefetched.
- **Reuse:** the tee sheet page's body moves into a server component
  (`teesheet/TeeSheetSection.tsx`) that the event's own page and the
  competition both render — the event page's output byte for byte the
  same, held by a test. **Leaderboard**: the D91 copy (`boardCopy`) and
  `TripLeaderboardClient`, with a `provisional` switch (no gold until
  Certified, D171). **Scoring**: new and small — one round: your card
  (Start / Resume, into the full-screen card as it is), and the groups'
  progress; the 580-line picker is for many rounds and kinds and is not
  reused. Sections sit in `TripBaseProvider base=/golf/event/<code>` so
  their links go where they go today.
- **The tab bar:** `ClubTabBar` gains a link mode — on the competition page
  each tab is `/club/<slug>?tab=…` (the club page reads `?tab=` already);
  on the club page they stay buttons. Board (centre) goes to the live
  competition's `?view=board`. The server cannot see who is signed in, so
  the bar is drawn after hydration on the tier hint (`club:<slug>`) and
  kept once the members ask agrees, as the club page does — fixed at the
  foot, nothing moves when it arrives.
- **The event's own addresses:** the hub (`/golf/event/<code>`) and the
  short link go on to the competition page for a competition (the hub's own
  trips read gains the column; the layout's kind read selects one column
  more, **no extra request**). The card stays `/golf/event/<code>/scoring/1`,
  full screen and unchanged, its back arrow to the competition; the event's
  `TabBar` is not drawn on a competition (the same column, in the layout's
  existing kind read).
- **Members only (D113, D164) is the public PIN door, with a PIN nobody is
  given** — D136's trick again. A members-only competition is made with an
  unheld public PIN; the trip layout already sends a phone without the
  door's cookie to `/enter/<code>`, and `/api/entry` already refuses one.
  The door learns a second key: a signed-in, linked, not-removed member of
  the event's verified club (`runDoor` given the account token; the
  membership read is the entry store's own `clubAdminIds`-style query, so
  nothing under `app/api/entry` or `app/enter` imports the club route or
  names an account — the D94 guards hold). `/enter/<code>` for a competition
  goes on to `/club/comp/<code>`, which looks up the club and lands on the
  competition page, where the sign-in lives. **Guests welcome** is no
  public PIN. *Without this the board would leak*: server pages read on the
  service role and draw for anybody with the address, whatever `/api/entry`
  refuses.

**2. Booking "me" without a claimed player, and a list row that is no player
yet.** Today a booking is the browser writing `tee_assignments` for players
who already exist, and "me" is the claimed-player cookie. A competition has
no field, so its booking goes through the server:

- **`/api/club` `book`** (`runClub`, on its injected store): the account →
  its list row (linked, not removed) → the competition is the club's and
  Booking open → **find or make the player for each list row**
  (`players.club_member_id`; name from the list, handicap from the row's
  index, D166) → `account_players` linked for the booker (D134's link) →
  the `tee_assignments` rows, `booked_by` the booker's player. The answer
  sets the door's cookie and hands back the booker's player id; the phone
  `rememberPlayer`s it and enters the event — so the tee sheet, the card
  and "your time" all read "me" exactly as now.
- **`withdraw`**: your own booking and those you made (`mayRemoveBooking`,
  medium security) until the tee time has gone; a player with no score is
  deleted with it, one with any score is kept.
- **`names`**: a search of the list for partners — names and row ids only,
  never numbers or emails, members of a verified club only, two letters at
  least, twenty at most; already-booked rows marked.
- `TeeSheetClient` gains a **club booking mode**: the picker reads `names`,
  Save calls `book`, the two-minute freeze (presence) unchanged.
- **D163: a column, `players.club_member_id`** (unique per event), not
  `club_entries` — the player row plus its tee time *is* the entry, so a
  second table would be a second copy. **"You're in"** then reads players
  pointing at your list row (so it is right even when a partner booked you
  before your account was linked), with `account_players` as today for
  everything else.

**3. Certified, and who.** **Not `trips.finalised_at`**: migration 010's
backfill stamped it on every trip of its day, and `setup_status` (draft →
live) still owns it — reused, every old trip would read as certified.
**New, on the round** (a competition is one round; a multi-round one later
needs nothing more): `rounds.certified_at` (phones read it, so the card can
say it is closed) and **`round_certifications`** (server only: round,
`certify` | `reopen`, by whom — an account id, so never on a phone-readable
row — when). **Readers that must respect the lock:**
- the database: `writable_rounds()` gains `AND r.certified_at IS NULL`, so
  no phone writes `scores`, `live_scores`, `live_rounds`,
  `live_player_locks`, `round_handicaps` or `composite_holes` for a
  certified round — one function, every scoring write;
- the service-role writers, each refusing a certified round: the card void
  (`lib/scorecardVoid.ts`, the dashboard and `/admin/live`), the card
  check's re-score of committed scores, a handicap snapshot rewrite
  (`lib/roundHandicaps.ts`), the nightly stale-card step, the summary writer
  (below), `rounds.casual` and `cardsOff`;
- the board (gold only once certified, D171), the competition page's phase,
  Comps, the hub's standing, the export;
- **Reopen** clears `certified_at`, logs it, deletes the round's club
  summaries; nothing else is touched.

**4. The data today, and No return.**
- **Booked, no card:** a `tee_assignments` row for the player and round, and
  no `live_player_locks` row on any of the round's `live_rounds`.
- **Card open, never signed:** a `live_rounds` row, `active` (or `closed` by
  the nightly step after 12 quiet hours), its `live_player_locks`, and
  `live_scores` — but no `scores` rows for that player and round. Signing is
  the commit: `live_scores` copied to `scores`, a missing hole written as a
  hole no return, the card `finalised`.
- **A trap:** `lib/staleLive.ts` closes a card untouched for 12 hours and
  deletes its leftover `live_scores` after 48. An unsigned competition card
  awaiting an admin over a weekend would lose its scores. **The nightly
  step skips the rounds of an uncertified competition** (d2).
- **No return** is per hole today; a whole round has none. **New:
  `round_no_returns`** (round, player, by whom, when; server only). Offered
  for a booked player with no card, or once their card is voided; an open
  card is signed or voided first. A No return is off the board (listed under
  it as NR, no place), feeds no season, and counts towards scoring closing.
- **Signing a card for somebody:** the commit lives in `LiveScoringFlow` in
  the browser. Its rule moves into `lib/` (one copy, the browser's commit
  and the admin's server route both call it) — the riskiest piece in (d3),
  held by `test:score-outbox` and a new test of the rule.

**5. Reads.**

| Page | Today | With competitions |
|---|---|---|
| Comps (the club members ask) | `trip_private` by club, the trips, entries, season, outside, top scores | **+1** always: the club's competitions' rounds (date, sheet rules, `certified_at`). **+3, in parallel**, only while a competition is in play or awaiting sign-off: bookings, signed cards, No returns for those rounds |
| Competition page | — | the club face (1–2, as the club page), the competition with its round and club in one read, then **one** section: the tee sheet's own reads, or the board's copy, or the scoring section's (its live cards and players, 2) |
| The event's layout | 4 reads, in parallel | **unchanged** (one more column in the kind read) |

**The D91 shared board copy is unchanged** in shape — one copy per event,
through `eventReader`, ten seconds at most; its trips read selects
`certified_at` (via the round) too, so Results show within ten seconds of
certifying.

**6. What this breaks, or bends.**
- **D94 is narrowed, and Ross should say so in words.** A members-only
  competition's door is the club's list and an account (D164–D165), so a
  member with no account cannot open it on their own phone — they are
  booked and scored by a partner. D94 ("nobody ever needs an account to
  join, play, score or watch") needs its exception written: *"…except a
  club's members-only competition, where the club's list is the door."*
  The code guards (`test:clubs`, `test:account`: nothing in `app/golf`,
  `app/run`, `app/scoring`, `app/join`, `app/enter`, `app/api/entry`,
  `app/api/trip` imports the club route, the tiers or an account) hold as
  drawn above — the door's member check lives in `app/api/event` and the
  entry store.
- **D140's 'anyone' does two jobs today.** `club_access` says who edits,
  but `publicClubEvents` and the "Members only" pill read it as who may
  watch. D164 splits them: **watching is the door** (a public PIN, held or
  unheld); editing stays `club_access`. For club events that are not
  competitions nothing changes — they keep today's reading until Ross says
  otherwise — or every 'admins' event made so far would suddenly show on
  the public face.
- **`club_access` 'pin' and the door:** a helper lent the organiser PIN gets
  in through the door with it (the admin PIN already opens the door).
- **D162 says "calls /api/trip/create"**: the plan keeps `runCreate`'s
  checks and calls it in-process from a server route
  (`/api/club` `competition`) that then writes the golf item, the round,
  `rounds.tee_sheet` and the board in the same request — no browser chain
  of writes, nothing half-made.
- **D171's countback is not on today's boards.** Only a prizes board
  answers the tie question (`offersTieBreak`: `combine: 'position'`); a
  plain totals board shares the place. The competition's one board must
  carry Tiebreak — either made as a prizes board, or `offersTieBreak`
  widened for a single-round board — and since `parseLeaderboards` drops
  the answer off any other board, that widening is a rule change with its
  own test (d2). The countback itself, back 9/6/3/2, is `lib/tiebreak.ts`
  as it stands; Certify freezes it.
- **New `trips` columns need their column grant** (071 granted the columns
  that existed): `trips.competition` gets its `GRANT SELECT (competition)`
  in 089; `rounds.certified_at` in 090 likewise if `rounds` was granted by
  column (to be checked when written).
- **Watch links** (D164's "or a watch link") are not built — the
  spectator role is reserved and nothing grants it. Until then a
  members-only competition has no outside viewer.
- `test:branding`: gold appears later, never in a new place. The tee
  sheet's outline stays `accent-deep` inside the club skin — emerald is
  action everywhere (D125).
- `test:rls` `CREATE_COLUMNS` gains `competition`.

*The stages, jobs and phone checks first drawn here (03cb024) are replaced
by the re-plan below.*

### Club competitions — the re-plan after review (16 Nov 2026; D174–D184)

**Agreed from 03cb024:** option (a), `/club/[slug]/comp/[code]`;
`players.club_member_id`; `rounds.certified_at` with a log; members only
through the public PIN door with a PIN nobody holds. **Changed:** D165
amended, D166 replaced by D179, D168 and "club tabs as links" replaced by
D180–D181, and D174–D184 new (`docs/design-brief.md`).

**What the amendments change in the first plan:**
- **The event's layout is untouched after all.** D183 opens the organiser
  area with the event's own bar, and D174 keeps external events as they
  are, so the event bar stays everywhere under `/golf/event/`: no hidden
  bar on the card, no extra column in the layout's read. The card's back
  arrow goes to the competition page; the event's hub and short link go on
  to it.
- **The competition bar (D180–D181) replaces the `Segmented` and the club
  tabs as links.** Drawn by the server with the page — Tee sheet, Scoring,
  Leaderboard, Home — over the club footer; Home leaves for the club's
  Home, where the club footer is back. All three sections are always in
  the bar; one not yet live is a single line saying when it starts
  ("Scoring opens with the first tee time, 8:00 on Saturday"). The rise out
  of Comps waits for its spec; it will be a new motion in the style
  guide's register, with a Reduce Motion version, before it is built.
- **Guests can watch (D184)** is no public PIN and, for anybody not on the
  list, **the spectator role** — reserved since migration 068 and granted
  by nothing until now. `/api/entry` grants it on a competition to a phone
  that is not a signed-in member of the club (the entry store's own
  membership read; nothing under `app/api/entry` imports the club route or
  names an account). Spectators read and never write, so "read-only for
  anyone with the code" is enforced by the database. Watching is split
  from editing for competitions only.
- **The PIN entry screen is never drawn for a competition**: `/enter/<code>`
  goes on to the competition (`/club/comp/<code>`), the padlock on a
  competition's event pages offers no PIN box ("Run by <club>'s admins" —
  an owner or admin opens it by being signed in, as today), and
  `InlineUnlock` the same. A test renders each for a competition and finds
  no PIN field.
- **D175:** booking opening sends no email.

#### D176–D179, the answers asked for

**Signing on the server (D176–D178).** Today the commit runs in the
browser (`handleCommit` in `LiveScoringFlow`): it writes `round_handicaps`,
reads `live_scores`, upserts `scores` (a hole with nothing on it written as
a hole no return), marks `live_scores.committed`, sets the card
`finalised`, and asks for the summary. **The move, built once in (d3):**
the rule into `lib/cardCommit.ts` (pure: the score rows and the hole no
returns from a card's `live_scores`, its holes and handicaps), and
`/api/card/sign` running it on the service role for the player's finalise,
the marker's co-sign and an admin's alike. **Competition cards sign only
through it.** An event outside a club keeps committing from the phone
through the same `lib/` rule, writing the same rows (a test compares them
row for row) — one copy of the rule, and no change on any other event.

**The marker.**
- A card in the app is a group's card; **a signature is a player's**. The
  finaliser (any account, D165 — who keys the scores is never enforced)
  finalises the group in one tap as today; **each player's card then needs
  its marker**.
- **Two different accounts on every card:** the marker can never be the
  finaliser. The player's own account may be the second signature — in a
  two-ball where Ross finalises both cards, Dave co-signs his own and Ross
  marks nothing twice. *Confirm this reading of D176.*
- **Choosing:** the tee time's other players first, then a name search of
  the list (the `names` search); the player (or, for a member with no
  account, whoever finalised) may change the marker until it is
  co-signed. An owner or admin may sign as marker on any card (D178).

**How a card waiting for its marker is stored.** At the finalise, the
server writes the player's `scores` rows (the Stableford trigger scores
them, and they are safe from every cleanup), sets the card `finalised` as
today, and writes a **`card_signatures`** row — server only, migration
090: round, player, card (`live_rounds`), finalised by and when (an
account), the marker (a list row; its account once linked), co-signed by
and when, sent back when. One row per finalise, so a card sent back and
signed again keeps its history. **Phones may no longer write `scores` on a
competition round** (090's policy) — only `/api/card/sign` does — so a
signed card cannot change under its marker.

**What the board shows for it.** Its total, in the standings, with a quiet
"To be marked" under the name; **D182's ties break on co-signed cards
only** — a card waiting for its marker level with another shares the place
until it is marked. Scoring closes only when every booked player's card is
co-signed or a No return.

**Cards to sign (D177).** The marker's club Home leads with **Cards to
sign** (the club members ask: one read of `card_signatures` for their list
row, open and not sent back), and the competition's Scoring section lists
the same. Each opens the finalise screen read-only with **Sign as marker**
(co-signed) and **Send it back**: the signature is closed as sent back,
the player's `scores` rows deleted, and the card opened again
(`active`) for the players on it not yet co-signed — a co-signed player on
it stays final (their rows are the server's, and a re-finalise skips them).

**Cleanup skips it.** A waiting card is `finalised`, which the nightly step
never closes, and its `live_scores` stay reachable, so never residue — and,
from (d2), `/api/cleanup` skips every round of an uncertified competition
outright. A test runs the cleanup's rules over a waiting card and finds
nothing to close or delete.

**The handicap (D179).**
- **Where the one value lives:** **`account_handicaps`** (an account, its
  index, when; server only, migration 089) for a Green Dot member, shown
  and changed on Me. **`club_members.handicap_index`** only for a list row
  with no account linked. The list shows the account's value for a linked
  row and the row's own otherwise — one value either way.
- **The log:** **`handicap_changes`** (server only, 089) — whose (the
  account, or the list row while unlinked), old, new, when, by whom (an
  account), where (Me, the list, the start sheet, linking), and the round
  when it came from a start sheet. Every write goes through one server
  helper that writes the value and its log line together.
- **Linking a row with its own index:** the account has none → it takes
  the row's (logged, from linking); both the same → nothing; they differ →
  **the account's stands**, the row's is cleared and logged as the change,
  and the person is told once: "Your club had 14.2 for you; your Green Dot
  index 13.8 stands — change it on Me." When a link is cut (taken off the
  list), the row keeps a copy of the value then, so the club's list is
  never blank.
- **The start sheet (D72), competitions only:** each player's index beside
  their name to confirm; a change goes to the server (the same helper) and
  updates the account or row, the player's `players.handicap` in this
  competition and in any of theirs not yet started — "everywhere" — before
  the card's snapshot (`round_handicaps`) is taken as today. Who may change
  it: whoever is starting the card (members score each other's cards).
- **At Certify (d4):** the admin sees every change made on the day to the
  competition's players (the log, Irish date), each with old, new, when and
  by whom.

#### The stages, redrawn

**(d1) Groundwork, and the handicap.** Migration **089** (paste before
its deploy):
- `clubs.home_course_id`, `club_members.handicap_index`,
  `players.club_member_id` (unique per event where set), `trips.competition`
  ('club' or null, its column grant);
- `account_handicaps` and `handicap_changes`, server only, their own
  grants.

*Undo:* drop the two tables, the four columns and the index. **Code:**
- the home course on `/club/[slug]/list`, with the scorecard gate asked
  there;
- the index on Me, on the list (the account's for a linked row), linking's
  rule, the one writer and its log;
- `lib/compPhase.ts`;
- "You're in" by list row;
- the door's member key and `/club/comp/[code]`.

No competition can be made yet.

**(d2) The competition in the club area.** No migration.
- New competition on Comps.
- The competition page with its bar (D180–D181) and Manage competition
  (D183).
- Booking, withdraw and partner search.
- The hub and short link going on to the competition.
- The PIN screens never drawn (tested).
- Guests can watch as spectators (D184).
- The start sheet's index (D179).
- The cleanup skipping uncertified competitions.
- The board: no gold; ties per D182 once a board carries Tiebreak
  (`offersTieBreak` widened for a single-round board, with its test).
- Cards finalise as today (from the phone) until (d3).

**(d3) Signing on the server, the marker, Cards to sign.** Migration
**090** (paste **after** its deploy — the server path must be live before
phones lose the `scores` write):
- `card_signatures` (server only);
- the `scores` policies switched to a function that is `writable_rounds()`
  less the rounds of a competition.

*Undo:* the `scores` policies back to `writable_rounds()`, then drop
`card_signatures`. **Code:**
- `lib/cardCommit.ts` and `/api/card/sign`; the ordinary commit on the same
  rule;
- the marker picker, "To be marked" on the board, Cards to sign on the
  club Home and the Scoring section, Sign as marker and Send it back;
- an owner or admin signing as marker.

**(d4) No return, void, Certify, Results, Reopen, the season.** Migration
**091** (paste after its deploy, with no competition card open):
- `rounds.certified_at` (and its grant);
- `round_certifications` and `round_no_returns`, server only;
- `writable_rounds()` with `AND r.certified_at IS NULL`.

*Undo:* 079's `writable_rounds()` back word for word, then drop the two
tables and the column. **Code:**
- No return, void an open card, Certify with the day's handicap changes
  shown, Results in gold, Reopen;
- the season fed only by certified rounds (summaries written at certify,
  deleted on reopen);
- every reader in the first plan's answer 3 respecting the lock.

#### Ross's jobs by hand
- **(d1):** paste 089 before the deploy. Set the test club's home course
  (its card photographed if asked). Give yourself an index on Me, and one
  unlinked test row its own.
- **(d2):** nothing to paste. On the test club's list: two accounts (one an
  admin), and one member with no account.
- **(d3):** paste 090 **after** the deploy.
- **(d4):** paste 091 after the deploy, with no competition card open.
- **To approve:** D94's exception — "…except a club's members-only
  competition, where the club's list is the door. A member without an
  account is booked and scored by another member." — and the two-ball
  reading of D176 above.

#### Phone checks
- **(d1):**
  - Me shows your index and changes it.
  - The list shows a linked member's index as theirs, and an unlinked
    row's own.
  - Linking a row whose index differs keeps the account's and says so
    once.
  - The list sets a home course; a course with no card asks for its photo.
  - Nothing else in the club area or any event changes.
- **(d2):**
  - An admin makes a competition; it is on Comps as Announced, then Booking
    open.
  - The bar: all three sections, one not yet live saying when it starts;
    Home back to the club with its footer.
  - Booking: yourself in one tap, a partner by name (the no-account member
    too), withdraw.
  - A phone with the code and no account is stopped at a members-only
    competition — **and never shown a PIN box** — and watches a "Guests
    can watch" one without being able to score.
  - The start sheet shows each index; a change there shows on Me.
  - The card's back arrow returns to the competition.
  - Manage competition opens the organiser area with the event's bar.
  - No gold. An event outside a club is unchanged.
- **(d3):**
  - Finalise a two-ball: each card asks for a marker, the other player
    first; the board shows "To be marked".
  - The marker's club Home leads with Cards to sign; Sign as marker
    co-signs.
  - Send it back reopens the card for its player.
  - An admin signs as marker.
  - A no-account member's card is finalised by their partner and
    co-signed by a third member.
  - A waiting card is untouched the next morning.
  - An event outside a club still commits exactly as before.
- **(d4):**
  - Mark a no-show No return; void an open card.
  - Certify lists the day's handicap changes, then the board becomes
    Results with gold and every card refuses an edit; the season shows the
    round.
  - Reopen: the gold goes, cards edit again, the season drops it.

### Stage (d2), amended, as built — the competition bar and the Summary (16 Nov 2026, evening; D180 amended, D186–D190)

**Built, 16 Nov 2026.** What landed, and where it differs from the plan below:
- **One footer, drawn by the club's layout** (`app/club/[slug]/layout.tsx` → `ClubBarProvider` + `ClubTabBar`), its set from the address (`lib/clubBar.ts` `barOf`). `CompBar.tsx` is gone; `ClubView` draws no bar and keeps its members home and open tab in the layout's context (`ClubBarContext.tsx`), so coming back from a competition the club footer and page are there at once. The layout reads only the club's colour (`clubLook`, one cached row read shared with the page).
- **The motion** is `.club-bar` in `globals.css`: the three **slide out from behind Comps at full opacity** (Ross's answer) — their strip starts at Comps' right edge and clips — 280ms on the putt curve, 40ms apart; Board, Stats and Club fade in 120ms; the tray fades in; out is the reverse in 200ms; Reduce Motion a 160ms cross-fade. The tray is the accent saying they are Comps' children.
- **Comps from any competition page goes back to the club's Comps list, the footer back to normal** (Ross's answer 4, replacing "one level back"). A section reaches the Summary by **‹ Summary** above its title.
- **The Summary** (`comp/[code]/page.tsx`): name, day · course · format (`boardFacts`), one floating card — the phase line (**In play**, Ross's answer 1, with the live dot), the line (`summaryLine`, `shortWhen`) and the action (`CompSummaryAction`, asked after paint: Book a tee time / your time and Change / Start your card / Certify result; **See the results secondary** — Ross to judge on the phone), the top three from the board's shared copy (`summaryBoard.ts`, gold only once certified), Manage competition. The sections are `tee-times/`, `scoring/`, `leaderboard/` over one body (`section.tsx`); the shared read is `read.ts` (`cache`), the frame `CompShell.tsx`. `?view=` on the Summary or the code's door goes on to the section.
- **The members-only door draws no footer** — a `<NoBar />` mark read by `body:has([data-no-club-bar])`, so the server's HTML has none.
- **Found on the way: club colours never reached a class** (`docs/gotchas-and-debt.md`, 16 Nov) — fixed with the four club tokens in `@theme inline`. Every club page now shows its club's colour.
- `test:clubs` holds the bar, the Summary and the fix; `test:account` lists the Summary's action.

*The plan as written before the build:* Ross's sketch replaces D180's four-slot bar
(Tee sheet, Scoring, Leaderboard, Home over the club footer). His list
numbered the new decisions D185–D189; D185 was already "every member
watches, only the tee sheet plays", so they are recorded as **D186–D190**,
in his order (`docs/design-brief.md` says which was which).

**The decisions in one breath.** The competition's own address is its
**Summary** (D186); its three sections are pages under it — `/tee-times`,
`/scoring`, `/leaderboard`. On all four the footer is **the club footer**
with Home and Comps where they are and **Tee times · Scoring · Leaderboard**
in Board, Stats and Club's slots (D180), a **tray** in the club tint behind
Comps and the three, and Comps wearing a **back chevron** (D188). Home and
the header's dot go to the club Home; Comps goes back one level (D187).
Board on the club footer opens a live competition's leaderboard (D189). The
card stays full screen with no bar, its back arrow to `/scoring` (D190).
All three sections always there, one not live a single line (D181).

#### Question 1 — sliding out of Comps across a page change

**Neither the View Transitions API nor an arrival-only animation: one bar
that never leaves the screen.** The bar moves from the two pages into a
layout, `app/club/[slug]/layout.tsx`, which covers `/club/[slug]` and every
competition page under it. Next keeps a layout mounted across a soft
navigation between its pages, so going from Comps to a competition is the
same bar changing its set — an ordinary CSS transition on a component
that is still there, with Board, Stats and Club and the three sections in
the same five cells. **Nothing can play on a cold link or a refresh,**
because a transition needs a change and a bar that has just mounted has
had none — no flag, no `sessionStorage`, no "where did I come from". It is
the trip layout's own lesson (CLAUDE.md: a bar drawn by a page "tears off
the screen on every navigation").

Why not the other two:
- **View Transitions** for a Next soft navigation means React's
  `<ViewTransition>`, which Next 16 still ships behind
  `experimental.viewTransition` — a site-wide flag, on production, for one
  footer (and CLAUDE.md asks a preview before anything that changes how
  every page loads). The cross-document kind (`@view-transition`) never
  fires on a soft navigation at all. It would also have to animate
  elements that exist on only one side (the three sections leaving, the
  club tabs returning) with hand-written `::view-transition-new` keyframes.
- **Arrival only** would have the competition page draw ghost Board, Stats
  and Club tabs to fade out, behind a flag written on the tap; and leaving
  would need the club page to play the reverse — but the club footer only
  appears once the page has asked who you are (`/api/club` `home`), after
  paint, so the reverse would play late or not at all. The layout keeps
  "this phone is a member here" from the club page it just left, so the
  club set is back the moment you leave a competition.

The motion as specified: in, Board/Stats/Club fade (120ms ease-out) while
each section moves from the Comps slot to its own (`translateX` in whole
columns — a transform's percentage is the cell's own width, one column —
280ms on the putt curve, 40ms apart, done by 360ms) and the tray fades in;
out, the reverse in 200ms ease-out, no stagger; between sections the lit
state only (150ms, as today); Reduce Motion a 160ms cross-fade of the two
sets. Durations and keyframes in the component's own `<style>` if
`test:branding`'s ceilings refuse them in `globals.css` (the intro's
precedent), else in `globals.css`.

#### Question 2 — one bar component with both sets

`ClubTabBar` gains a **second set and links**, and `CompBar.tsx` goes:

- A tab may carry an `href` — drawn as a `Link`, otherwise the button it is
  today calling `onChoose`. That is the whole change to a tab.
- The bar draws five cells; each cell holds its club tab and, in columns
  3–5, its competition tab on top, and `set: 'club' | 'comp'` says which
  shows. Home and Comps are shared; in the competition set Comps is a link
  (one level back) wearing the chevron, and the tray sits behind 2–5.
- Which set: the layout's bar reads the address (`usePathname`) — any
  `/club/[slug]/comp/[code]…` is the competition set, with the code and the
  lit section from the address, so **it is server-drawn and needs nobody
  signed in** (D180). On `/club/[slug]` itself the club set shows only once
  the page says this phone is a member — through a small context the
  layout provides (`ClubBarContext`: members yes/no, the tab, `hasBoard`,
  the live competition for D189), which `ClubView` writes instead of
  drawing the bar. `ClubView`'s `tab` state moves into that context, so
  Comps on a Summary can set "comps" before it navigates and the club page
  opens on Comps without a flash of Home (today `?tab=` is read after
  mount).
- No bar on `/club/[slug]/list`, on the public face, or on the members-only
  door (`CompDoor` draws a one-line `<NoBar />` that tells the context so —
  the layout cannot read the door's cookie without making the club page
  dynamic and losing its `revalidate = 60`).

#### Question 3 — a non-member watching a guests-can-watch competition

The same bar, because the server cannot tell them apart and should not
have to:
- **Home** — `/club/[slug]`, which for them is the public face: art, crest,
  "<club> members: sign in", the guests-welcome events. The competition
  set fades away (no club set to return to). Correct: that *is* the club's
  home for somebody outside it.
- **Comps** — from a section, the Summary (as for anyone); from the Summary,
  `/club/[slug]?tab=comps`, which the public face reads as its own page —
  its guests-welcome list is a non-member's Comps. Nothing new to build.
- **Scoring** — read-only: the tee times with each player's state ("On the
  course", "To be signed", "Signed"). No Start your card (they are a
  spectator, D184/D185), no Cards to sign, no admin card — each of those
  already asks and draws nothing for them.
- On the Summary, the action asks who this phone is and draws no button for
  them (they cannot book); the phase line and top three are the same as
  everyone's.

#### What changes in (d2)

1. **Routes.** `comp/[code]/page.tsx` becomes the Summary;
   `comp/[code]/tee-times/`, `scoring/`, `leaderboard/` each a page. Their
   shared read (face, competition, door, sheet, phase, slots) moves out of
   today's page into `comp/[code]/read.ts`, wrapped in React `cache`; their
   shared top (art, header, club header, name, date and course, phase line)
   into `CompShell`. Each page is `force-dynamic` and reads its own phase —
   never in the layout, which Next does not re-render between sections.
   `?view=tee|scoring|board` on the Summary address redirects to the
   section, so every link already out there keeps working.
2. **The Summary (D186).** Name (`t-h1`, wrapping), date · course · format
   (`t-cap`; format from the competition's board, `boardFacts`), then one
   floating card: the phase line (13px semibold, `club-deep`; "Live" with
   the live dot in accent while in play), one supporting line, the phase's
   action. Announced: "Booking opens Thu 19 Nov, 7:00 pm", no button.
   Booking open: **Book a tee time**, or once booked "You're out at 10:24
   with …" and **Change** (secondary) — both to `/tee-times`. In play:
   **Start your card** for a booked player (`CompPlay`'s rule), and the top
   three under the card. Awaiting sign-off: "Provisional"; **Certify
   result** for an owner or admin, to `/scoring`. Certified: the winner in
   `gold-deep`, **See the results**. Manage competition as a row for owners
   and admins (`CompManage`). Who "you" are is the phone's, so the action
   and your tee time are a small client island asking `/api/club/booking`
   `state` after paint, its height reserved so nothing jumps; the phase
   line, supporting line and top three are the server's. The top three come
   from the board's shared copy (`leaderboard/boardCopy.ts`) — no gold
   until certified. The supporting lines are one helper beside
   `sectionWaitLine` in `lib/compPhase.ts`.
3. **The bar.** `app/club/[slug]/layout.tsx` with `ClubBarContext`;
   `ClubTabBar` with both sets, links, the tray and the chevron (Q2) and
   the motion (Q1); `CompBar.tsx` deleted; `ClubView` writes the context
   and draws no bar; pages keep `has-tabbar`.
4. **Ways back (D187, D190).** The in-page "‹ Competitions" link goes —
   the Comps chevron is the way back now. `TripHeader backTo` stays
   `/club/[slug]` (the dot). The card's back: the scoring page's
   `competitionBack` becomes `/club/comp/<code>/scoring`, through a new
   `app/club/comp/[code]/[section]/page.tsx` beside the code-only door,
   which also maps an old `?view=`.
5. **Board (D189).** While a club competition is in play
   (`e.competition.phase === 'in_play'`, the first if several), the club
   footer's Board is a link to its `/leaderboard`, and the bar slides into
   the competition set with Leaderboard lit. Otherwise Board is the tab it
   is today. `boardHref` in `ClubView` points at `/leaderboard`.
6. **Tests.** `test:clubs`: one bar component holds both sets and no page
   draws a bar; the layout draws it; the competition set comes from the
   address alone; the section pages and the `?view=` redirects; the card's
   back to `/scoring`; Board's live link; the Summary's action per phase
   (the helper, pure). `test:branding`: the tray's `club-tint` and the
   second tab set inside club space only; the bar's durations against the
   ceilings. `test:account`'s list of files importing the account code
   changes if the Summary island imports it.
7. **Docs.** CLAUDE.md's routes table (the Summary and the three sections),
   D127's line (the bar gains the competition set), and this section
   rewritten as built.

**Asks for Ross before building** — answered 16 Nov: In play; See the results to be judged on the phone; the three slide from behind Comps at full opacity, accented as its children; Comps goes back to the club's Comps and the footer returns:
- **"Live" or "In play"?** The Summary's phase line says "Live" in the spec;
  Comps' rows say "In play" from the one copy (`PHASE_WORDS`). One word
  for both, or the Summary alone says Live?
- **See the results** — an emerald button, or secondary? Emerald is for
  action, and the phase is over.
- **Do the sections fade in as they travel** out of Comps, or start fully
  drawn behind Comps and emerge? The spec gives their travel, not their
  opacity.
- D187's Comps may become Home — one line in the bar if so.

#### The phone check (after it is built)

1. Club area → Comps → tap a competition: Board, Stats and Club fade, the
   three sections slide out of Comps, the tray appears, Comps shows the
   chevron, the Summary is on screen.
2. Tap Tee times, Scoring, Leaderboard in turn: only the lit tab changes.
3. Tap Comps from a section: the Summary. Tap Comps again: the Comps list,
   the club tabs back (no flash of Home).
4. From a section tap Home; separately tap the green dot: the club Home
   with the club footer.
5. Refresh on a section, and open a competition from a shared link: the bar
   is just there — nothing moves.
6. Start a card from Scoring: full screen, no bar; its back arrow lands on
   Scoring.
7. On a day a competition is in play, tap Board on the club footer: its
   leaderboard, Leaderboard lit.
8. Open a competition in each phase: the Summary's line and button match
   (Announced none; Booking Book a tee time, then your time and Change; In
   play Start your card and the top three; Awaiting Provisional, Certify
   for an admin; Certified the winner in gold).
9. Signed out, open a guests-can-watch competition: the same bar; Home the
   public face; Scoring read-only; no button on the Summary.
10. Reduce Motion on: a quick cross-fade between the two sets. Dark mode:
    the tray in the club's night tint. 320px wide: "Leaderboard" fits.

### Stage (d4) as built — No return, void, Certify, Results, Reopen, the season (16 Nov 2026; D169–D172)

**Migration 091** (paste **after** the deploy, with no competition card
open). Before it the admins' Results card says certifying is not set up yet,
and every round scores as before.
- `rounds.certified_at`.
- `round_certifications` and `round_no_returns`, both server only.
- `writable_rounds()` less a certified round. 090's `phone_score_rounds()`
  builds on it, so every phone scoring write follows.

**Built:**
- **`/api/card/certify`** (`app/api/card/certify.ts`, owners and admins
  only), drawn as the **Results** card in the competition's Scoring section
  (`CompAdmin.tsx`). It lists each booked player as Signed, To be signed, On
  the course, No card or No return (`playerStates`).
- **No return:** offered only for a player with no card (never started, or
  voided). It can be taken off again until the results are certified.
- **Void:** offered for a card still being scored. It voids the whole card,
  and the confirmation names everyone on it.
- **Certify:** offered once every booked player is signed by both or No
  return (`mayCertifyNow`). It first lists every handicap index changed on
  the competition's Irish day for its players: old and new, when, by whom,
  and where (`irishDay` over the D179 log). Then **Certify the results**:
  - `certified_at` is set and logged;
  - the board becomes **Results** in gold;
  - No returns are listed under it;
  - the round's card summaries are written.
- **Reopen:** clears `certified_at`, logs it and drops the round's summaries.
  Nothing else is touched.
- **The season is fed by certified rounds only.** The summary writer holds a
  competition's uncertified round (`SummaryDeps.held`), and the nightly fill
  never counts one as owed.
- **The lock**, beyond the database:
  - the signing route refuses every change on a certified round;
  - `/admin`'s void and the card check's re-score skip one
    (`certifiedRounds`);
  - finalising a card refuses a player marked No return.
- **Comps and the page:** both read Awaiting sign-off and Certified, and
  count a No return as accounted for.

**Not built:**
- `rounds.casual` and a league's `cardsOff` do not ask about certification.
  A competition is never a league, so neither is offered on one.
- The hub's standing and the export read the scores as they are, and a
  certified round's scores no longer change.

### Stage (d3) as built — signing on the server, the marker, Cards to sign (16 Nov 2026; D176–D178, D185)

**Ross, 16 Nov (D185):** every club event may be viewed by every member on the
club's list; only the players on a competition's tee sheet play it.
- A signed-in member on the list goes through **any** club event's PIN door
  with no PIN. `/enter/<code>` tries it once (`memberDoor`, only on a phone
  holding an account's sign-in); `runDoor`'s `clubMember` checks the
  verified club's list.
- On a competition, `/api/entry` sets the field role **exactly** on every
  entry (`Grant.exact`, the one grant that lowers): a player — their booked
  player — while on a tee time, a spectator otherwise. The club's admins are
  untouched.
- The Scoring section offers the card only to the booked and the admins, and
  the start sheet's index refuses anybody else.
- Playing a non-competition club event is unchanged: it follows that event's
  own settings.

**Migration 090** (paste **after** the deploy). Before it, `/api/card/sign`
answers "not set up yet" and the card stays open with its holes safe.
- `card_signatures`, server only.
- `scores`' phone policies switched to `phone_score_rounds()`: 079's
  `writable_rounds()` less a club competition's rounds.

**Built:**
- **One commit rule.** `lib/cardCommit.ts` (`cardScoreRows`, `nrGross`,
  `effectivePar`, `effectiveSI`) is the phone's commit in `LiveScoringFlow`
  and the server's alike. An event outside a club commits from the phone
  exactly as before.
- **Signing a competition card.** On the card's last screen the scorer picks
  a marker for each card (`MarkerPicker`): the next player round the group
  first, or anybody on the list with an account by name. **Sign the cards**
  then sends it to `/api/card/sign` `finalise`, which:
  - reads `live_scores` back and writes `scores` through the same rule;
  - marks the holes committed;
  - writes a `card_signatures` row for each player not already signed;
  - closes the card.
  - The finalise counts as the player's **approval** when the player
    finalised. It counts as the **marker's** signature when the finaliser
    chose themselves.
  - The player and the marker are never the same account. Every player and
    marker needs an account.
  - In a two-ball Ross scores: Ross's card waits for Dave to mark it, and
    Dave's waits for Dave's own approval. Dave signs both from Cards to sign.
- **Cards to sign** (D177):
  - at the top of the club Home (`toSign` on the club members ask);
  - in the competition's Scoring section (`CompSigning.tsx`), with the card
    hole by hole and **Approve my card**, **Sign as marker** and **Send it
    back**;
  - an owner or admin sees every card still waiting and may sign as marker,
    on anyone's card but their own (D178), but never approves for a player.
- **Send it back**, by the player, the marker or an admin while the card
  still waits on someone:
  - the signature is closed (kept as history);
  - the player's `scores` are deleted and their holes uncommitted;
  - the card is opened again;
  - the next finalise writes that player afresh, leaving anyone already
    signed alone.
  - A card signed by both is changed only by Reopen (d4).
- **The board** says "To be signed" under a card waiting on someone. The
  competition reads Awaiting sign-off (the page and Comps) once every
  booked card is final. A competition card cannot be unfinalised from a
  phone; it is sent back.
- D182's "ties on co-signed cards only" holds at Certify, when every card is
  final. Until then the board is provisional (no gold) and countback runs
  on the cards as they stand.

**Known, not built:**
- Changing a marker after the finalise (`marker` in the route) has no screen
  yet; the picker sets it at the finalise.
- A card sent back is reopened for the whole group on the phone, but its
  already-signed players are not rewritten.

### Stage (d2) as built — the competition in the club area (16 Nov 2026; D162–D184)

**Ross's amendment, 16 Nov (before (d2) was finished):** *every member must
have an account to be allowed to play.* A member who forgets their phone is
scored on another device and co-signed by a selected member — but **every
card is approved by the player on their own account at some stage**, so a
card is finalised only by **the player's approval and a marker's**. This
replaces D165's "a listed member with no account is booked and scored by a
partner" and D178's "a no-account member's card is finalised by whoever
scored it" — both gone. D94's exception now reads: *"…except a club's
members-only competition, where the club's list is the door and every
player needs their own Green Dot account. A member who forgets their phone
is scored on another and approves their card on their own account later."*
Built now: booking refuses a list row with no account linked (the partner
search says so). The approval and the marker are (d3)'s, redrawn below.

**Built:**
- **New competition** on Comps for a verified club's owners and admins
  (`NewCompetition`: name, day, course — the home course first — Stableford
  or strokes and the allowance, members only or guests can watch, the tee
  times and when booking opens; no email when it opens, D175) →
  `/api/club/competition` (`runNewCompetition` on `runCreate`'s own checks,
  `createStore` moved out of the create route to share them): the event
  (`trips.competition = 'club'`, Club admins only, the door's PIN nobody
  holds unless guests may watch), its golf item and its round on the tee
  sheet with its rules — all in one request.
- **The competition page** `/club/[slug]/comp/[code]`: the club's face, the
  phase line, Manage competition (D183), the bar the server draws (D180;
  the rise out of Comps waits for its spec), the three sections always in
  it (D181). Without the door's cookie only `CompDoor` is drawn.
- **Booking** (`CompTeeSheet`, `/api/club/booking`): yourself in one tap,
  partners by a name search, withdraw until the time has gone; a player made
  for a list row when first booked, its index the account's (D179); two
  phones on one time — whoever went over takes theirs back. *Departure:* the
  competition books on a sheet of its own rather than a mode of the event
  tee sheet (1,288 lines) — the event's tee sheet is untouched and still
  there for Manage.
- **The board**: the event's own, from the D91 copy, **no gold until
  Certify** (`placeClass(…, held)`), ties by countback then shared (D182;
  `clubCompetition` on the board is what keeps the tie rule on a totals
  board — no older board changes).
- **Comps** rows wear their phase (Announced, Booking open, In play — who is
  booked and signed is the page's to count; Awaiting sign-off and Certified
  arrive with signing and Certify) and open inside the club; Board opens a
  competition's board there; a guests-can-watch competition is on the
  public face.
- **The event side**: the short link and the event's home go into the club;
  `/enter/<code>` never draws a PIN box; the padlock and in-place prompts say
  "Run by <club>'s admins" (`competitionOf` from `/api/entry`); a
  competition's non-members are **spectators** (D184); the card's back arrow
  returns to the competition; the start sheet confirms each player's index
  (D179); the nightly cleanup leaves a competition's rounds alone.

**Known, not built:** a list carries no gender, so a woman booked from it
starts as `M` (the players table's default) — her tees come from the men's
card until her gender is set. Where gender lives for a club member is a
question for Ross.

**(d3), redrawn for the amendment:** signing on the server
(`/api/card/sign`, the commit rule in `lib/`); a competition card final
only with **the player's approval on their own account and a marker's** —
the player approves whenever they can (on their phone after a round scored
on somebody else's), the marker from the club's list, the two never the
same account; Cards to sign for both; Send it back. Migration 090 as drawn,
`card_signatures` gaining the player's approval beside the marker's.

### Stage (d1) as built — club competitions' groundwork (16 Nov 2026; D161, D163, D164, D179)

**Migration 089** (paste before the deploy): `clubs.home_course_id`,
`club_members.handicap_index`, `players.club_member_id` (unique per event
where set), `trips.competition` with its column grant, and the server-only
`account_handicaps` and `handicap_changes`. Every read fails soft before it.

- **The handicap index (D179)** — `lib/handicapIndex.ts` (rules) and
  `app/api/handicaps/` (the one writer and its log). On **Me** and the club
  area's **Club** tab (`HandicapIndexCard`, `/api/account` `handicap`); on
  the **list** each row shows and an admin changes the one value (a linked
  row's is the account's — changed there, logged as the list's). **Linking**
  by code runs `linkPlan`; a difference is said once on the Clubs page.
  **Taken off a list**, the row keeps a copy. Nothing yet reads the index
  into an event — the start sheet does from (d2).
- **The home course (D161)** — on the list page for a verified club
  (`ClubHomeCourse`: `CourseSelect`, and `ScorecardGate` when the course
  has no card or no ratings), `/api/club` `home-course`, owners and admins.
- **`lib/compPhase.ts`** — the phases, the live sections, the waiting line.
- **"You're in"** reads a player made from your list row (D163) as well as
  `account_players`.
- **The door's member key (D164)** — `runDoor` given the account token
  opens a competition's members-only door for a member on its verified
  club's list (`competitionMember` in the entry store); `/enter/<code>`
  sends a competition to `/club/comp/<code>` before any PIN box, which finds
  the club and goes on to `/club/<slug>/comp/<code>` (stage (d2)). `comp` is
  reserved as a club address.

No competition can be made yet; nothing outside the club area changes. The
privacy notice's Clubs section says where the index lives and that changes
are recorded.

### Stage (h) as built — the club area and the club's events (15 Nov 2026; D144, D153, Q3)

No migration. **Where the club area lives:** it stays at `/club/<slug>`
rather than moving under `/home` — the server draws the club's skin (art,
crest, colour) there before the first paint, which a static `/home` cannot,
so a Club member never sees the personal page or a plain shell first. The
head script already sends a club hint from `/` and `/home` there (D154);
`/home?tab=…` is now the personal page asked for by name and stays, for a
Club member too. *Departure from the plan's "under /home".*

**The club area (D144):** Home gains the code box (`app/components/CodeBox.tsx`,
now shared with `/home`) and **Make an event**; Outside the club lists the
member's events outside the club — in them, or made by them (owned, 085). The
**Club** tab: the club's list and look (owners and admins), **Your events**
(`/home?tab=events` — the whole list, claiming and unlinking), Your account,
Privacy and Terms. The personal page's Me names the club.

**The list moved under Club:** `/club/<slug>/list` (verified clubs; the
server hands it the club's id and colour, the list is asked for after
paint, answered to owners and admins alone). `/account/club?id=` goes on
there for a verified club; a club still waiting to be verified keeps that
address, having no club area. `/account/clubs` (join by code, set one up)
stays, reached from Me.

**"Whose event is this?" (Q3, D153):** asked by `MemberGate`, once, of a
verified club's owner or admin, before any wizard — **the club's** or **just
mine**; anybody else goes straight in. The answer is a context
(`app/dashboard/create/EventClub.tsx`) the four wizards read: on the club's,
the PIN step says what a PIN is for now and the PIN is optional
(`clubPinIssue`). `/api/trip/create` takes `clubId` **beside** the row,
checks the maker runs that verified club (`adminClubs`, the organiser area's
own read), and writes `trip_private.club_id`/`club_access` in the same step
as the membership — no PIN: **Club admins only**, a PIN nobody is given
(`unheldPin`, now in `lib/pinHash.ts`); a PIN typed in: **lent to helpers**
(`pin`). A failure there takes the event back, as a failed membership does.

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

*Order and migration numbers from (d) on are redrawn again under
"D141–D152" above: (e1) the club page with 087, (f) 088, (g) the front page
and personal page, (h) the club area, (d) with 089.*

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

**(d) Club events and booking (D112, D113, D127).** *Superseded twice: the
numbers were redrawn under D141–D152, and the whole stage is replaced by
"Club competitions (D161–D175)" (16 Nov 2026). Kept as the record.* Migration **087** if
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
