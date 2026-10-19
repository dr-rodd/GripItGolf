# Sitewide copy review

Every blurb, explanation, label, hint and message a player can read on the
platform, in the order they meet it, with a blank line under each to write the
replacement.

## How to use this

Under every item there are two lines:

- **Now:** what the screen says today. Don't edit this line — it's how Claude
  Code finds the string in the code.
- **New:** blank. Write the replacement here.

**Leave `New:` blank for anything you're happy with.** Only the ones you fill in
get changed. That is the whole instruction Claude Code needs — hand this file
back and say "implement the filled-in lines in `docs/copy-review.md`".

**The refresh's copy pass (October 2026).** Claude Code went through every
item against the copy rules in `docs/refresh-plan.md` §3.6. What that left
on each item:

- **New: …** filled in by the pass is a line a rule decided, and the code
  already says it. The rule is named after it, in italics.
- **New: Ross — …** is a judgement call, left for you: the question is on the
  line. Answer it on the same line.
- **Today:** under an item means the screen had already changed since this
  sheet was written; it is what the screen said when the pass began.
- A blank **New:** still means what it always meant: fine as it is.

Notes:

- `→`, `·`, `—` and `’` in the current text are the real characters used on
  screen. Type whatever you like; the punctuation will be matched to the rest of
  the site.
- Anything in `{curly braces}` is a value filled in at runtime — `{name}`,
  `{count}`. Keep the braces in your replacement or that value disappears.
- **Answer §0 first.** Those are decisions that change many items at once, and
  several of the individual items below stop mattering once §0 is settled.

---

## §0 — Cross-cutting decisions

These are house-style questions rather than single strings. Answering them lets
Claude Code apply one rule everywhere instead of you rewriting forty items by
hand. Write your answer on the `New:` line.

**X-01 · What do we call the person who created the trip?**
The site currently uses five different words for the same person: *organiser*
(join screen), *lead player* (create form), *trip owner* (setup), *whoever
created it* (passcode gate, setup), and *the device this trip was created on*
(permissions).
- Now: mixed — organiser / lead player / trip owner / whoever created it
- New: lead player

**X-02 · What do we call a leaderboard?**
Currently *leaderboard*, *board*, and *competition* are all used for the same
object — "No competitions switched on for this trip" sits on a screen of things
called leaderboards.
- Now: mixed — leaderboard / board / competition
- New: leaderboard

**X-03 · What do we call the settings screen?**
The tab is labelled **Settings**; the create screen calls it **trip settings**;
the matchplay screen calls it **Trip Setup**; the leaderboard calls it **Trip
Setup** too.
- Now: mixed — Settings / trip settings / Trip Setup
- New: Trip setup. Trip Settings can be the gear icon, currently Trip details.

**X-04 · Button capitalisation: sentence case or Title Case?**
Both are in use, sometimes on the same screen. Sentence case: "Create a trip",
"Join a trip", "Add a leaderboard", "Save changes". Title Case: "Join Trip",
"Create Trip", "Copy Code", "Go to Your Trip", "Start Round", "Close Live
Round", "Score Another Player", "Void Live Session", "Clear All Live Data".
- Now: mixed
- New: Sentence if sentence (Create a trip). Title if title (Start Round)

