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
2. **Every round's own leaderboard, and rounds that do not count.** No
   database change: the existing casual flag is reused, and the event's own
   leaderboard reads it the way the round summary already does.
3. **The gear.** An event's settings, including a player's card that does
   not count (a toggle, reversible). That switch needs somewhere to be
   stored, so probably the first new migration (057, with its grants), and
   it is confirmed before it is written. The day's overrides of the event's
   defaults sit in a sub-tab; the handicap one waits on the open question.
4. **The next event appears the day after the previous one**, and the
   Scoring tab as the league's history.
5. **Golf Ireland cards to events, by date and venue**, with stage 3's switch
   as the way out. Built with Golf Ireland's stage 5, once their
   documentation arrives.
6. **Continuous, redefined.** After question 3 is answered.
