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

**What this changes from today.** Today a series is a numbered list with no
dates at all, and "every Wednesday" belongs to continuous, which picks its
playing days inside a period. Under the decision above, a set of dated,
repeating playing days is a series (each Wednesday is its own event), and
continuous loses its day picker. Nothing has been changed yet: see the
winter league's build order.

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

### Questions for Ross

1. **The handicap for an event.** The note ends "change handicap increment
   for individual days where…". Is that (a) a different **allowance** on a
   given day (90% for a foursomes day, say), or (b) a **handicap cut**
   between events, such as the winner playing off two shots less next week?
   They are very different to build.
2. **Who may add the next event and switch things off?** The note says
   players add the event and players disable days, and the card switch is
   behind a PIN. Proposed: adding the next event is something the organiser
   can always do and can let the field do (a new line in the participant
   permissions, off to start with, like the others); switching an event or
   a card off is behind the organiser PIN, asked for in place. Right?
3. **Today's continuous leagues.** Has a real continuous league been made
   on greendot.live? If one has, it must keep working when continuous loses
   its day picker.
4. **"Every N months"**: the same date each month (the 14th) or the same
   weekday (the second Wednesday)? The second is how clubs usually say it.
5. **Golf Ireland's cards**: worth asking them whether a card says which
   competition it was played in. If it does, a card can be matched to the
   league's own competition and the mix-up in the story can't happen at all;
   the card switch stays as the backstop.

### Build order

Each stage tested on greendot.live before the next, as with Green Dot Run.

1. **Dated series events.** The recurring question in the creation wizard,
   and "Add the next event" on the Scoring tab. Probably no database change:
   rounds already carry a date, and the event's dates run from its first
   event to its last. Today's dateless series keep working as they are.
2. **Every event's own leaderboard, and events that do not count.** No
   database change: the existing casual flag is reused, and the event's own
   leaderboard reads it the way the round summary already does.
3. **The gear.** An event's settings, including a player's card that does
   not count. That switch needs somewhere to be stored, so probably the
   first new migration (057, with its grants), and it is confirmed before
   it is written. The day's handicap waits on question 1.
4. **The next event appears the day after the previous one**, and the
   Scoring tab as the league's history.
5. **Golf Ireland cards to events, by date and venue**, with stage 3's switch
   as the way out. Built with Golf Ireland's stage 5, once their
   documentation arrives.
6. **Continuous, redefined.** After question 3 is answered.