**X-05 · Error voice.**
Three registers are in play: calm ("Could not save — try again"), blunt ("Failed
to commit scores", "Void failed"), and apologetic ("Please try again"). Pick one
shape and every error message will be rewritten to it.
- Now: mixed — Could not… / Failed to… / Please…
- New: calm

**X-06 · The em-dash.**
Almost every explanation on the site is built as `statement — qualifier`. It's a
consistent voice, but it's heavy when three of them stack in one panel. Keep,
thin out, or drop?
- Now: em-dash used in roughly 40 explanatory strings
- New:

**X-07 · "Claim your spot".**
Used as *Claim your spot* (banner), *Claim a spot* (roster link), *claim their
spot* (pending note), and *Tap your name* (the actual screen). Four phrasings
for one action.
- Now: mixed
- New:Claim your spot

**X-08 · British spelling.**
Currently British throughout — *finalise*, *organiser*, *per cent*, *towards*,
*apportioned*, *colour*. Confirm or change.
- Now: British
- New:

**X-09 · Register.**
Most of the site is understated and factual. Two strings are markedly louder
than everything around them: the plus-handicap warning ("Hold on there
Cowboy!") and a scoring format called "Cut the dead weight". Deliberate, or
bring them into line?
- Now: mostly flat, two outliers
- New:

---

## §1 — Landing page (`/`)

**L-01 · Hero line** · `app/Landing.tsx:143`
- Now: Live scoring, leaderboards and matchplay for your golf trip. Tap below to start one, or to join a trip you have a code for.
- Today: Live scoring and leaderboards for your event.
- New: Live scoring, leaderboards and matchplay for your golf trip.

**L-02 · Primary button** · `app/Landing.tsx:155`
- Now: Create a trip
- Today: Create an event (the second button now, under the event code box)
- New:

**L-03 · Secondary button** · `app/Landing.tsx:162`
- Now: Join a trip
- Today: Join event (the event code is typed on the landing page itself)
- New:

**L-04 · Footnote under the buttons** · `app/Landing.tsx:167`
- Now: Your handicap is the best 8 of your last 20 rounds. On the graph, those eight are green dots.
- Today: as New, set as a quotation with the name under it
- New: "Right now that dot is both green and not green. You decide what it becomes" - Erwin Schrödinger
- **Ross:** live as written. The refresh plan (4.8) flags it as long for a
  front door: sixteen words plus the name, under the only two buttons
  that matter. Keep, shorten, or drop?

**L-05 · Site tagline (stored centrally, used for branding)** · `config/site.ts:8`
- Now: Your handicap is the best 8 of your last 20. Go and get a green dot.
- Today: unchanged in `config/site.ts`, but nothing reads `SITE.tagline`
- New: *(gone — no longer on screen)*

**L-06 · Browser tab / search-result description** · `app/layout.tsx:32`
- Now: Live scoring, leaderboards and matchplay for your golf trip.
- Today: Live scoring and leaderboards for your event. Golf trips, tournaments — and more to come.
- New:

**L-07 · Browser tab title** · `app/layout.tsx:30`
- Now: green dot golf.
- Today: green dot.
- New:

**L-08 · Header back-link (screen readers)** · `app/components/TripHeader.tsx:109`
- Now: Back to the start / Back to the trip
- New:

---

## §2 — Joining a trip (`/join`)

**J-01 · Heading** · `app/join/JoinForm.tsx:64`
- Now: Join a Trip
- Today: Join an Event
- New: Join an event *(rule 4)*

**J-02 · Sub-heading** · `app/join/JoinForm.tsx:67`
- Now: Enter the 6-character code from your organiser.
- Today: Enter the 6-character code you were given.
- New:

**J-03 · Button** · `app/join/JoinForm.tsx:94`
- Now: Join Trip
- Today: Join event
- New:

**J-04 · Wrong code** · `app/join/JoinForm.tsx:44`
- Now: Trip not found — check your code and try again
- Today: Event not found — check your code and try again
- New:

---

## §3 — Creating a trip (`/dashboard/create`)

### Step labels

**C-01 · Step counter** · `app/dashboard/create/CreateTripForm.tsx:507`
- Now: Step {n} of 3 — {step name}
- Today: Step {n} of 3 (the step’s name is now the title under it)
- New:

**C-02 · The three step names** · `app/dashboard/create/CreateTripForm.tsx:41`
- Now: Trip details · Itinerary · Players
- Today: Name your trip · Plan the itinerary · Who’s playing (an event: Name your event · Plan the schedule · Who’s playing)
- New:

### Step 1 — Trip details

**C-03 · Trip name label / example** · `CreateTripForm.tsx:518,523`
- Now: Trip name  /  e.g. Irish Links Tour 2027
- Today: Trip name  /  e.g. Portugal 2027 (an event: Event name  /  e.g. Captain’s Prize 2026)
- New:

**C-04 · Email label** · `CreateTripForm.tsx:541`
- Now: Email (optional)
- New:

**C-05 · Why we ask for an email** · `CreateTripForm.tsx:556`
- Now: So we can confirm your trip and keep you updated.
- Today: We’ll send you the trip details and share link. Leave it blank if you would rather not — the trip works either way, and no other player ever sees it.
- New: We’ll email you the trip details and share link. *(rule 1)*

### Step 2 — Itinerary

**C-06 · No courses in the database yet** · `CreateTripForm.tsx:580`
- Now: No platform courses available yet. Add courses with trip_id = NULL to get started.
- Today: The course list could not be loaded — a course can still be added by name from the picker.
- New: *(this one is a developer message shown to a player — it should probably say something a golfer can act on)*

**C-07 · Continue button at the foot of the itinerary** · `app/components/ItineraryBuilder.tsx:245`
- Now: Proceed to Add Players
- Today: Proceed to Add Players
- New: Continue to players *(rule 4; the days before it already say “Continue to day {n}”)*

**C-08 · Empty day** · `ItineraryBuilder.tsx:449`
- Now: This day is empty.
- Today: as New (a multi-day trip; a single day opens on Set venue)
- New: Nothing added yet. Get your golf in!
- **Ross:** conflicts with rule 9 (the “!”), keep yours?

**C-09 · Course picker label** · `ItineraryBuilder.tsx:519`
- Now: Choose a course
- Today: Course (label)  /  Choose a course (the picker it opens)
- New:

**C-10 · Tee time label** · `ItineraryBuilder.tsx:536`
- Now: First tee time
- New:

**C-11 · What extra tee times mean** · `ItineraryBuilder.tsx:560`
- Now: One round is created for this course. More tee times just means more groups going off.
- Today: as New, under a stepper labelled Tee times (1 group, 2 groups…)
- New: How many groups are going out?

**C-12 · Accommodation prompt** · `ItineraryBuilder.tsx:574`
- Now: Where are you staying?
- New:

**C-13 · Rounds locked because scores exist** · `ItineraryBuilder.tsx:390`
- Now: Scores already exist on this trip, so rounds are locked. Stays and journeys can still be added, moved or removed.
- Today: Rounds with scores are locked and stay where they are. New golf, stays, journeys and activities can still be added.
- New: Rounds with scores are locked. Anything new can still be added. *(rule 1)*

**C-14 · Can't continue without golf** · `CreateTripForm.tsx:138`
- Now: Add at least one round of golf — there is nothing to score without it.
- Today: as New (an event too)
- New: Add at least one round of golf — otherwise what's the point?
- **Ross:** conflicts with rule 3 (the aside), keep yours? CT-19 is the league wizard’s twin.

### Step 3 — Players and the settings lock

**C-15 · Players are optional** · `CreateTripForm.tsx:599`
- Now: Optional — players can also join later with the trip code.
- Today: Optional. Players can join later with the trip code. (the step’s one-line intro)
- New:

**C-16 · First player's label** · `CreateTripForm.tsx:606`
- Now: Lead player  /  Player {n}
- Today: Lead player  /  Player {n} (an event: Organiser — you  /  Player {n})
- New:

**C-17 · Name and handicap placeholders** · `CreateTripForm.tsx:626,643`
- Now: Full name  /  Handicap
- Today: Full name  /  Handicap (or leave blank)
- New:

**C-18 · Add-player button** · `CreateTripForm.tsx:671`
- Now: + Add another player
- New:

**C-19 · Lock toggle title** · `CreateTripForm.tsx:681`
- Now: Lock trip settings
- New:

**C-20 · Lock toggle explanation** · `CreateTripForm.tsx:682`
- Now: Ask for a passcode before anyone can change formats, players or teams
- New: Ask for a passcode before anyone changes formats, players or teams. *(rule 1)*

**C-21 · Lock warning headline** · `CreateTripForm.tsx:692`
- Now: This can only be set now.
- New:

**C-22 · Lock warning body** · `CreateTripForm.tsx:695`
- Now: There is no way to add, change or remove your passcode later — otherwise anyone with your trip code could lock you out of your own trip. Write it down.
- Today: as New (every event wizard says PIN)
- New: There is no way to add, change or remove your passcode later — Write it down!
- **Ross:** conflicts with rule 9 (the “!”), keep yours?

**C-23 · Passcode fields** · `CreateTripForm.tsx:707,717`
- Now: Passcode (4–8 digits)  /  Enter it again
- Today: Passcode (4–8 digits)  /  Enter it again (an event: PIN (4–8 digits))
- New:

**C-24 · Passcodes don't match** · `CreateTripForm.tsx:144`
- Now: The two passcodes do not match.
- New:

**C-25 · Create button** · `CreateTripForm.tsx:747`
- Now: Create Trip  /  Creating…
- Today: Create trip  /  Creating… (an event: Create event)
- New:

**C-26 · Note under the create button** · `CreateTripForm.tsx:750`
- Now: Players without a name will be skipped
- New:

### Confirmation screen

**C-27 · Heading** · `CreateTripForm.tsx:411`
- Now: Trip Created!
- Today: Trip Created! (an event: Event Created!)
- New: Trip created  /  Event created *(rules 4, 9)*

**C-28 · What to do next** · `CreateTripForm.tsx:414`
- Now: Share this code with your group to join. Next, choose what you’re playing for in trip settings — leaderboards and teams live there. Finalise the trip when everyone’s ready to play.
- Today: Share this code with your group to join. Next, choose leaderboard formats and teams in Trip Setup.
- New: Share this code with your group to join. Next, choose leaderboard formats and teams in trip settings.

**C-29 · Code label** · `CreateTripForm.tsx:421`
- Now: Your Trip Code
- Today: Your trip code
- New:

**C-30 · Passcode reminder** · `CreateTripForm.tsx:439`
- Now: Settings are locked. Keep your passcode safe — it cannot be recovered or changed.
- Today: as Now (an event: Your organiser PIN is set. Keep it safe — it cannot be recovered or changed.)
- New:

**C-31 · Copy button** · `CreateTripForm.tsx:450`
- Now: Copy Code  /  ✓ Copied
- Today: Copy code  /  ✓ Copied
- New:

**C-32 · Go-to-trip button** · `CreateTripForm.tsx:456`
- Now: Go to Your Trip
- Today: Go to your trip
- New:

### Creation errors

**C-33 · Generic** · `CreateTripForm.tsx:55,58`
- Now: Please try again.  /  {reason} — a database update may not have been applied yet.
- New: Try again.  /  {reason} — a database update may not have been applied yet. *(X-05: never “Please”)*

**C-34 · Passcode couldn't be set** · `CreateTripForm.tsx:212`
- Now: Could not set the passcode on this device. Try again, or create the trip without one.
- Today: as Now; an event read “…or create the event without one”, which it cannot be
- New: As Now for a trip. An event: Could not set the PIN on this device — try again. *(an event cannot exist without its PIN; the league wizard already said this)*

**C-35 · Partial-failure family** · `CreateTripForm.tsx:251,285,326,354,372`
- Now: Could not create the trip. {reason} · Trip created, but the players failed. {reason} · Trip created, but the itinerary failed. {reason} · Trip created, but the rounds failed. {reason} · Trip created, but the handicaps failed. {reason}
- Today: as Now, and the same family on every event wizard (“Event created, but the players failed.”)
- New: Could not create the trip. {reason} · Trip created, but the players could not be saved. {reason} · …the itinerary could not be saved… · …the rounds could not be saved… · …the handicaps could not be saved… *(X-05; the same on every wizard)*

### Added since the first review

**C-36 · About the trip, the line under it** · `CreateTripForm.tsx`
- Now: Shows on the trip hub, under the countdown. It can be changed any time in Trip Settings.
- New: Shown on the trip hub, and editable in Trip Settings. *(rule 1; an event says Event Hub)*

**C-37 · A handicap left blank** · `CreateTripForm.tsx`
- Now: Not sure? Leave it blank — it shows as HCP pending until they set it when they claim their name.
- New: Shows as HCP pending until they set it when claiming their name. *(rules 1, 6: the box already says “or leave blank”)*

**C-38 · Leaderboards (optional), the line under it** · `CreateTripForm.tsx`
- Now: What the trip plays for. Skip for now and choose later in Trip Setup — nothing is decided until you decide it.
- New: Skip for now and choose later in Trip Setup. *(rules 1, 6)*

**C-39 · An empty day, the line under its name** · `ItineraryBuilder.tsx`
- Now: Nothing yet — add golf, a stay, a journey or an activity below.
- New: Add golf, a stay, a journey or an activity below. *(rule 6: the box under it says nothing is added yet)*

**C-40 · A single day, the line under its name** · `ItineraryBuilder.tsx`
- Now: Golf is the main event — set the venue, then build the day around it.  /  Press and hold a tile to move it. Times can overlap the golf — dinner booked while the last groups are out is a normal day.
- New: Set the venue, then build the day around it.  /  Press and hold to move a tile. Times can overlap the golf. *(rule 1)*

**C-41 · A stay of several nights** · `ItineraryBuilder.tsx`
- Now: Added to each of the next {n} days, so every night has somewhere to sleep on it.
- New: Added to each of the next {n} days. *(rule 1)*

**C-42 · Adding an activity, the line under the times** · `ItineraryBuilder.tsx`
- Now: Dinner, a boat trip, anything that is not golf. Times are optional — no start means not booked yet, and no end reads as an hour on the day plan.
- New: Times are optional. Without an end, it fills an hour. *(rule 1)*

**C-43 · A course just added** · `app/components/CourseSelect.tsx`
- Now: One thing left: the scorecard. A course is not verified until a photo of its printed card has been read — that is where the pars and stroke indices come from. Photograph one now, upload a picture saved from the club's website, or wait until the day of play: the scoring screen asks for the card before anyone tees off.
- New: One thing left: the scorecard. Photograph it now or on the day. *(rule 1; the card check below it says why)*

**C-44 · Add a course: county** · `CourseSelect.tsx`
- Now: The course files under its county on the list — it is how the next group finds it.
- New: Courses are listed by county, so the next group can find it. *(rule 1)*

**C-45 · Add a course: reading the website** · `CourseSelect.tsx`
- Now: Read {n} tees from the site — check every figure against the printed card or your golf association app before saving.  /  Found the course, but no ratings on the site — they will be in your golf association app.
- New: Read {n} tees from the site. Check them against the card before saving.  /  No ratings on the site. Try your golf association app. *(rule 1)*

**C-46 · Add a course: tees** · `CourseSelect.tsx`
- Now: Both are printed on the scorecard, and your golf association's app (Golf Ireland, England Golf, the USGA GHIN app…) lists them under the course's tees. Optional now — a scorecard photo can supply them later — but handicaps need them before play.
- New: Your golf association app lists them. Optional now, needed before play. *(rule 1; most Irish cards print SSS, not rating and slope)*

**C-47 · Add a course: the last step** · `CourseSelect.tsx`
- Now: The last step is a scorecard: pars and stroke indices only ever come from the printed card, so the course stays unverified until a photo of one has been read. You can do that right after saving — or wait until the day, when the scoring screen asks for it.
- New: A scorecard photo comes next. Until then the course is unverified. *(rules 1, 6: the next screen says when)*

**C-48 · Too many rounds, on the event door** · `lib/tripLimits.ts`
- Now: A trip can have at most 6 rounds. Reduce it to continue.
- New: An event can have at most 6 rounds. Reduce it to continue. *(naming: an event, never a trip; a trip unchanged)*

---

## §3b — Creating a tournament or a run challenge (`/create`, `/golf`, `/dashboard/create?type=…`)

Added in the Phase 5 copy pass: screens the first review predates. A **New**
with a rule beside it is what the screen now says; **Ross** items are unchanged.

### The doors

**CT-01 · Golf card** · `app/create/page.tsx`
- Now: A trip away with your group, or a tournament — live scoring and leaderboards.
- New: A trip away with your group, or a tournament. *(rules 1, 6)*

**CT-02 · Running card** · `app/create/page.tsx`
- Now: A team running challenge over weeks or months — runs earn points, teams climb the leaderboard.
- New: Runs earn points for your team over weeks or months. *(rule 1)*

**CT-03 · Golf doorway question** · `app/golf/page.tsx`
- Now: What are you running?
- New: **Ross** — with Running a sport of its own, “running” here reads as a pun. “What are you organising?”

**CT-04 · Golf trip card** · `app/golf/page.tsx`
- Now: A few days away with your group — itinerary, live scoring and leaderboards.
- New: A few days away with your group, itinerary included. *(rules 1, 6)*

**CT-05 · Golf tournament card** · `app/golf/page.tsx`
- Now: A standalone day or a multi-day event, run by an organiser — who may or may not be playing.
- New: An event run by an organiser, who may or may not play. *(rule 1; the shape is the next question)*

**CT-06 · The shape of the event** · `app/dashboard/create/CreateFlow.tsx`
- Now: Standalone: A single point in time — one day, or a run of days together. · Continuous: An ongoing event over a period, like a summer — a knockout paced by deadlines, or a league on picked days. · Series: A run of events with no dates fixed — days need not be in a row, and more can be added as you go.
- New: One day, or a run of days together. · An ongoing event over a period, like a summer. · A run of events with no fixed dates, added to as you go. *(rules 1, 6)*

**CT-07 · The format** · `CreateFlow.tsx`
- Now: League: A day, or a run of days, on a leaderboard — live scoring from the first tee.  /  (continuous) A leaderboard over the period — playing days picked by hand, or every week on the same day. · Match play: A knockout bracket — win and go through. Create the event here, then set the bracket up from your Event Hub.  /  (continuous) An ongoing knockout — rounds shaped by the field, paced by deadlines, with a qualifying event if you want one.
- New: Everyone on a leaderboard, live from the first tee.  /  A leaderboard over the period, on picked days or weekly. · A knockout bracket, set up from your Event Hub afterwards.  /  An ongoing knockout, paced by deadlines, with an optional qualifier. *(rule 1)*

### Every event wizard

**CT-08 · Confirmation headings** · `CreateLeagueForm.tsx`, `CreateKnockoutForm.tsx`, `CreateRunForm.tsx`
- Now: League Created!  /  Event Created!  /  Challenge Created!
- New: League created  /  Event created  /  Challenge created *(rules 4, 9; as C-27)*

**CT-09 · Email hint** · league, knockout, run
- Now: We'll send you the event details and share link. The event works either way, and no player ever sees it.  /  (run) We'll send you the challenge details, the share link and your admin link. The challenge works either way, and no participant ever sees it.
- New: We’ll email you the event details and share link.  /  We’ll email you the challenge details, share link and admin link. *(rule 1, as C-05)*

**CT-10 · How collaborative, the line under it** · trip wizard (event door), league, knockout, run
- Now: What the field can do for themselves. Everything starts off — you can change any of these later from the organiser area.  /  (run) What participants can do for themselves. You can change any of these later from the organiser area.
- New: What the field can do for itself. Editable in the organiser area.  /  What participants can do for themselves. Editable in the organiser area. *(rules 1, 6: the toggles show where they start)*

**CT-11 · Organiser PIN card** · trip wizard (event door), league, knockout, run
- Now: Your key to the organiser side of the Event Hub — notices, tee times and event settings ask for it. (league: notices, starts and event settings; knockout: the bracket setup, notices and event settings)  /  (run) Your key to the organiser area — teams, permissions and the points rules ask for it. Share it with anyone you want helping you run the challenge.
- New: Unlocks notices, tee times and settings in the organiser area. (league: notices, starts and settings; knockout: the bracket, notices and settings)  /  Unlocks teams, permissions and points rules. Share it with your helpers. *(rule 1)*

### Match play, a standalone event (the trip wizard's event door)

**CT-12 · Event length** · `CreateTripForm.tsx`
- Now: Standalone  /  Multi-day
- New: Single day  /  Multi-day *(“Standalone” was the answer on the screen before and covers both; the league wizard says Single day)*

**CT-13 · Leaderboards (optional), the line under it** · `CreateTripForm.tsx`
- Now: What the event plays for. Skip for now and choose later from the organiser area — the bracket has its own setup there too.
- New: Skip for now and choose later in the organiser area. *(rules 1, 6: the format card and the confirmation both point at the bracket)*

### League

**CT-14 · Event length, the line under it** · `CreateLeagueForm.tsx`
- Now: One day, one venue, one leaderboard — or a run of days, each with its own.  /  Say which of the days are played, give each one a venue next, and choose how they relate on the leaderboard.
- New: One day at one venue, or a run of days.  /  Pick the playing days here, then a venue for each. *(rule 1)*

**CT-15 · A run too long, playing days, weekly** · `CreateLeagueForm.tsx`
- Now: That is a long run for one event — an event spread over a period like that is a continuous one, with its playing days picked inside it.  ·  Turn off any day nobody tees off — a travel day, a rest day. The event still runs from the first date to the last.  ·  The same day every week — every Wednesday for the summer, or some such.
- New: Too long for one run. A period like this is a continuous event.  ·  Turn off travel or rest days. The dates stay as they are.  ·  The same day every week, like every Wednesday. *(rule 1)*

**CT-16 · A series has no dates** · `CreateLeagueForm.tsx`
- Now: You'll pick the events and their venues next — they need not be in a row, and more can be added as the season goes.
- New: You’ll pick the events and venues next, and can add more later. *(rule 1)*

**CT-17 · Who's playing** · `CreateLeagueForm.tsx`
- Now: (require approval) A joined player waits for your nod before they're confirmed in the field.  ·  Add anyone now if you like — everyone else joins with the event code.  /  Add the field — anyone missed can still join later with the event code.
- New: New players wait for your nod before they’re in the field.  ·  Add anyone now. Everyone else joins with the event code.  /  Add the field. Anyone missed can join later with the event code. *(rule 1)*

**CT-18 · Leaderboards, the line under it** · `CreateLeagueForm.tsx`
- Now: What the event plays for. Every league starts on individual Stableford, added up — change it, or add more formats.
- New: Starts on individual Stableford, added up. Change it or add more. *(rules 1, 6)*

**CT-19 · No leaderboard chosen** · `CreateLeagueForm.tsx`
- Now: An event needs at least one leaderboard — otherwise what's being played for?
- New: **Ross** — the same voice as C-14 (rule 3). If C-14 is trimmed, this becomes “An event needs at least one leaderboard.”

**CT-20 · How the days relate on the leaderboard** · `lib/leagueSetup.ts` (also the organiser's Days screen)
- Now: Each day is its own competition — its own leaderboard, no connection between them.  ·  Every day's results feed a single leaderboard for the whole event.  ·  Each day keeps its own leaderboard, and the days also roll up into one overall board.
- New: Each day has its own leaderboard, with no overall.  ·  *(unchanged)*  ·  Each day has its own leaderboard, plus one overall. *(rule 1; X-02)*

### Continuous knockout

**CT-21 · Confirmation, what next** · `CreateKnockoutForm.tsx`
- Now: Share this code with the field. Next, set the bracket up in the organiser area on your Event Hub — mode, field size, qualifying and round deadlines.
- New: Share this code with the field. Next, set up the bracket in the organiser area on your Event Hub. *(rules 1, 6: the bracket screen asks each one)*

**CT-22 · The period, the line under it** · `CreateKnockoutForm.tsx`
- Now: The event runs across this whole period — matches happen when players make them happen, paced by round deadlines you'll set in the bracket setup.
- New: Players arrange their own matches, paced by round deadlines you set later. *(rule 1)*

**CT-23 · Who's playing, the line above the cards** · `CreateKnockoutForm.tsx`
- Now: Optional — how players get in is a bracket setup question, and anyone can join later with the event code.
- New: Optional. Players can also join later with the event code. *(rule 1, as C-15)*

### Run challenge

**CT-24 · Confirmation, what next** · `CreateRunForm.tsx`
- Now: Share this code with everyone taking part — they join with it and pick their team. Run logging and the leaderboard arrive in the next update.
- New: Share this code with everyone taking part. They join with it and pick a team. *(no longer true: run logging and the leaderboard are built)*

---

## §3b — Creating a tournament or a run challenge

Added in the refresh's copy pass (`docs/refresh-plan.md`, Phase 5): screens
built after this sheet was written. Same shape — **Now** is what the screen
said before the pass, **New** what it says after.

---

## §4 — Trip hub (`/trip/{code}`)

**H-01 · Bad code** · `app/trip/[tripCode]/page.tsx:59,60`
- Now: Trip not found  /  Check the code and try again.
- New:

**H-02 · "That's not me" link on the status card** · `StatusBlock.tsx:110`
- Now: Not you?
- New:

**H-03 · Up-next label** · `StatusBlock.tsx:171`
- Now: Up next
- New:

**H-04 · Countdown prefix** · `StatusBlock.tsx:184`
- Now: in {2 hr 30 min}
- New:

**H-05 · How groups and tee time are described** · `lib/upNext.ts:220`
- Now: {3} {groups} from {08:40}
- New:

**H-06 · Trip finished** · `StatusBlock.tsx:199,200`
- Now: That’s the trip  /  Every round is in. The leaderboard is final.
- New:

**H-07 · Standing label** · `StatusBlock.tsx:139`
- Now: Standing
- New:

**H-08 · Next matchplay tie** · `lib/nextMatch.ts:83–87`
- Now: Bye into the {semi-final} · {Semi-final} · opponent to be decided · Plays {Ross} · {Semi-final}
- New:

**H-09 · Unclaimed device banner (the loudest thing on the hub)** · `StatusBlock.tsx:224`
- Now: Claim your spot
- New:

**H-10 · Section headings** · `page.tsx:371,376,381`
- Now: Itinerary · Travel & accommodation · Players
- New:

**H-11 · Players section counter** · `page.tsx:382`
- Now: {4} of {8} in
- New:

**H-12 · Empty itinerary** · `page.tsx:288`
- Now: Nothing on the itinerary yet.
- New:

**H-13 · No travel or stays** · `TravelStays.tsx:71`
- Now: No travel or accommodation on the itinerary yet. Add it in trip settings and it shows up here.
- New: No travel or accommodation on the itinerary yet. Go to trip settings to add your plans.

**H-14 · Nobody joined** · `page.tsx:424`
- Now: Nobody has joined this trip yet.
- New:

**H-15 · Roster legend and row states** · `page.tsx:436,441,461`
- Now: Confirmed  /  Pending
- New:

**H-16 · Still-to-join note** · `page.tsx:476–478`
- Now: {One player has / 3 players have} still to join. Share the code {GX7K2P} and they can claim their spot.
- New:

**H-17 · Link to the join list** · `page.tsx:491`
- Now: Claim a spot
- New:

**H-18 · Back link at the foot of the hub** · `page.tsx:397`
- Now: All trips
- New:

**H-19 · Tab bar labels** · `app/components/TabBar.tsx:25–28`
- Now: Home · Leaderboard · Scoring · Settings
- New:

**H-20 · Matchplay draw couldn't be read** · `page.tsx:207`
- Now: Could not read the matchplay draw.
- New:

---

## §5 — Claiming a place (`/trip/{code}/players`)

**P-01 · Heading** · `app/trip/[tripCode]/players/page.tsx:84`
- Now: Who are you?
- New: Join the trip!

**P-02 · Instruction** · `PlayersClient.tsx:189`
- Now: Tap your name
- New:

**P-03 · Unclaimed row caption** · `PlayersClient.tsx:212`
- Now: Not yet confirmed
- New:

**P-04 · Handicap on a row** · `PlayersClient.tsx:213`
- Now: · HCP {14.2}
- New:

**P-05 · Add-yourself link** · `PlayersClient.tsx:227`
- Now: Not on the list? Add yourself
- New: Can't find your name? Add yourself below

**P-06 · Handicap placeholder** · `PlayersClient.tsx:242`
- Now: Handicap (e.g. 14.2)
- New:

**P-07 · Claim failed** · `PlayersClient.tsx:89`
- Now: Could not claim player — try again
- New:

**P-08 · Invalid entry** · `PlayersClient.tsx:124`
- Now: Please enter a valid name and handicap
- New:

**P-09 · Name already taken** · `PlayersClient.tsx:132,158` + `lib/roster.ts:115`
- Now: {Ross Grady} is already on this trip. Use a different name. If that is you, tap your name above.
- New:

**P-10 · Joined but handicaps didn't save** · `PlayersClient.tsx:175,176`
- Now: Added you to the trip, but your round handicaps did not save.  /  Open trip settings and re-enter your handicap before you play.
- New:

**P-11 · Couldn't load the list** · `players/page.tsx:87`
- Now: Could not load players — please refresh the page.
- New:

**P-12 · Plus-handicap warning (also used on create + setup)** · `lib/handicap.ts:103–105`
- Now: Hold on there Cowboy! Did you mean to select (+) Handicap. This indicates handicaps better than scratch (0)
- New: *(see X-09 — this is the loudest sentence on the site)*

**P-13 · Plus-handicap toggle (screen readers)** · `app/components/HandicapField.tsx:83,84`
- Now: Better than scratch  /  Plus handicap
- New:

---

## §5b — The hub's other screens (share, preferences, notices)

Added in the refresh's copy pass (`docs/refresh-plan.md`, Phase 5): screens
built after this sheet was written. Same shape — **Now** is what the screen
said before the pass, **New** what it says after.

---

## §6 — Trip settings (`/trip/{code}/setup`)

### Trip details drawer

**S-01 · Drawer button title** · `TripSetupClient.tsx:482,502`
- Now: Trip details
- New:

**S-02 · Drawer button subtitle** · `TripSetupClient.tsx:484`
- Now: Name, dates, itinerary, who can edit — everything below is the golf
- New: The non-golf trip details — Golf related settings are below

**S-03 · Itinerary row subtitle** · `TripSetupClient.tsx:550`
- Now: Courses, tee times, stays and journeys
- New:

**S-04 · Dates locked because the trip is live** · `TripSetupClient.tsx:533`
- Now: The trip is live. Unlock it below to change these.
- New: delete this line

**S-05 · Itinerary editor close button** · `setup/ItineraryEditor.tsx:90`
- Now: Close without saving
- New:

### Who can edit

**S-06 · Label** · `TripSetupClient.tsx:563`
- Now: Who can edit
- New:

**S-07 · Explanation** · `TripSetupClient.tsx:565,566`
- Now: Who can change this trip’s players, teams, format and dates. Joining and scoring are open to everyone either way.
- New: Who can change this trip’s players, teams, format and dates.

**S-08 · The two options** · `TripSetupClient.tsx:570,571`
- Now: Any player  /  Owner only
- New:

**S-09 · Owner-only, read on the owner's own phone** · `TripSetupClient.tsx:604`
- Now: Only the device this trip was created on can change it — this one. Nothing changes for you; it is everybody else who can now read this screen but not touch it.
- New:

**S-10 · Owner-only, read on anyone else's phone** · `TripSetupClient.tsx:605`
- Now: Only the device this trip was created on can change it.
- New:

**S-11 · Open to all, read on the owner's phone** · `TripSetupClient.tsx:608`
- Now: Anyone who opens this screen can change the trip. This is the device it was created on, so "Owner only" would leave it to you.
- New:

**S-12 · Open to all, read on anyone else's phone** · `TripSetupClient.tsx:609`
- Now: Anyone who opens this screen can change the trip. "Owner only" is set from the device the trip was created on, which is not this one.
- New:

**S-13 · Read-only notice** · `TripSetupClient.tsx:636`
- Now: Only the trip owner can edit this trip. Ask whoever created it to make changes.
- New:

### Leaderboards section

**S-14 · Section heading** · `TripSetupClient.tsx:649`
- Now: Leaderboards
- New:

**S-15 · Section blurb** · `TripSetupClient.tsx:651`
- Now: Safe to change mid-trip. Every card already entered is re-read under the new rules.
- New: Choose your Competition Leaderboards. Add as many formats as you like.

**S-16 · Board needs teams** · `TripSetupClient.tsx:664,665`
- Now: A pairs draw needs pairings — pick them below.  /  A team board needs teams — pick them below.
- New: This leaderboard needs pairings! Pick them below  /  A team leaderboard needs teams! — pick them below.

### Teams section

**S-17 · Section blurb** · `TripSetupClient.tsx:687`
- Now: Which {teams} play for which leaderboard.
- New: Pick your teams! You can pick different teams for different boards.

**S-18 · A board with no teams yet** · `TripSetupClient.tsx:713`
- Now: No {teams} yet
- New:

**S-19 · Pick/change button** · `TripSetupClient.tsx:743,744`
- Now: Change {teams}  /  Pick {teams}
- New:

### Players section

**S-20 · Empty roster** · `TripSetupClient.tsx:932`
- Now: No players yet — add them below or share the trip code
- New:

**S-21 · Add-player placeholder** · `TripSetupClient.tsx:943`
- Now: Player name
- New:

**S-22 · Finish editing a player** · `TripSetupClient.tsx:882`
- Now: Done
- New:

**S-23 · Save errors** · `TripSetupClient.tsx:258,296,325,359,369,406`
- Now: Could not save — try again · Enter a name and handicap first · Could not add player · Could not save player · Handicap saved but round handicaps failed to update · Could not remove player
- New:

### Things blocking the trip

**S-24 · Nothing to play for** · `lib/teamSets.ts:131`
- Now: Choose what this trip is playing for first.
- New: First you need to create a leaderboard.

**S-25 · Draw needs pairings** · `lib/teamSets.ts:137`
- Now: Your draw is between pairings — pick them first.
- New: Pick your pairings to see the leaderboard!

**S-26 · Board needs teams** · `lib/teamSets.ts:140,141`
- Now: The teams for {board name} have not been picked yet.  /  A team leaderboard needs teams — pick them first.
- New: The teams for {board name} have not been picked yet.  /  A team leaderboard needs teams! Pick them in trip settings.

**S-27 · Legacy setup blockers (older trips only)** · `lib/tripSetupFlow.ts:25–33`
- Now: A trip needs someone competing — pick teams or individuals · Switch on a league or a matchplay draw · A league needs a board — pick one, or switch the league off above · Keep at least one competition switched on
- New:

### Passcode gate

**S-28 · Heading** · `setup/PasscodeGate.tsx:66`
- Now: Settings are locked
- New:

**S-29 · Explanation** · `setup/PasscodeGate.tsx:69`
- Now: {Trip name} was set up with a passcode. Ask whoever created the trip.
- New: {Trip name} was set up with a passcode. Ask whoever created the trip!

**S-30 · Field and button** · `setup/PasscodeGate.tsx:79,92`
- Now: Passcode  /  Unlock  /  Checking…
- New:

**S-31 · Wrong passcode** · `setup/PasscodeGate.tsx:46`
- Now: That passcode is not right.
- New: Incorrect code.

---

## §7 — Choosing what the trip plays for (leaderboard builder)

This is the longest run of explanatory copy on the site. It sits inside trip
settings and is also what a new trip meets first.

**B-01 · Builder heading, first board** · `LeaderboardSetup.tsx:315`
- Now: First, your primary leaderboard
- New:

**B-02 · Builder heading, extra board** · `LeaderboardSetup.tsx:315`
- Now: A second leaderboard
- New: Add another board

**B-03 · Builder heading, editing** · `LeaderboardSetup.tsx:314`
- Now: Change this leaderboard
- New:

**B-04 · Blurb, first board** · `LeaderboardSetup.tsx:321`
- Now: What this trip is playing for. Everything else follows from it.
- New: This is your trip's main leaderboard for the trip. You can add secondary leaderboards as well later.

**B-05 · Blurb, extra board** · `LeaderboardSetup.tsx:322`
- Now: Scored from the same cards, running alongside the first.
- New: Scored from the same cards, it will run alongside your primary board.

**B-06 · Blurb, editing** · `LeaderboardSetup.tsx:319`
- Now: Every card already entered is re-read under the new rules. Nobody re-enters a score.
- New: Edited leaderboards will re-populate with the already entered scores.

### Question 1 — who is ranked

**B-07 · Question** · `LeaderboardSetup.tsx:326`
- Now: Who is being ranked?
- New: Is this a solo or team leaderboard?

**B-08 · Individuals** · `LeaderboardSetup.tsx:328`
- Now: Individuals — Every player ranked on their own card.
- New: Solo - Every player ranked on their own card.

**B-09 · Teams** · `LeaderboardSetup.tsx:329`
- Now: Teams — Players grouped, and the teams ranked against each other.
- New: Teams - Add players to teams, and the teams are ranked against each other

### Question 2 — what they're playing

**B-10 · Question** · `LeaderboardSetup.tsx:345`
- Now: What are they playing?
- New: Pick the format.

**B-11 · League** · `LeaderboardSetup.tsx:349`
- Now: League — Every round counts towards a running table.
- New: League — Everyone ranked on a running table.

**B-12 · Matchplay** · `LeaderboardSetup.tsx:357`
- Now: Matchplay — A knockout draw, generated at random.
- New: Matchplay — A knockout bracket.

**B-13 · Matchplay already taken** · `LeaderboardSetup.tsx:356`
- Now: This trip already has a draw — only one is possible.
- New: Only one matchplay bracket can be created at a time.

**B-14 · Matchplay footnote** · `LeaderboardSetup.tsx:468–471`
- Now: The draw is generated at random once the players are in. A manual draw can come later. Pairings are teams of two, named by their players.
- New: The draw will be generated at random.

### Question 3 — how a round is scored

**B-15 · Question** · `LeaderboardSetup.tsx:368`
- Now: How is a round scored?
- New: How should the rounds be scored?

**B-16 · Stableford** · `lib/leaderboards.ts:89,90`
- Now: Stableford — Points per hole against your handicap. Highest wins.
- New: Stableford Points - Man's greatest achievement

**B-17 · Strokes** · `lib/leaderboards.ts:91,92`
- Now: Strokes — Nett strokes. Lowest wins.
- New: Strokes - Simple as. 

### Question 4 — how a team combines (team boards only)

**B-18 · Question** · `LeaderboardSetup.tsx:383`
- Now: How do a team's players combine?
- New:

**B-19 · Better ball** · `lib/leaderboards.ts:96,97`
- Now: Better ball — A composite card: the team's best score on every hole.
- New:

**B-20 · Best card** · `lib/leaderboards.ts:98,99`
- Now: The best single card in the team that day carries it.
- New:

**B-21 · Cut the dead weight** · `lib/leaderboards.ts:100,101`
- Now: Cut the dead weight — Everyone counts except the worst card of the day. They are back in next round.
- New: Cut the dead weight — Everyone counts except the worst card of the day.

**B-22 · Aggregate** · `lib/leaderboards.ts:113,114`
- Now: Aggregate — Every score in the team counts.
- New: 

### Question 5 — how the rounds add up

**B-23 · Question** · `LeaderboardSetup.tsx:398`
- Now: How do the rounds add up?
- New:

**B-24 · Total** · `lib/leaderboards.ts:118,119`
- Now: Add every round up — One running total across the trip.
- New:

**B-25 · Points by position** · `lib/leaderboards.ts:120,121`
- Now: Points by position each round — You decide what winning a round is worth.
- New: 

### The prize table

**B-26 · Table heading and reset** · `LeaderboardSetup.tsx:126,132`
- Now: What each position is worth  /  Reset
- New:

**B-27 · Explanation, field known** · `LeaderboardSetup.tsx:154`
- Now: One row per finisher, for the {8} {players} on this trip. Leave it as it stands and it keeps up as more join; change a figure and it stays changed.
- New: No explanation needed

**B-28 · Explanation, field not known** · `LeaderboardSetup.tsx:155`
- Now: The {teams} are not picked yet, so this is a placeholder — leave it and the table sizes itself to them. Change a figure and it stays changed.
- New:

**B-29 · Points-table validation** · `lib/customPoints.ts:68,69,71`
- Now: Points must be numbers. · Points cannot be negative. · The most any position can be worth is {999}.
- New:

### Discard

**B-30 · Question** · `LeaderboardSetup.tsx:429`
- Now: Drop anyone's worst round?
- New:

**B-31 · Options** · `LeaderboardSetup.tsx:442`
- Now: Keep all  /  Drop {1}
- New:

**B-32 · Blurb** · `LeaderboardSetup.tsx:446`
- Now: A bad day stops defining the week.
- New:

### Handicap allowance

**B-33 · Question** · `LeaderboardSetup.tsx:454`
- Now: Cut everyone's handicap for this board?
- New: Do you want to apply a handicap reduction?

**B-34 · Options** · `LeaderboardSetup.tsx:204,215`
- Now: Off  /  {85}%  /  Something else
- New:

**B-35 · No allowance available for this format** · `LeaderboardSetup.tsx:250`
- Now: This board is played off the full course handicap.
- New:

**B-36 · Recommendation** · `LeaderboardSetup.tsx:252,253`
- Now: {85}% is the standard allowance for this kind of competition.
- New:

**B-37 · When left off** · `LeaderboardSetup.tsx:255`
- Now: Leave it off and everyone plays off the full figure.
- New:

**B-38 · When set** · `LeaderboardSetup.tsx:256`
- Now: Everyone's course handicap is cut to {85}% of it, rounded to the nearest shot. Gross scores are unaffected, and every other leaderboard keeps its own allowance.
- New:

**B-39 · How an allowance is written elsewhere** · `lib/handicapAllowance.ts:98,99`
- Now: Full course handicap  /  {85}% of course handicap
- New:

### Finishing the builder

**B-40 · Outstanding questions** · `LeaderboardSetup.tsx:477` + `lib/leaderboards.ts:258–272`
- Now: Still to answer: Who is being ranked · League or matchplay · How a round is scored · How a team's players combine · How the rounds add up · What each position is worth
- New:

**B-41 · Duplicate board** · `LeaderboardSetup.tsx:481`
- Now: This trip already runs that leaderboard. Change an answer — two boards scored the same way would print the same table twice.
- New:

**B-42 · Already-in-use badge** · `LeaderboardSetup.tsx:75`
- Now: In use
- New:

**B-43 · Primary badge** · `LeaderboardSetup.tsx:591`
- Now: Primary
- New:

**B-44 · Save buttons** · `LeaderboardSetup.tsx:510–512`
- Now: Save changes · Create leaderboard · Add leaderboard
- New:

### Adding a second board

**B-45 · Card title** · `LeaderboardSetup.tsx:642`
- Now: Create a secondary leaderboard
- New:

**B-46 · Blurb before the primary exists** · `LeaderboardSetup.tsx:645`
- Now: Once your primary leaderboard is set, you can add more.
- New:

**B-47 · Blurb once it does** · `LeaderboardSetup.tsx:646`
- Now: A trip can run several events in parallel off the same cards — an order of merit alongside a daily prize, or a knockout between different teams beside a league.
- New:

**B-48 · Button** · `LeaderboardSetup.tsx:658`
- Now: Add a leaderboard
- New:

### How a saved board describes itself

**B-49 · Board titles** · `lib/leaderboards.ts:326–334`
- Now: Matchplay · Pairs matchplay · Stableford · Team better ball · {…} prizes
- New:

**B-50 · Matchplay rules line** · `lib/leaderboards.ts:341,342`
- Now: Knockout between pairings, drawn at random  /  Knockout between players, drawn at random
- New:

**B-51 · Discard and allowance in a rules line** · `lib/leaderboards.ts:352,357`
- Now: Worst round dropped. / Worst {2} rounds dropped.  ·  Played off {85% of course handicap}.
- New:

---

## §8 — Teams (`/trip/{code}/teams`)

**T-01 · No team board exists** · `TripTeamsClient.tsx:657,660`
- Now: No leaderboard on this trip is played by teams yet.  /  Add a team leaderboard in settings, then come back and pick who plays with whom.
- New:

**T-02 · Pick boards first** · `TripTeamsClient.tsx:675`
- Now: Pick the leaderboards these teams should play for, then choose the teams. Tick more than one to have them share the same teams.
- New: Pick the leaderboards, then choose the teams.

**T-03 · Boards already set** · `TripTeamsClient.tsx:677`
- Now: Tap a leaderboard to see and edit teams.
- New:

**T-04 · Continue button** · `TripTeamsClient.tsx:699`
- Now: Choose {teams} for {2} leaderboards
- New:

**T-05 · Back link** · `TripTeamsClient.tsx:728`
- Now: ‹ All leaderboards
- New:

**T-06 · Picker blurb** · `TripTeamsClient.tsx:734`
- Now: Every change saves as you make it. Confirm when you are happy and the leaderboard updates.
- New: Press confirm when you're done.

**T-07 · Everyone placed** · `TripTeamsClient.tsx:222`
- Now: Everyone has a team
- New: Everyone's in

**T-08 · Share these teams with another board** · `TripTeamsClient.tsx:751`
- Now: Play these {teams} for another leaderboard too?
- New:

**T-09 · Pairs size banner** · `lib/teamLimits.ts:41`
- Now: Max 2 per pairing — a pairs draw is played between teams of two.
- New:

**T-10 · Pairs draw not ready** · `lib/teamLimits.ts:115,124,128,132`
- Now: Pick the pairings before drawing the bracket. · {A, B} have more than 2 players. A pairing is two. · {A} is short of a player. · {3} players still have no pairing.
- New: Pick the pairings before drawing the bracket. · {A, B} have more than 2 players. · {A} is short of a player. · {3} players still have no pairing.

**T-11 · Save failed** · `lib/writeFailure.ts:6`
- Now: Could not add teams
- New:

---

## §9 — Matchplay

### The panel in settings

**M-01 · Panel heading** · `setup/MatchplayPanel.tsx:101`
- Now: Matchplay  /  Pairs Matchplay
- New:

**M-02 · What the draw does** · `setup/MatchplayPanel.tsx:111–113`
- Now: A knockout draw between {players}. Top seeds are kept apart, and byes are handed out when the count isn’t a power of two.
- New: A knockout draw between {players}. Top seeds are kept apart, byes may be needed if players don't match up equally.

**M-03 · Bracket exists badge** · `setup/MatchplayPanel.tsx:107`
- Now: Bracket drawn
- New:

**M-04 · Bracket summary** · `setup/MatchplayPanel.tsx:120–131`
- Now: {7} matches across {3} rounds · {1} bye · {4} results recorded / No results recorded yet
- New:

**M-05 · Preview before drawing** · `setup/MatchplayPanel.tsx:137–141`
- Now: {8} players — this would draw a bracket of {8} with {0} byes, {Quarter-final → Semi-final → Final}.
- New:

**M-06 · Reshuffle warning, results exist** · `setup/MatchplayPanel.tsx:156,157,161`
- Now: This will erase {4} results already recorded for this bracket.  /  A new draw is generated from scratch. Those match outcomes cannot be recovered. Hole scores and the other leaderboards are untouched.
- New: This will erase {4} results already recorded for this bracket.  /  A new draw will be generated from scratch. Match outcomes cannot be recovered.

**M-07 · Reshuffle, nothing played** · `setup/MatchplayPanel.tsx:166–168`
- Now: This will regenerate the bracket from the {8} players registered now. Nothing has been played yet, so nothing is lost.
- New:

**M-08 · Reshuffle buttons** · `setup/MatchplayPanel.tsx:190`
- Now: Erase & Reshuffle · Reshuffle · Working…
- New:

**M-09 · Link to the bracket** · `setup/MatchplayPanel.tsx:222`
- Now: View the draw →
- New:

### The bracket screen

**M-10 · Matchplay is off** · `matchplay/page.tsx:135,136`
- Now: Matchplay isn't switched on  /  Turn it on in Trip Setup, then draw the bracket.
- New:

**M-11 · No bracket yet** · `matchplay/page.tsx:141,144,145`
- Now: No bracket has been drawn yet  /  Pick the pairings in Trip Setup, then use Create Matchplay to draw the bracket.  /  Open Trip Setup and use Create Matchplay to draw the bracket.
- New:

**M-12 · How to use the bracket** · `MatchplayBracket.tsx:301`
- Now: Swipe to move between rounds · hold a finished match to change it
- New:

**M-13 · Undecided slot** · `MatchplayBracket.tsx:575`
- Now: To be decided
- New:

**M-14 · Change-the-winner sheet** · `MatchplayBracket.tsx:634,658,661`
- Now: Change the winner  /  This will void all subsequent results.  /  Every result recorded after this one in the same line of the draw is cleared and must be entered again. It cannot be undone.
- New: Change the winner  /  This will void all subsequent results.  /  All subsequent results will need to be entered again.

**M-15 · Margin field** · `MatchplayBracket.tsx:672`
- Now: Margin — optional
- New:

**M-16 · Winner controls** · `MatchplayBracket.tsx:714,730`
- Now: Winner — tap to unplay · Was the winner · Nobody selected — this match goes back to unplayed.
- New:

---

## §10 — Leaderboard (`/trip/{code}/leaderboard`)

**D-01 · Nothing switched on** · `TripLeaderboardClient.tsx:859`
- Now: No competitions switched on for this trip.
- New: Create a leaderboard in Trip Setup.

**D-02 · No teams yet** · `TripLeaderboardClient.tsx:868`
- Now: No teams with players yet. Set them up in Trip Setup.
- New: Set teams in Trip Setup

**D-03 · No scores yet** · `TripLeaderboardClient.tsx:869`
- Now: No scores yet. The board fills in as play starts.
- New: No scores yet.

**D-04 · How to read the table** · `TripLeaderboardClient.tsx:959`
- Now: Swipe the rounds sideways, or tap a row to see them all.
- New: Swipe to switch round.

**D-05 · A round still being played** · `TripLeaderboardClient.tsx:102,689,930`
- Now: Card still open · Card still open — against level so far · In play — against level
- New:

**D-06 · Team round carried by one player** · `TripLeaderboardClient.tsx:476,478`
- Now: In play — carried by {Ross}  /  Carried by {Ross}
- New:

**D-07 · Dropped round** · `TripLeaderboardClient.tsx:688`
- Now: Set aside — worst round dropped
- New:

**D-08 · Position-points column header** · `TripLeaderboardClient.tsx:134`
- Now: Points by finishing position
- New:

**D-09 · Round states** · `lib/roundState.ts:58–60`
- Now: No scores yet · In play · Scores in
- New:

**D-10 · Course card missing** · `TripLeaderboardClient.tsx:390`
- Now: No hole data for this course.
- New:

---

## §11 — Scoring (`/trip/{code}/scoring`)

### Round picker

**R-01 · Heading** · `scoring/page.tsx:74`
- Now: Choose a round
- New:

**R-02 · No rounds** · `scoring/page.tsx:79`
- Now: No rounds set up for this trip yet.
- New:

**R-03 · Portal states** · `app/scoring/CoursePortalClient.tsx:122,131,136`
- Now: Live scoring in progress · All scorecards complete · No active sessions
- New:

### The round's scorecard list

**R-04 · Nothing open** · `CourseDashboardClient.tsx:601`
- Now: No active scorecards
- New:

**R-05 · No players on a card** · `CourseDashboardClient.tsx:632,724,788`
- Now: No players locked in yet · No scorecards with players · No active or finalised players
- New:

**R-06 · Card progress** · `CourseDashboardClient.tsx:612,738`
- Now: 18 holes · Finalised  /  Through {12}
- New:

**R-07 · Start a card** · `CourseDashboardClient.tsx:684`
- Now: + Start New Scorecard
- New:

**R-08 · Allowance toggle** · `CourseDashboardClient.tsx:424`
- Now: Showing {85}% of course handicap. Tap for the next allowance.
- New:

**R-09 · Voiding a whole card** · `CourseDashboardClient.tsx:747`
- Now: Deletes this card's scores and takes the round off the leaderboard. It cannot be undone.
- New: Deletes this card's scores and takes the round off the leaderboard. This cannot be undone.

**R-10 · Voiding an in-progress card** · `CourseDashboardClient.tsx:748`
- Now: Deletes the holes already entered on this card. It cannot be undone.
- New: Deletes the holes already entered on this card. This cannot be undone.

**R-11 · Removing one player** · `CourseDashboardClient.tsx:806,853`
- Now: Remove from scorecard?  /  Reopens at hole 18. Other players on this card keep finalised state.
- New:

**R-12 · Danger buttons** · `CourseDashboardClient.tsx:891,896`
- Now: Void Live Session  /  Clear All Live Data
- New:

**R-13 · Scoring errors** · `CourseDashboardClient.tsx:282,299,312,396`
- Now: Failed to start scorecard · Could not void that scorecard{reason} · Could not remove that player{reason} · Void failed — please try again
- New:

### Live scoring

**R-14 · Nothing running** · `LiveScoringFlow.tsx:918,919,925`
- Now: No live round active  /  Start Live Round  /  No rounds available. Rounds must be upcoming or active.
- New:

**R-15 · Player picker** · `LiveScoringFlow.tsx:993`
- Now: Select Players (1–4)
- New:

**R-16 · Tee picker** · `LiveScoringFlow.tsx:1034,1076`
- Now: No tees for this course  /  Select a tee to continue
- New:

**R-17 · Start / close buttons** · `LiveScoringFlow.tsx:1095,1099`
- Now: Start Round →  /  Close Live Round
- New:

**R-18 · Not saving** · `LiveScoringFlow.tsx:650`
- Now: Scores will not be saved
- New:

**R-19 · Resume failed** · `LiveScoringFlow.tsx:515,887`
- Now: Could not load the scores already on this card. Check your connection and try again — …  /  Scorecard could not be loaded
- New: Could not load already sumbitted scores. Check your connection and try again — …  /  Scorecard could not be loaded

**R-20 · Nothing to submit** · `LiveScoringFlow.tsx:776`
- Now: There are no scores on this card to submit. If scores were entered earlier, …
- New:

**R-21 · Void confirmation** · `LiveScoringFlow.tsx:850`
- Now: This voids the scorecard and releases all players. Every hole already entered on it is deleted, and the round comes off the leaderboard.
- New: This will void this scorecard and release all players. Every score already entered will be deleted, and be removed from the leaderboard.

**R-22 · Submitted** · `LiveScoringFlow.tsx:1634,1639,1642`
- Now: Saved to the official leaderboard.  /  Score Another Player  /  Close Live Round
- New:

**R-23 · Commit failed** · `LiveScoringFlow.tsx:837`
- Now: Failed to commit scores
- New:

**R-24 · In-play panel empty state** · `LiveLeaderboardPanel.tsx:494,495`
- Now: No scores yet  /  Scores appear as holes are completed
- New:

---

## §11b — Stats (`/trip/{code}/stats`)

Added in the refresh's copy pass (`docs/refresh-plan.md`, Phase 5): screens
built after this sheet was written. Same shape — **Now** is what the screen
said before the pass, **New** what it says after.

---

## §12 — Weather, support and shared bits

**W-01 · No location on file** · `app/components/CourseWeather.tsx:106`
- Now: No forecast — we don’t have this course’s location.
- New:

**W-02 · Forecast unreachable** · `CourseWeather.tsx:112,113` + `app/api/weather/route.ts:401`
- Now: Could not reach the forecast.
- New:

**W-03 · Too far ahead** · `CourseWeather.tsx:121`
- Now: Too far out for a forecast — check back nearer the day.
- New: Too far out for a forecast — check back nearer to the trip.

**W-04 · Tee-time label** · `CourseWeather.tsx:134`
- Now: At the first tee
- New:

**W-05 · No hourly reading** · `CourseWeather.tsx:194`
- Now: No reading for this hour
- New:

**W-06 · Link out to yr.no** · `CourseWeather.tsx:167`
- Now: Full forecast
- New:

**W-07 · Support blurb** · `app/components/SupportLink.tsx:24`
- Now: Enjoy the app? Support like minded golfers grow the game.
- New: *(currently switched off — `SUPPORT_ENABLED` in `lib/donation.ts` is false)*

**W-08 · Support button** · `SupportLink.tsx:34`
- Now: Let’s get those green dots 🟢
- New:

**W-09 · Round card, ladies tees** · `round/[roundNumber]/RoundCard.tsx:39`
- Now: Ladies card
- New:

**W-10 · Overnight cleanup errors (rarely seen)** · `app/api/cleanup/route.ts:82,116`
- Now: Could not read the live tables — nothing was changed. · Could not close the abandoned scorecards.
- New:

---

## §13 — Admin (owner only, `/admin/trips`)

**A-01 · Page title** · `app/admin/trips/page.tsx:23`
- Now: Admin — Green Dot Golf
- New:

**A-02 · States** · `admin/trips/page.tsx:109,116`
- Now: Could not load trips — refresh to try again.  /  No trips yet.
- New:

**A-03 · Not configured** · `admin/trips/actions.ts:26`
- Now: Admin access is not configured on this deployment.
- New:

---

## §14 — Reset tools (`SettingsModal`)

**Z-01 · Reset scores** · `app/components/SettingsModal.tsx:30–33`
- Now: Reset All Scores · Clears all submitted scores and playing handicaps. Player and team data is preserved. · This will permanently delete all scores and round handicaps. This cannot be undone. · All scores and round handicaps cleared.
- New:

**Z-02 · Reset teams** · `SettingsModal.tsx:39–41`
- Now: Removes all team assignments. Players remain but are moved to unassigned. · This will remove all players from their teams. This cannot be undone. · All team assignments cleared.
- New:

**Z-03 · Live session tools** · `SettingsModal.tsx:145,198,204`
- Now: Voids this scorecard and removes these players from the live leaderboard. · Active scoring sessions — void to remove from leaderboard · No active live sessions
- New:

**Z-04 · Failures** · `SettingsModal.tsx:159,292`
- Now: Failed to void. Try again.  /  Action failed. Try again.
- New:

---

## §15 — The event organiser's screens (`/trip/{code}/organiser`, tee sheet, export)

New screens, not in the August sheet: the organiser area and its doors
(Formats by day, Bracket setup / League, Tags), the participant permissions
the creation doors share, the tee sheet and the export. Already changed where
a rule decided it; **Ross** marks a question. Paths are under
`app/trip/[tripCode]/` unless they start with `lib/`. On screen a tag is a
**side**; "tags" stays only in the portal's name ("Teams and tags" row, the
"Tags" page) so it is recognisable (CLAUDE.md).

### The organiser area

**EO-01 · Participants intro** · `organiser/OrganiserClient.tsx`
- Now: How collaborative this event is. Changes land on the field’s phones straight away.
- New: Changes land on the field’s phones straight away. *(rule 1)*

**EO-02 · Starts intro** · `organiser/OrganiserClient.tsx`
- Now: Shotgun sends the whole field out at once. Tee sheets — groups and times — are on the way; choosing one says so on the schedule.
- New: Shotgun sends everyone out together; a tee sheet sends groups in turn. *(rule 1 — and the tee sheet has shipped, so "on the way" was no longer true)*

**EO-03 · "Each day’s own format" row, nothing set yet** · `organiser/page.tsx`
- Now: Every day is scored by the event's own rules. Give one its own format — singles today, fourballs tomorrow.
- New: No day has its own format yet. *(rules 1, 5)*

**EO-04 · One screen, two names** · `organiser/OrganiserClient.tsx` + `organiser/days/`
- Now: Each day’s own format (the row) · Formats by day (the page it opens, and its PIN screen)
- New: **Ross** — one name for this screen? Both are fine on their own.

### Formats by day (`/organiser/days`)

**EO-05 · Page intro** · `organiser/days/DayBoardsClient.tsx`
- Now: The event's own rules count every round. Give a day its own format and that day becomes a competition in its own right — singles one day, fourballs the next.
- New: A day with its own format gets its own leaderboard. *(rule 1; X-02 — "competition" named the object)*

**EO-06 · Where the event's own boards are changed** · `organiser/days/DayBoardsClient.tsx`
- Now: Changed in Trip Setup, through the organiser area.
- New: **Ross** — the organiser area's row into Trip Setup is labelled "Formats, players and teams" (hint "Leaderboards, the field, the running order."), so "Trip Setup" names nothing the organiser can see. Call the row Trip Setup, or point this line at the row?

### Bracket setup and League (`/organiser/bracket`)

The step titles (`STEP_TITLES`) and the other step intros pass the rules and
are left alone.

**EO-07 · A league's summary card** · `organiser/bracket/page.tsx`
- Now: This event was created as a league — its days, venues and field were set then, and its rounds are on the schedule. Scoring formats within league play are still to come; for now every league plays individual Stableford, added up.
- New: Days, venues and field were set when the league was created. *(rule 1 — and the second sentence was no longer true: a league picks its leaderboards at creation, and per day)*

**EO-08 · Step 6 intro, deadlines** · `organiser/bracket/BracketSetupForm.tsx` (`STEP_INTROS`)
- Now: The date each round must be finished by. Two rounds can share a day; they can’t run backwards.
- New: Two rounds can share a date, but dates can’t run backwards. *(rules 1, 6 — the first sentence restated the title, "When is each round due?")*

**EO-09 · League picked on the bracket form** · `lib/bracketSetup.ts` (hint) + `BracketSetupForm.tsx` (card)
- Now: A table over the days — created as its own event, not set up here. · A league is its own event. / Leagues are created whole — venues, dates and field in one go — from Create an Event → Golf Tournament → League. This form sets up a knockout; pick match play to carry on.
- New: A table over the days. · A league is its own event. / Start one from Create an event → Golf tournament → League. *(rules 1, 6 — the hint and the card said it twice; the door names now match their sentence-case buttons)*

**EO-10 · Strict and relaxed** · `lib/bracketSetup.ts`
- Now: You set who plays whom each round, and where. Players just turn up and enter the result. · Players arrange their own matches, pick their own course, and link their card to the bracket themselves.
- New: You set who plays whom each round, and where. · Players arrange their own matches and link their cards to the bracket. *(rule 1)*

**EO-11 · Self-join note** · `BracketSetupForm.tsx`
- Now: The link and QR code are on your Event Hub’s share screen, ready to send or hold up.
- New: The link and QR code are on your Event Hub’s share screen. *(rule 1)*

**EO-12 · Strict-mode note on the entry step** · `BracketSetupForm.tsx`
- Now: Either way, in strict mode the match pairings stay yours — this only decides how names get on the roster.
- New: In strict mode the pairings stay yours either way. *(rule 1)*

**EO-13 · Qualifying event code helper** · `BracketSetupForm.tsx`
- Now: The six-character code of the event whose standings decide who is in.
- New: The 6-character code of the event whose standings decide who is in. *(rule 7)*

**EO-14 · No qualifier** · `BracketSetupForm.tsx`
- Now: Without one, the draw is among whoever enters — drawn at random when the bracket is made.
- New: Without one, whoever enters is drawn at random. *(rule 1)*

**EO-15 · Step 7, lock it in now? — the three states** · `BracketSetupForm.tsx`
- Now: Open can be finalised any time from this screen; finalised is for keeps. · The setup locks when you save — no more joiners, no more changes here. · Players keep joining until you come back and finalise. Every answer here stays changeable until then.
- New: Open can be finalised later; finalised is for keeps. · Saving locks the setup: no more joiners, no more changes. · Players keep joining and answers stay changeable until you finalise. *(rules 1, 2)*

**EO-16 · Saved and still open** · `BracketSetupForm.tsx`
- Now: Players can keep joining. Come back here to finalise when the field is set.
- New: Players can keep joining until you finalise here. *(rule 1)*

### Participant permissions (the creation doors and the organiser area)

**EO-17 · Permission hints** · `lib/eventPermissions.ts`
- Now: Let the field add a course to the platform if theirs is missing. · Let anyone with the code put a new name on the roster — off, they can only claim a name you added. · Let players rework a whole scorecard from the summary screen — hole-by-hole scoring stays open either way. · Let the field put names into open slots and take their own out — off, the sheet is read-only and you place everyone.
- New: Let the field add a missing course to the platform. · Let anyone with the code put a new name on the roster. · Let players rework a finished scorecard; live scoring stays open either way. · Let the field add and remove names on the sheet. *(rule 1 — the last also says what the sheet does: a field allowed to edit can take any name out, not only its own)*

**EO-18 · Picking a side** · `lib/eventPermissions.ts`
- Now: Participants can pick their own tag · Let a claimed player join one of your tags from the teams screen — off, you assign every tag yourself.
- New: Participants can pick their own side · Let claimed players join one of your sides on the teams screen. *(sides; rule 1)*

### Tags (`/organiser/tags`)

**EO-19 · "Teams and tags" row summary** · `lib/tagBoards.ts` (`describeTags`)
- Now: No tags yet — the sides players carry for the whole event. · {2} tags · nobody on the roster yet. · {2} tags · {9} of {12} players tagged.
- New: No sides yet · each player keeps one for the whole event. · {2} sides · nobody on the roster yet. · {2} sides · {9} of {12} players assigned. *(sides; rule 2 on the rewritten line)*

**EO-20 · Page intro** · `organiser/tags/TagPortalClient.tsx`
- Now: A side each player carries for the whole event — Europe and USA, the club sides. It follows them whoever they play alongside on the day, colours their player card everywhere, and feeds any leaderboard that ranks the sides.
- New: Each player’s side for the whole event, whoever they play with. *(rule 1 — the examples live in the new-side placeholder, the leaderboard in the section below)*

**EO-21 · Tag → side through the portal** · `organiser/tags/TagPortalClient.tsx`
- Now: Remove this tag? Its players keep their scores and simply carry no tag. · Could not add / rename / remove the tag — try again · Could not take the tag off — try again · Still untagged: {names} · (screen reader) Tag name · Already tagged — tapping moves them
- New: Remove this side? Its players keep their scores. · Could not add / rename / remove the side — try again · Could not take the player off the side — try again · No side yet: {names} · (screen reader) Side name · Already on a side. Tapping moves them. *(sides)*

**EO-22 · What the sides play for** · `organiser/tags/TagPortalClient.tsx`
- Now: What the tags play for · The sides are being ranked. Everything else on the leaderboard is unchanged. · Tags colour the player cards on their own. Add a leaderboard to rank the sides against each other. · + Rank the tags
- New: What the sides play for · The sides are being ranked. · On their own, sides only colour player cards. · + Rank the sides *(sides; rules 1, 6 — the button says what to do)*

### The tee sheet (`/trip/{code}/teesheet`)

**EO-23 · Page title** · `teesheet/TeeSheetClient.tsx`
- Now: Tee Sheet
- New: Tee sheet *(rule 4 — the tab label in `app/components/TabBar.tsx` still reads "Tee Sheet")*

**EO-24 · The sheet cannot save yet** · `teesheet/TeeSheetClient.tsx`
- Now: The tee sheet's database update has not been applied, so a name added here would disappear again. Everything else on the event works as normal.
- New: Names added here won’t stick until a database update is applied. *(rule 1)*

**EO-25 · Somebody without a side** · `teesheet/TeeSheetClient.tsx`
- Now: One player still needs a tag / {3} players still need a tag · This event ranks the tags, so a card belongs to one: {names} cannot go on the sheet until tagged. · Set tags →
- New: One player still needs a side / {3} players still need a side · The event ranks sides, so these cannot go on the sheet yet: {names} · Set sides → *(sides; rule 1)*

**EO-26 · Refused in the slot** · `lib/tagBoards.ts` (`tagGateReason`, `dayTeamTagIssue`)
- Now: {Mary} needs a tag before going on the sheet — tags are set in the organiser area. · {Mary and Sean} need tags before going on the sheet — tags are set in the organiser area. · Everyone in a team needs a tag first. · A team has to be all one tag — its card counts towards that tag.
- New: {Mary} needs a side before going on the sheet. Sides are set in the organiser area. · {Mary and Sean} need sides before going on the sheet. Sides are set in the organiser area. · Everyone in a team needs a side first. · A team has to be all one side. Its card counts towards that side. *(sides; rule 2 on the rewritten lines — each still says why)*

**EO-27 · No start time** · `teesheet/TeeSheetClient.tsx`
- Now: No start time set — groups are numbered until the organiser sets one in the Starts section.
- New: Groups are numbered until the organiser sets a start time. *(rule 1)*

**EO-28 · Footer** · `teesheet/TeeSheetClient.tsx`
- Now: {10} minutes between groups, up to {four} a slot — the organiser tunes both in the Starts section.
- New: {10} minutes between groups · groups of up to {4} *(rules 5, 7)*

### Export (`/trip/{code}/export`)

**EO-29 · Save as PDF helper** · `export/TripExportClient.tsx`
- Now: Opens your device’s print window — choose “Save as PDF” there. What you see below is what it saves.
- New: Opens your device’s print window; choose “Save as PDF” there. *(rule 1)*

**EO-30 · The document's header on an event** · `export/TripExportClient.tsx`
- Now: Trip code {code} · Itinerary
- New: **Ross** — an event organiser reaches this page through Trip Setup, and the document then says "Trip code" and "Itinerary". Print "Event code" and "Schedule" on an event? (Needs the page to read the kind, so a small code change as well as copy.)

---

## §16 — Green Dot Run (`/run/{code}`)

None of these screens were in the sheet before. Only strings that changed, or
that need Ross, are listed. The Strava and privacy statements say in writing
what is kept and deleted (Strava's API Policy, `docs/run.md`), so they were
left whole and the long ones are asked about below rather than cut.

### The points rules (challenge setup and the organiser area)

**RN-01 · Points per run, hint** · `app/components/RunRulesFields.tsx`
- Now: For the run itself — turning up is worth something.
- New: For each run that counts, however far. *(rule 5)*

**RN-02 · Daily limit, hint** · `app/components/RunRulesFields.tsx`
- Now: The most points one person can earn in a day — keeps it a challenge rather than an ultramarathon.
- New: The most points one person can earn in a day. *(rule 3)*

**RN-03 · How teams are compared: Average per member, hint** · `lib/runChallenge.ts` (`TEAM_SCORES`)
- Now: Fair when teams are different sizes — everyone on the team counts, runs or not.
- New: Fair for uneven teams, counting every member whether they run or not. *(rule 1)*

**RN-04 · Member or runner?** · `lib/runChallenge.ts` (`TEAM_SCORES`, `describeTeamScore`, `teamScoreFact`), `app/run/[tripCode]/page.tsx`
- Now: Average per member (the rules form) · Teams are ranked on their average per member. (home's rules card)  /  Average per runner (the leaderboard's line) · {2.5} per runner (home's Leading card) · Average points per runner. (home's Final standings)
- New: **Ross** — one word for the people on a team: member or runner?

### Participant permissions (challenge setup and the organiser area)

**RN-05 · Participants can join by themselves, hint** · `lib/runChallenge.ts` (`RUN_PERMISSIONS`)
- Now: Anyone with the code can add their name and pick a team — off, they can only claim a name you added.
- New: Anyone with the code can add their name, not only claim one. *(rule 1)*

**RN-06 · Participants can start a new team, hint** · `lib/runChallenge.ts` (`RUN_PERMISSIONS`)
- Now: Let someone joining start a team of their own — off, they join one of yours.
- New: Someone joining can start a new team, not only join yours. *(rule 1)*

**RN-07 · Participants can log runs by hand, hint** · `lib/runChallenge.ts` (`RUN_PERMISSIONS`)
- Now: Let players type a run in themselves — off, runs only arrive from a connected Strava account.
- New: Runners can type runs in, not only connect Strava. *(rule 1)*

### Joining (`/run/{code}/join`)

**RN-08 · Sub-heading** · `app/run/[tripCode]/join/RunJoinClient.tsx`
- Now: Find your name, or add yourself — then pick your team.
- New: Find your name or add yourself, then pick your team.  /  (adding yourself switched off) Find your name, then pick your team.  /  (no names added yet) Add your name, then pick your team.  /  (no way in) nothing, the notice below says it. *(it offered "add yourself" when that was switched off)*

**RN-09 · No way in** · `app/run/[tripCode]/join/RunJoinClient.tsx`
- Now: Joining by yourself is switched off for this challenge. Ask the organiser to add your name, then come back and tap it here.
- New: Joining by yourself is switched off. Ask the organiser to add your name. *(rule 1)*

### Add tab (`/run/{code}/add`)

**RN-10 · Under Your runs** · `app/run/[tripCode]/add/RunAddClient.tsx`
- Now: Points shown are each run on its own — a daily limit, if the challenge has one, applies on the leaderboard.
- New: Points are per run, before any daily limit the leaderboard applies. *(rule 1)*

**RN-11 · Once the challenge is final** · `app/run/[tripCode]/add/RunAddClient.tsx`
- Now: This challenge is final — runs can no longer be added. The final team standings are on the leaderboard, and its Strava runs have been deleted, as agreed when they were connected.
- New: **Ross** — 32 words; the second half is the written word that the Strava runs were deleted. Keep whole?

### Strava card (Add tab and Settings)

**RN-12 · Not connected, subtitle** · `app/run/[tripCode]/StravaCard.tsx`
- Now: Your runs arrive by themselves — the ones since the challenge started, and every one after, until it closes.
- New: **Ross** — 19 words, but it is part of what a runner is told before agreeing (what is collected). Keep?

**RN-13 · The consent list** · `app/run/[tripCode]/StravaCard.tsx`
- Now: What is kept. … · Who sees it. … · For this challenge only. … {Thu 3 Dec} — three days after the finish, or later if the organiser extends it. … · Stop at any time. … · Delete everything. …
- New: **Ross** — Strava's API Policy (§2.1) asks for all five, so it is long by requirement and left whole. It also says "three days" in words, where rule 7 and the privacy notice use the figure from the code (`FINAL_GRACE_DAYS`). Change that one word?

**RN-14 · Connected, after the challenge has closed** · `app/run/[tripCode]/StravaCard.tsx`
- Now: This challenge has closed — no new runs are read. The connection ends, and your Strava runs are deleted, when the final results are frozen overnight.
- New: **Ross** — 25 words, but it says in writing what is deleted and when. Keep?

### Leaderboard (`/run/{code}/leaderboard`)

**RN-15 · Final notice** · `app/run/[tripCode]/leaderboard/page.tsx`
- Now: The standings were frozen on {Mon 30 Nov}. The Strava runs behind them have since been deleted, as agreed when they were connected — so the team totals are kept, and each runner's are not.
- New: **Ross** — 33 words, but it says in writing what was deleted and what was kept. Keep?

### Stats (`/run/{code}/stats`)

**RN-16 · Coming soon** · `app/run/[tripCode]/stats/page.tsx`
- Now: Distance by week, your pace over the challenge, and how your team is tracking. The leaderboard has the standings in the meantime.
- New: Distance by week, your pace, and how your team is tracking. *(rule 1)*

### Settings (`/run/{code}/settings`)

**RN-17 · Under Leave and delete my data** · `app/run/[tripCode]/settings/HelpAndPrivacy.tsx`
- Now: Permanently deletes your name, your place on your team, every run you have logged and any Strava connection, from this challenge. A final team total already frozen stays — it is the team's, not yours.
- New: **Ross** — 33 words, but it is the written statement of what is deleted and what stays (Strava §2.5). Keep?

### Organiser area (`/run/{code}/organiser`)

**RN-18 · Dates, intro** · `app/run/[tripCode]/organiser/RunOrganiserClient.tsx`
- Now: Late runs count for three days after the finish; then the standings freeze and every Strava connection ends. Extending the finish moves all of that with it.
- New: Late runs count until {3} days after the finish, when the standings freeze and Strava connections end. *(rules 1, 7)* — the {3} is `FINAL_GRACE_DAYS` from the code now, not typed.
- **Ross:** still 17 words; it says when Strava connections end, so it was cut, not gutted. Shorter?

**RN-19 · Dates, once final** · `app/run/[tripCode]/organiser/RunOrganiserClient.tsx`
- Now: Final — the standings were frozen on {Mon 30 Nov}, so the dates can no longer change.
- New: Frozen on {Mon 30 Nov}, so the dates can no longer change. *(rule 1)*

**RN-20 · Teams, intro** · `app/run/[tripCode]/organiser/RunOrganiserClient.tsx`
- Now: Tap a runner to rename, move or remove them. A team can be removed once it is empty.
- New: Tap a runner to edit them. Only an empty team can be removed. *(rule 1)*

---

## Appendix — screens not on the platform

These files still carry copy but nothing on a trip links to them. They're the
original single-trip Donegal Masters screens, kept because the scoring code was
lifted from them. **Skip them unless you say otherwise** — changing their words
changes nothing a player can see.

| Route | Files |
|---|---|
| `/leaderboard`, `/leaderboard/individual` | `app/leaderboard/*` |
| `/live` | `app/live/*` |
| `/score-entry` | `app/score-entry/*` |
| `/teams` | `app/teams/*` |
| `/tee-times` | `app/tee-times/*` |
| `/scorecard/{id}` | `app/scorecard/*` |
| `/settings` | `app/settings/*` |
| `/scoring`, `/scoring/{slug}` | the portal pages only — `CourseDashboardClient`, `LiveScoringFlow` and `LiveLeaderboardPanel` **are** live and are covered in §11 |

One string in this group is worth knowing about either way:
`config/site.ts:11` still reads **"4th Donegal Masters"**, and the legacy
leaderboard prints **"The Donegal Masters"** (`app/leaderboard/page.tsx:38`).

---

## Things worth fixing regardless of phrasing

Found while collecting the above. Each is a copy problem rather than a taste
question — flagging rather than acting on them.

1. **S-04** tells the reader to "Unlock it below" on the trip-details drawer.
   There is no unlock control below any more; the Finalise/Unlock pair was
   removed from the settings screen.
2. **C-28** tells a new organiser to "Finalise the trip when everyone's ready" —
   same missing control.
3. **C-06** shows a player a developer instruction: *"Add courses with
   `trip_id = NULL` to get started."*
4. **X-01/X-03**: the matchplay screens send the reader to "Trip Setup" and the
   tab that opens it is labelled "Settings".
