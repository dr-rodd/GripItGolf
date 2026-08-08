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
- New: Live scoring, leaderboards and matchplay for your golf trip.

**L-02 · Primary button** · `app/Landing.tsx:155`
- Now: Create a trip
- New:

**L-03 · Secondary button** · `app/Landing.tsx:162`
- Now: Join a trip
- New:

**L-04 · Footnote under the buttons** · `app/Landing.tsx:167`
- Now: Your handicap is the best 8 of your last 20 rounds. On the graph, those eight are green dots.
- New: "Right now that dot is both green and not green. You decide what it becomes" - Erwin Schrödinger

**L-05 · Site tagline (stored centrally, used for branding)** · `config/site.ts:8`
- Now: Your handicap is the best 8 of your last 20. Go and get a green dot.
- New:

**L-06 · Browser tab / search-result description** · `app/layout.tsx:32`
- Now: Live scoring, leaderboards and matchplay for your golf trip.
- New:

**L-07 · Browser tab title** · `app/layout.tsx:30`
- Now: green dot golf.
- New:

**L-08 · Header back-link (screen readers)** · `app/components/TripHeader.tsx:109`
- Now: Back to the start / Back to the trip
- New:

---

## §2 — Joining a trip (`/join`)

**J-01 · Heading** · `app/join/JoinForm.tsx:64`
- Now: Join a Trip
- New:

**J-02 · Sub-heading** · `app/join/JoinForm.tsx:67`
- Now: Enter the 6-character code from your organiser.
- New:

**J-03 · Button** · `app/join/JoinForm.tsx:94`
- Now: Join Trip
- New:

**J-04 · Wrong code** · `app/join/JoinForm.tsx:44`
- Now: Trip not found — check your code and try again
- New:

---

## §3 — Creating a trip (`/dashboard/create`)

### Step labels

**C-01 · Step counter** · `app/dashboard/create/CreateTripForm.tsx:507`
- Now: Step {n} of 3 — {step name}
- New:

**C-02 · The three step names** · `app/dashboard/create/CreateTripForm.tsx:41`
- Now: Trip details · Itinerary · Players
- New:

### Step 1 — Trip details

**C-03 · Trip name label / example** · `CreateTripForm.tsx:518,523`
- Now: Trip name  /  e.g. Irish Links Tour 2027
- New:

**C-04 · Email label** · `CreateTripForm.tsx:541`
- Now: Email (optional)
- New:

**C-05 · Why we ask for an email** · `CreateTripForm.tsx:556`
- Now: So we can confirm your trip and keep you updated.
- New:

### Step 2 — Itinerary

**C-06 · No courses in the database yet** · `CreateTripForm.tsx:580`
- Now: No platform courses available yet. Add courses with trip_id = NULL to get started.
- New: *(this one is a developer message shown to a player — it should probably say something a golfer can act on)*

**C-07 · Continue button at the foot of the itinerary** · `app/components/ItineraryBuilder.tsx:245`
- Now: Proceed to Add Players
- New:

**C-08 · Empty day** · `ItineraryBuilder.tsx:449`
- Now: This day is empty.
- New: Nothing added yet. Get your golf in!

**C-09 · Course picker label** · `ItineraryBuilder.tsx:519`
- Now: Choose a course
- New:

**C-10 · Tee time label** · `ItineraryBuilder.tsx:536`
- Now: First tee time
- New:

**C-11 · What extra tee times mean** · `ItineraryBuilder.tsx:560`
- Now: One round is created for this course. More tee times just means more groups going off.
- New: How many groups are going out?

**C-12 · Accommodation prompt** · `ItineraryBuilder.tsx:574`
- Now: Where are you staying?
- New:

**C-13 · Rounds locked because scores exist** · `ItineraryBuilder.tsx:390`
- Now: Scores already exist on this trip, so rounds are locked. Stays and journeys can still be added, moved or removed.
- New:

**C-14 · Can't continue without golf** · `CreateTripForm.tsx:138`
- Now: Add at least one round of golf — there is nothing to score without it.
- New: Add at least one round of golf — otherwise what's the point?

### Step 3 — Players and the settings lock

**C-15 · Players are optional** · `CreateTripForm.tsx:599`
- Now: Optional — players can also join later with the trip code.
- New:

**C-16 · First player's label** · `CreateTripForm.tsx:606`
- Now: Lead player  /  Player {n}
- New:

**C-17 · Name and handicap placeholders** · `CreateTripForm.tsx:626,643`
- Now: Full name  /  Handicap
- New:

**C-18 · Add-player button** · `CreateTripForm.tsx:671`
- Now: + Add another player
- New:

**C-19 · Lock toggle title** · `CreateTripForm.tsx:681`
- Now: Lock trip settings
- New:

**C-20 · Lock toggle explanation** · `CreateTripForm.tsx:682`
- Now: Ask for a passcode before anyone can change formats, players or teams
- New:

**C-21 · Lock warning headline** · `CreateTripForm.tsx:692`
- Now: This can only be set now.
- New:

**C-22 · Lock warning body** · `CreateTripForm.tsx:695`
- Now: There is no way to add, change or remove your passcode later — otherwise anyone with your trip code could lock you out of your own trip. Write it down.
- New: There is no way to add, change or remove your passcode later — Write it down!

**C-23 · Passcode fields** · `CreateTripForm.tsx:707,717`
- Now: Passcode (4–8 digits)  /  Enter it again
- New:

**C-24 · Passcodes don't match** · `CreateTripForm.tsx:144`
- Now: The two passcodes do not match.
- New:

**C-25 · Create button** · `CreateTripForm.tsx:747`
- Now: Create Trip  /  Creating…
- New:

**C-26 · Note under the create button** · `CreateTripForm.tsx:750`
- Now: Players without a name will be skipped
- New:

### Confirmation screen

**C-27 · Heading** · `CreateTripForm.tsx:411`
- Now: Trip Created!
- New:

**C-28 · What to do next** · `CreateTripForm.tsx:414`
- Now: Share this code with your group to join. Next, choose what you’re playing for in trip settings — leaderboards and teams live there. Finalise the trip when everyone’s ready to play.
- New: Share this code with your group to join. Next, choose leaderboard formats and teams in trip settings.

**C-29 · Code label** · `CreateTripForm.tsx:421`
- Now: Your Trip Code
- New:

**C-30 · Passcode reminder** · `CreateTripForm.tsx:439`
- Now: Settings are locked. Keep your passcode safe — it cannot be recovered or changed.
- New:

**C-31 · Copy button** · `CreateTripForm.tsx:450`
- Now: Copy Code  /  ✓ Copied
- New:

**C-32 · Go-to-trip button** · `CreateTripForm.tsx:456`
- Now: Go to Your Trip
- New:

### Creation errors

**C-33 · Generic** · `CreateTripForm.tsx:55,58`
- Now: Please try again.  /  {reason} — a database update may not have been applied yet.
- New:

**C-34 · Passcode couldn't be set** · `CreateTripForm.tsx:212`
- Now: Could not set the passcode on this device. Try again, or create the trip without one.
- New:

**C-35 · Partial-failure family** · `CreateTripForm.tsx:251,285,326,354,372`
- Now: Could not create the trip. {reason} · Trip created, but the players failed. {reason} · Trip created, but the itinerary failed. {reason} · Trip created, but the rounds failed. {reason} · Trip created, but the handicaps failed. {reason}
- New:

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
