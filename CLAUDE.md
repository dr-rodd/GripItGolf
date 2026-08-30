# Green Dot Golf

Multi-trip golf platform: a group leader creates a trip, gets a shareable code, and the group gets live scoring, leaderboards, and teams. Forked from Donegal Masters (single-trip family app) — its scoring code is already in this repo (`app/scoring/`), being generalised with `trip_id` scoping. Its look is not the target: `STYLE_GUIDE.md` + `app/globals.css` are the current design system, no gold, emerald only.

## Who's building this

Big Dog — no coding background. Claude.ai handles design decisions; Claude Code (CC) handles execution. Plain language, no unexplained jargon. Prompts to CC: succinct, scoped to specific files, one chunk at a time — test between dependent steps.

## Tech stack

- Next.js 16 (App Router, TypeScript), Tailwind, Supabase (Postgres + RLS)
- Vercel project `grip-it-golf`, auto-deploys from `master` — no manual deploy step
- Repo: github.com/dr-rodd/GripItGolf · Supabase ref: `bnnnnuxoczzuipefhvms`

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...# server only. `createAdminClient` throws without
                             # it, which takes the nightly cleanup and the
                             # weather route with it. Was undocumented here
                             # for a long time while both depended on it.
CRON_SECRET=...
ADMIN_PASSWORD=...           # server only, no NEXT_PUBLIC_ prefix
MET_USER_AGENT=...           # server only. Identifies this app to MET Norway
                             # and carries a contact address; they throttle and
                             # then refuse requests without one. Falls back to
                             # the site URL alone, which is weaker — set it.
                             # Format: GreenDotGolf/1.0 (+https://greendot.live; you@example.com)
ANTHROPIC_API_KEY=...        # server only. The card check — photographing a
                             # scorecard on the pick-player screen to correct
                             # pars, indices, slopes and yardages — sends the
                             # photo to the Claude API with this key. Unset,
                             # the check answers with a calm "not set up yet"
                             # and everything else works as before.
RESEND_API_KEY=...           # server only. The one confirmation email sent to
                             # trips.lead_email after creation — unset, the
                             # send is a silent no-op and trips create exactly
                             # as before. Needs greendot.live verified as a
                             # sending domain in Resend.
NEXT_PUBLIC_DONATION_URL=... # unset = support link vanishes entirely.
                             # Currently moot: SUPPORT_ENABLED in lib/donation.ts
                             # is false, so the link is off whatever this says.
                             # Flip that constant to bring it back.
```

## Reference docs — open only the one the task needs

Don't read these up front. Open the matching file when the task actually touches that area.

| Doc | Open it for |
|---|---|
| `docs/design-system.md` | Colours, type, the wordmark, header, landing animation, scoring symbols, motion |
| `docs/schema-and-scoring.md` | Table structure, the Stableford trigger, WHS handicap formula, player states, tee data |
| `docs/leaderboards.md` | Leaderboard model, legacy `formats` compatibility, custom points, matchplay draws, team scoring modes |
| `docs/features.md` | Admin overview, lead player email, returning-player cookie, support link, itinerary, trip lifecycle |
| `docs/testing-and-data.md` | The test suites, how much checking a change is worth, insertion order, background jobs |
| `docs/gotchas-and-debt.md` | Past incidents, refactor discipline, security debt, multi-year architecture note |
| `docs/ios-app.md` | The home-screen install layer (manifest, generated icons, standalone quirks), how players install, and the deferred App Store route |
| `docs/course-import.md` | Adding platform courses in bulk — the `data/courses/*.json` contract, what the gate refuses and why, the generator, and the research brief a Cowork session follows |
| `docs/randa-reconnaissance.md` | Where tee ratings come from and what they do not carry. `randa.org`'s lookup 404s; `ncrdb.usga.org` is live and holds **tee sets only**, never a stroke index — which is why the brief sources tees and holes separately |

## Platform concept

- **The enterprise is Green Dot Live** — live scoring tied to live leaderboard generation, with leaderboard settings as the rules, for any event with a winner. Golf is the first sport and the current focus; tennis events, sports days, multi-event competitions, park runs and sailing are the direction. The wordmark and visual identity are unchanged until the new Green Dot Live logo arrives.
- **The landing page is the portal**: the 6-character code is typed straight on the front page (Join Event — `/join` survives for shared `?code=` links), and Create an Event goes to `/golf`, which offers Golf Trip, Golf Tournament, and Personal usage (named, not built — the card says Coming soon). A new sport gets a doorway beside `/golf`; the landing page doesn't change.
- **A tournament is the create wizard through a second door** — `/dashboard/create?type=tournament`, read client-side so the route stays static. It swaps trip wording for event wording, asks standalone-or-multi-day first (standalone writes one date to both ends, and its itinerary step wears the **single-day face**: no "Day 1" strip or fallback, a big **Set Venue** button in the day itself (golf is the main event, then a quiet "+ Add another round"), and one **Add activity** button whose sheet asks what kind — activity, travel or stay — via `KindSwitch`. **Golf occupies five hours from the last tee time** (`golfSpanMins`/`golfUntil` in `lib/itinerary.ts`, the one copy `itemState`'s dimming reads too, a group every ten minutes); other items' times may sit inside that window freely — the golf tile prints its "until" so an overlap reads as deliberate, and drag order stays manual), and has an **event organiser — never "lead player"** — who may or may not be playing: playing, their name is the first player card, in the list with everyone else, and carries `is_lead`/`claimed`/the cookie; not playing, no player row exists for them and no row has `is_lead`. Stored with **`trips.kind = 'tournament'`** (migration 046, applied by hand; the kind is only sent for tournaments, so trips still create on an un-migrated database and reads fail soft — no column simply means trip).
- **A tournament's hub is the Event Hub** — the same `/trip/[code]` route reading `trips.kind`: a **Notices** section fed by `event_messages` (leads the stack, opens first when it has any), **Schedule** instead of "Your Itinerary", and Travel & Accommodation only when a stay or journey is actually planned. **An event's Schedule draws each day against a faint timescale** (`dayTimeline` in `lib/itinerary.ts`, the only copy of the maths; `DayPlan` in `Itinerary.tsx` only multiplies by pixels): the window runs from the first entered time to the last thing's end and scrolls inside a fixed frame; golf stands on its five-hour block; **an event without an end time occupies an hour** (`DEFAULT_EVENT_MINS`); overlaps step a lane right and are drawn, never refused; anything without a clock is listed under the scale, never invented onto it. Activities carry an optional **end time** (`itinerary_items.end_time`, migration 048, applied by hand — reads in their own fail-soft query, writes name the column only when set), only ever alongside a start, no crossing midnight. A plain trip's itinerary is untouched — the timescale is the Event Hub's. **The organiser PIN is the settings passcode** — required at tournament creation (a trip still chooses), one code behind both Trip Setup and `/trip/[code]/organiser`, the same soft lock as ever (`lib/passcode.ts`'s note holds). **The organiser area is the event's admin portal**: a bird's-eye overview card above the fold, then **participant permissions** — what the field may do for itself (`lib/eventPermissions.ts`, the one registry: add courses, add players, edit scorecards; all off by default, the organiser opts in; saved on the spot to `trips.event_permissions`, jsonb, migration 049, applied by hand; **a new permission is one line in the registry**, never a restructure). Every event creation door asks the same question ("How collaborative should this event be?") through the shared `EventPermissionToggles`, writing the column only when a toggle was flipped. The gates are events-only — `allowsParticipant` answers yes for anything that is not an event, so **trips are untouched** — and today they bite on the players page's add-yourself form (`add_players`) and the scoring summary's Edit Scorecard (`edit_scores`); `add_courses` is stored and latent, because an event's participants currently have no course-adding surface, and whatever surface arrives must read the gate. An event's confirmation email (same route, claim and service-role recipient as a trip's) carries the **admin link** and a keep-this-email PIN reminder — **never the PIN itself**, which is hashed on the organiser's device and has never been known to the server. The organiser area posts and removes notices and picks each round's start: **shotgun** writes its one time to the round's itinerary item, where the countdown, weather and schedule already read it; **tee sheet** stores the choice (`rounds.start_format`), says so on the schedule, and now opens the sheet itself: `/trip/[code]/teesheet`, an event's fifth tab (rightmost — an event trades Trip Setup for it; a trip's bar is untouched). `lib/teeSheet.ts` is the only copy of the sheet's rules — interval and group-size bounds (defaults ten minutes and fours; the interval default *is* the golf-span's `TEE_INTERVAL_MINS`), the slot clock off the round's own start time, sheet length, and the team grouping of a slot. Slots are never rows: `tee_assignments` (migration 050, applied by hand) is one row per player per round, UNIQUE, so racing phones interleave instead of clobbering; the two settings columns ride on `rounds`, read fail-soft, tuned in the organiser's Starts card once tee sheet is the chosen format. Editing is the organiser's (the PIN unlock this device holds, read from sessionStorage after mount) or the field's via the `edit_tee_sheet` permission. **A refused write says so in the slot it was refused in, never at the foot of the sheet** — a name appearing and vanishing with the reason a scroll away reads as a glitch, which is exactly how the first report of it arrived; a failed write then asks the database what it actually holds (`resyncRound`) rather than assuming its own guess, so somebody another phone got there first is not reported as a failure. And because the assignments read is fail-soft, **the page tells the sheet whether it has anywhere to save at all** (`storageReady`): pre-050 the sheet says so once at the top instead of letting a tap discover it. **Team boards on an event are asked how they meet the sheet** (`Leaderboard.teeTeams`, absent = together, only `'separate'` stored; `offersTeeTeams`, asked via `LeaderboardSetup`'s `askTeeTeams` prop — events only, a trip never sees the question) **and how their teams are formed** (`teamPick: 'self'` + `teamSize`, clamped 2–4 together / 2–8 separate, only stored with the pick; choosing self-pick seeds `hideTeamName`, because a self-made team is named from its members — "Ross & Dave", `joinNames`, refreshed on every join and leave). **`teamSizeLimit` in `lib/teamLimits.ts` is the one copy of every team-size cap** — pairs draws and criteria boards alike — so `canJoinTeam`, the drag refusal, the join screen and the editor can never disagree. On a self-pick event the teams screen wears two faces (`TeamsModeSwitch`): the field gets the join screen without the PIN (self-picking is the organiser's standing grant — claimed players start, join and leave teams through the one `setTeam` writer), the organiser gets the full editor via the session unlock or the inline PIN (`InlineUnlock` — the same soft lock, offered in place; the tee sheet carries it too, and **creation now calls `rememberUnlock`** so the device that set the PIN is never locked out of its own event). On a share-a-tee board the tee sheet's picker offers a linked team as **one stuck-together card** (`pickerUnits` in `lib/teeSheet.ts`, built on `groupSlot`; members never offered solo): tapping books every member in one batch insert — atomic, so a race books all or none — it only fits where the whole team fits, and the in-slot block leaves as one. The trip teams screen keeps its drag and count buttons and gains **"+ Add players" search per team column**, assigning through the drag's own `assignPlayer` path. The organiser area also holds the **Format** card (`/trip/[code]/organiser/bracket`) — for a match play event, the bracket setup form: seven answers saved whole to `trips.bracket_setup` (jsonb, migration 047, applied by hand; reads fail soft in their own query, never inside a page's main select): **strict** (organiser pre-pairs and pre-courses every round) or **relaxed** (players self-organise and link their own cards) mode, a 16/32/64/128 field ceiling, organiser-entered or self-join entry, an optional qualifying event referenced by its own code whose standings seed the draw (randomised among the qualifiers, or fully seeded — first plays last), a deadline per bracket round, and finalise-now-or-leave-open — finalised is read-only and for keeps, open means the field keeps growing until the organiser comes back. `lib/bracketSetup.ts` is the only copy of those rules; the draw itself — generating matches from the setup — still belongs to `lib/matchplay.ts` and is work to come. **For a league event the same screen is a summary, never a form** — a save there would overwrite the league with a bracket, so the page branches on `parseLeagueSetup` before it ever renders the match play form.
- **A tournament has a shape in time, asked before its format** (`CreateFlow`, the same client-side URL read, route still static): **standalone** — a single point in time, one day or a run of days; **continuous** — an ongoing event occupying a period, like a summer, its playing days picked inside the period by hand or **every week on one day** (`weeklyDates`; a day's `day_index` is its calendar offset inside the period, so `dateForDay` keeps telling the truth); or **series** — a numbered list of events with **no dates at all** (trip dates null, days extensible later from the running order; the hub's day count reads the items as well as the dates, or a series would render one day). A series is a league by nature and skips the format question. A **continuous knockout** gets its own lean door, `CreateKnockoutForm` — name, period, field, PIN, **no itinerary and no rounds**: matches happen when players make them happen, paced by the bracket's deadlines. Creation seeds `bracket_setup` with `{format, schedule}` — a partial the parser rightly refuses — and the bracket page recovers the shape off the raw column so the form's first save carries it rather than quietly making the event standalone. The shape lives in the setup (`LeagueSchedule` / `BracketSetup.schedule`, absent = standalone) because bare dates cannot say whether they were declined or never existed.
- **A league is the other tournament format, created whole** — League opens its own four-step wizard (`CreateLeagueForm`, handed the chosen `schedule`): **not the trip wizard re-worn** — event details with the shape's own questions (standalone asks single-day or multi-day; single is deliberately lightweight: one venue, one date, one leaderboard), a venue per day with a same-venue toggle (**a continuous league keys venues by date**, so a date added or removed cannot shuffle the courses), the field (organiser-entered or self-join with an optional require-approval toggle — the approval answer is stored and said on screen; the join-flow gate is built on top of it later, the same posture as `tee_sheet`), and for multi-day one more question: how the days relate on the leaderboard — **separate days, one running total, or days-and-overall** (`DayBoards`). What it reuses from the trip wizard is the proven underneath: `CourseSelect`, `HandicapField`, the roster rules, `toItemRow`, the insertion order. **Leaderboard selection is built into creation**: the Finish step embeds Trip Setup's own `LeaderboardSetup` — the whole grid, never a second copy — seeded with `starterBoards()` (individual Stableford, added up) so an organiser who wants only the default taps nothing, and creation refuses to finish with no board at all. Creation writes the trip (`kind: 'tournament'`, the league setup whole in `bracket_setup`, the chosen boards in `leaderboards` — a league plays from the moment it exists), the players, a golf item and round per day, and the handicap snapshots; a team board starts unassigned and gets its teams on the teams screen, as on a trip. `lib/leagueSetup.ts` is the only copy of the rules, sharing `trips.bracket_setup` with the knockout discriminated on `format` — each parser refuses the other's object. The per-day leaderboard presentation the `dayBoards` answer feeds is deliberately still to come. **The field never sees Trip Setup on an event**: the tab bar drops the tab (four tabs, decided by the trip layout's cached `kind` read) and the setup screen is reached only through the organiser area — the seed of a full admin portal. **Participant screens carry no modifiers on an event**: scoring offers no add-round, a round page no casual switch, and `/trip/[code]/teams` stands behind the PIN. Pages learn the kind through `app/trip/[tripCode]/kind.ts` — the one cached, fail-soft lookup, asked *alongside* a page's own first query (never named inside its select, which would fail the page on an un-migrated database). `lib/eventHub.ts` is the only copy of the rules themselves.
- **An event has two levels of grouping, and they are not the same thing.** A **tag** is the side a player carries all week — Europe and USA, the club sides — set once from the event dashboard and never changing; a **team** is the playing group on the day, the fourball or the pair, picked at the tee sheet and different every morning. They are not mutually exclusive: an event may use one, the other, or both, and a team card can feed a tag board. Under the hood a tag is a **team on the main sheet** and a day's teams are **teams on `day:<roundId>`** — the whole feature rides on `teams` + `team_members` from migration 023, so **it needed no migration at all**. `lib/tagBoards.ts` owns the tag rules and `daySheetId`/`sheetForBoard` in `lib/teamSets.ts` own the day sheets — and the sheet a board plays is **derived from its scope, never stored twice**, or a board whose days changed would point at the teams of a day it no longer counts. Tags are made and assigned in the organiser area (`/trip/[code]/organiser/tags`), or joined by the field when the organiser turns on `assign_tag` — a different verb from a board's `teamPick: 'self'`, which lets the field *form* teams rather than *join* a tag. **When tags are in play the tee sheet refuses an untagged player** (`tagGateReason`, said in the slot, with a banner at the top first) and a day team must be all one tag — but the gate only ever refuses an *add*: somebody already seated who loses their tag is left where they stand, because evicting a name the field has read is the worse failure.
- **A board can be told which golf it counts** — `Leaderboard.roundIds`, absent meaning every round, which is what every board stored before it means. That is what lets a day carry its own format (Day 1 singles, Day 2 fourball better ball) while the event's own board counts the lot, and it is what finally makes `dayBoards` — separate days / one running total / days and overall — mean something on screen (`boardGrouping` in `lib/leagueSetup.ts` is the one copy of what the three answers do; `separate` sets the overall boards *aside*, never deletes them). `withOnlyRounds` in `lib/boardRows.ts` is the only copy of narrowing a context to some rounds, and **both callers go through it**: a board's own scope inside `buildRows`, and the leaderboard's per-course switch (events only, a choice of one course or null for the lot, modelled on the stats page's Courses view). Per-day formats are edited at `/trip/[code]/organiser/days`; the scope is **seeded onto the draft** when a board is made there rather than stamped on afterwards, because the scope is part of what makes two boards different competitions and a day's Stableford stamped after the fact would be refused as a clash with the event's own.
- **The platform has run a full live trip**: North West 26, August 2026 — live scoring, leaderboards and teams, end to end. That trip's rows are real history, never test data. This is ongoing platform work now, on no fixed date.
- A **lead player** creates a trip — no account required, open access for now. Trip creation offers the leaderboard picker too (the same embedded `LeaderboardSetup`, unified with the league wizard) but **skippable**: nothing chosen writes nothing, the trip is byte-for-byte what the wizard always made, and the competition stays Trip Setup's question
- A **6-character alphanumeric trip code** is generated on creation (e.g. `GX7K2P`)
- Other players join by entering the trip code at `/join`
- All trip data is scoped by `trip_id` — no data leaks between trips
- No auth gate yet — trip code is the only access control
- **Installable as a home-screen app** — manifest + icons generated at build
  from `lib/iconTile.tsx`, no service worker, App Store deliberately
  deferred: `docs/ios-app.md`. The installed app has its own cookie jar, so
  a player claims their name once more on first launch
- **Anyone can add a course** from the course picker. Courses are shared
  platform rows (`trip_id IS NULL`), so an addition is for everyone. A new
  course has no holes and `card_verified = false` until a scorecard photo is
  confirmed — the card check creates the 18 holes from the first trusted
  photo (`mode: 'create'`) and flips the flag; scoring is gated until then.
  **`courses`, `holes` and `tees` are read-only to the browser** — migration
  040 gives them RLS with a read policy and no write policy, so every change
  goes through the server on the service role. A client-side write to any of
  the three now fails with an RLS error rather than succeeding quietly, which
  is the point: they are shared platform rows and a bad one is bad for
  everyone. `docs/gotchas-and-debt.md` has what is still open and why
- **Courses can also arrive in bulk**, from researched data rather than a
  photo: `data/courses/*.json` → `npm test` → `npm run courses:migration` →
  a migration somebody applies by hand. `docs/course-import.md`. A bulk
  course has its holes (so it plays) and `card_verified = false` (so the
  badge stays honest); the first scorecard photo then takes the **diff**
  path and corrects whatever the research got wrong. **Two halves of a course
  may each be absent, independently, and the absence is always declared** —
  `holes: []` with `holesConfidence: NONE` for a club that publishes no card,
  `tees: []` with `teesConfidence: NONE` for one that publishes no rating and
  slope, which in Ireland is most of them (cards print SSS). Either way the
  course is searchable and weathered and scoring is gated; a photo creates the
  eighteen, ratings come through `data/course-tees/`. **`data/course-tees/*.json` is the other
  door**: better ratings for a course already here, upserted, with `par`
  derived from the stored holes rather than the file. The research half runs
  in Cowork — Claude Code's container cannot reach club websites

## Routing

| Route | Purpose |
|---|---|
| `/` | Landing — event code typed in place (Join Event), or Create an Event → `/golf` |
| `/golf` | The golf doorway: Golf Trip, Golf Tournament (`/dashboard/create?type=tournament`), Personal usage (coming soon) |
| `/join` | Enter trip code — kept for shared `?code=` links |
| `/[code]` | The short link — `greendot.live/GX7K2P` redirects to `/trip/[code]` (case-insensitive; a route, not a config redirect, so real pages always win — "tennis" is code-shaped) |
| `/trip/[tripCode]` | Trip hub |
| `/trip/[tripCode]/setup` | Formats, players, finalise/unlock |
| `/trip/[tripCode]/organiser` | Event Hub admin (events only, behind the organiser PIN) — notices, round starts |
| `/trip/[tripCode]/organiser/tags` | The tags portal — make the sides, assign players, rank them |
| `/trip/[tripCode]/organiser/days` | A format for each day — a board scoped to one round |
| `/trip/[tripCode]/teams` | Team assignment |
| `/trip/[tripCode]/players` | Join / claim a player slot |
| `/trip/[tripCode]/round/[roundNumber]` | Round summary — card, tees, result |
| `/trip/[tripCode]/scoring` | Round picker |
| `/trip/[tripCode]/scoring/[roundNumber]` | Live scoring |
| `/trip/[tripCode]/leaderboard` | Leaderboard tabs |
| `/trip/[tripCode]/export` | The trip on paper — section checkboxes, Save as PDF via the print dialog, committed scores only. First step of retiring a legacy trip — `docs/features.md` |
| `/dashboard` | Lead player's trip list (future — post auth) |
| `/dashboard/create` | Trip creation wizard |
| `/admin` | Owner-only, unlinked, password-gated. Three sections: trips (search, delete), live cards (close/void a hung scorecard), courses (edit names, counties, tees; card read-only) — `docs/features.md` |

## Key files

| File | Purpose |
|---|---|
| `lib/leaderboards.ts` | Current leaderboard model. Also the registry for **tag modes** (`TAG_MODES`) and **which golf a board counts** (`Leaderboard.roundIds`) — see the two entries below |
| `lib/tiebreak.ts` | **Two players level, and what happens next — the only copy.** The three settings, the countback (back 9/6/3/2), and `placeRound`, which reads a prize table against a round's finishers. The board, the in-play panel inside the scoring card and the round summary all come through here; each used to answer it for itself |
| `lib/boardRows.ts` | Scores → leaderboard rows, per board. **`total` is always the competition's total, after any discard**; `totalAll` is the all-in figure and exists only where a round was actually dropped, for the leaderboard's Discard switch. **A casual round (`rounds.casual`) is dropped here, in `buildRows`, and nowhere else** — scored as usual, on no board; a round summary gets its result back by clearing the flag (`fetchRoundRows`). **`place` is golf's, not the row's index** — two level share one, and it is stamped after sorting so it always matches the ordering on screen |
| `lib/handicap.ts` | Shots received on a hole, and how a handicap is written and read. **A plus handicap is negative** and gives shots back from SI 18 down |
| `lib/courseHandicap.ts` | The WHS course handicap, the only copy. Unrounded is primary — an allowance comes off that, not off the whole number. Also **which tees a player may be given**: `teesForPlayer` returns their own gender's, or **every tee on the course when that gender has none** — a club with no published ladies card is a real course, and filtering strictly left a woman with nothing selectable, which disabled `canStart` for **everybody on her card**. Four screens read it; a fifth copy of `t.gender === player.gender` is how that reopens, and `test:handicap-allowance` greps for one. **It also decides the order: hardest first, by slope**, which is how a scorecard prints and how a group talks. Slope rather than name, because the names are not a sequence (Championship/Medal/Society, Sandstone/Slate/Granite); **an unrated tee sorts last, never first**, or it would be both the first offered and the resume path's fallback guess. The round summary's tee table is a display rather than a picker, so it orders in its own query — by slope now, not the course rating that merely resembled it |
| `lib/quota.ts` | **Quota play, the only copy** — the target (36 minus course handicap) and the two scales it can be earned on: **Liverpool** 1/2/3/4 and **Chicago** 1/2/4/8, off the **gross**. Above par they agree, so that half is written once. A third, 1/2/4/6, was retired for differing from Chicago at eagle alone, which is why `DEFAULT_QUOTA_SCALE` is Chicago and why boards already on it were re-scored. **The scale is the trip's**, picked when the Quota board is created and read by the board, the live panel's Quota tab and a linked knockout alike. **The handicap enters once, in the target** — an allowance reduces it there, never the per-hole points, and the stored `scores.points` are Stableford's so a quota board never reads them. Individual boards only — `docs/leaderboards.md` |
| `lib/scoreOutbox.ts` | **A hole entered on a phone that the server has not confirmed — the only copy.** Entry writes here, which cannot fail, and the queue reaches Supabase afterwards with backoff. Keyed by player/round/hole, the same key the upsert conflicts on, so a correction replaces its pending entry rather than arriving after it; a flush drops only what it sent, matched on `seq`, so a hole re-entered mid-request keeps the newer value. **The commit flushes first and refuses to run with anything queued** — `handleCommit` writes a hole missing from `live_scores` off as a no return, so committing with holes outstanding would destroy exactly what this protects. Committing or voiding discards the round's queue; entries expire after a day, which is the cross-device backstop. Pure — `app/scoring/outbox.ts` is the one wired instance |
| `app/scoring/usePoll.ts` | **Refreshing only while somebody is reading — the only copy.** Hidden or offline stops; coming back fetches immediately rather than waiting out the interval. The round dashboard polls only on its own list, never behind an open card, and the live board only while open. Neither has a `setInterval` left; `test:score-outbox` greps for one |
| `lib/scorecardVoid.ts` | Voiding a card. **Erases its scores from `live_scores` and `scores`**, not just the locks. Every void route goes through it |
| `lib/staleLive.ts` | When a scorecard nobody came back to is closed, and when its rows are deleted. **Closed on the last hole entered, never on when the card opened** — keying off `activated_at` would close a group still out on the course. Run nightly by `/api/cleanup`; `?dryRun=1` reports without writing |
| `lib/weather.ts` | Reading a MET Norway forecast: parsing, picking the hour a tee time falls in, compass, symbol grouping, the yr.no link, cache freshness. **Pure — `app/api/weather/route.ts` does all the I/O.** Two traps it exists to hold: the arrow points at `wind_from_direction + 180`, and `next_1_hours` stops existing ~3 days out so precipitation falls back to `next_6_hours`. A missing gust or rain chance is null, never 0 |
| `lib/handicapAllowance.ts` | Playing off a percentage of the course handicap. **Never stored reduced** — applied when a board reads the cards |
| `lib/leaderboardsCompat.ts` / `lib/formats.ts` / `lib/tripSetupFlow.ts` | Reading old trips' stored settings — don't extend, only read |
| `lib/roster.ts` | Who is confirmed, the join list's order, and the no-two-same-names rule. **Confirmed is `players.claimed === true`** — the column is nullable, so `!claimed` and `.eq('claimed', false)` are both wrong |
| `lib/displayNames.ts` | **What every leaderboard prints for a player — the only copy**: the trip board, the in-play panel, a round's result and the matchplay tiles (`shortNames` in `lib/matchplayEntrants.ts` delegates here now). A nickname the player chose themselves (preferences gear, `players.nickname`, migration 047) wins outright; else the **first name alone**, reaching for the surname only when first names clash — grown *together*, and cut the way surnames are built: **O'x compacts ("Ross OG" / "Ross OB"), Mc and Mac stay whole ("John Mc" / "John Mac")**. The stored name never changes; the scorecard sheet keeps it in full. **Fetch `players.nickname` on its own, fail-soft** — naming it in a shared select fails the page pre-047. Team selection used to rename real players for board space; that door is closed |
| `lib/upNext.ts` | What happens next on the trip. **Only golf can be counted down to** — a stay or a journey carries a day and nothing finer. Joins `rounds.scheduled_date` to `itinerary_items.tee_time`, the one place the two meet |
| `lib/standing.ts` / `lib/hubStanding.ts` | Where a player stands. Two paths: one query for an individual Stableford total, the full `buildRows` context for anything else. `test:hub` holds them against each other |
| `lib/rowContext.ts` | Raw rows → a `RowContext`, via `buildRowContext`. **The only assembly there is** — the leaderboard and the hub both call it. Fetching is each caller's own; deciding never is |
| `lib/holeStats.ts` | Putts and fairways → greens in regulation, accuracy, hole difficulty, and gained on the field. **The only copy of every one of those rules** — nothing on a screen derives any of them. Greens in regulation is never a stored column: it needs the player's own par. Gains are **gross and self-excluding**, which is what makes them sum to zero over a hole |
| `lib/courseDirectory.ts` | The course picker's rules and the add-course gate: search, the county chips (the **only** filter — `courses.county`, migration 032, asked for by the form; parsing `location` survives only as the fallback for older rows), slugs, and validation for a new course's name, county, website and tees. `countyOf` canonicalises — prefixes off, **Derry not Londonderry**. **Tee ranges are `TEE_COLUMN_RANGE` from `lib/cardCheck.ts`** — one copy, or the form would accept what the check refuses. `app/api/courses` writes; this only decides |
| `lib/courseImport.ts` | The bulk-course contract: what a `data/courses/*.json` file must be before it can become a migration. **Reuses `validateNewHoleRows`, `validNewTee`, `countyOf`, `normalizeWebsite` and `truncCoord` rather than restating any of them** — a research file's holes *are* `NewHoleRow[]`, DB column names and all, so there is no adapter to drift. It adds only what the app layer cannot know, chiefly that **`holes.par` is CHECKed 3 to 5 in Postgres while every app validator allows 3 to 6**, so a par-6 hole passes the card check and then kills the migration. The tee-par cross-check is `diffCard` with the tee pars nulled, not a second sum. A repeated slug is fatal, not a skipped row: `ON CONFLICT DO NOTHING` drops the course and the holes insert then joins onto the *existing* one. Pure — `scripts/build-course-migration.ts` reads and writes |
| `lib/courseLookup.ts` | Reading ratings off a club website for the add-course form: HTML→text, which same-origin links to follow, the Sonnet prompt/schema, and clamping what comes back to the card-check ranges (a bad figure costs the field, never the lookup). **Everything it returns is a suggestion the person confirms.** Pure — `app/api/course-lookup/` fetches and asks |
| `app/components/CourseSelect.tsx` | The course picker: search + county chips pinned over a scrolling list, and the add-course form (name, county — required, with the thirty-two as suggestions — website lookup, tees, then a scorecard ask via `CardCheck`). No autofocus on the form: the keyboard arrives when a finger asks, not with the sheet. Replaces the old native select in the golf sheet. A course added mid-build lives in `ItineraryBuilder`'s own `addedCourses` state — callers' fetched lists are never mutated |
| `lib/courseCard.ts` | A course's card, two nines with their pars. **One set of numbers, never two** — the ladies card or the men's, decided by who is holding the phone. No yardages: those columns have never held a value |
| `lib/nextMatch.ts` | The next tie: opponent known, undecided, a bye, or out. In a pairs draw the entrant is the pairing on *that draw's* sheet |
| `lib/matchDecision.ts` | **Deciding a knockout match from the cards — the only copy.** The eight methods, the per-hole card that makes a pairing read like a player, when a match is over, and "3&2". A **matchplay** nett is the *difference* off the lowest handicap in the match; a **total** nett is each player off their own. Better ball comes from `lib/teamScoring.ts` (`bestOnHole`), not restated. Pure — `lib/matchResults.ts` is the half that turns a `RowContext` into what it asks for |
| `app/components/CourseWeather.tsx` | The weather, in two shapes from one component — the round page's block and the hub's one line — so the two cannot disagree about the same course. Fetched in the browser: the hub does not know which round is next until hydration. **The line variant renders no anchor**, because the up-next block it sits in is already inside a `<Link>` |
| `app/components/Section.tsx` | The collapsible hub sections. One open at a time — the stack owns that, not the section |
| `app/trip/[tripCode]/layout.tsx` | The bottom bar, drawn **once for the whole trip subtree and never by a page**. A page that renders its own tears the bar off the screen on every navigation, because a component rendered by a page unmounts with it. Pages still carry `has-tabbar` — the page is what scrolls |
| `app/trip/[tripCode]/**/loading.tsx` | Why a tab feels instant. Without a loading file Next holds the current page, fully painted, until the next one's queries come back — and every trip route is `force-dynamic`, so that was seconds of a screen that gave no sign of having been tapped. It is also the only part of these routes a prefetch can warm. Six of them; `docs/design-system.md` has the split and the rule about not promising a shape |
| `app/components/TabBar.tsx` | The five tabs, identical on purpose — the leaderboard holds the centre and position is the whole emphasis; the emerald circle around it was tried and retired. **An event's field sees four**: Trip Setup is dropped for tournaments (the organiser area is the one door into setup), decided by the layout's cached one-column `kind` read. **A tab lights on `active` *or* `pending`** — `active` comes from the pathname, which does not change until the destination has rendered on the server, so lighting on it alone means the tap looks like nothing for as long as the query takes |
| `lib/currentPlayer.ts` | Cookie → the player holding this phone, matched against this trip's roster. **Personalises, never authorises**. Read on the server by the hub, the stats page and a round summary — so **anything that changes the cookie must `router.refresh()` before it navigates**, or the router serves back a page it rendered for whoever this device was a moment ago. That is the whole of the "claiming doesn't stick" bug, and the cookie was never the part that was wrong. For the same reason **no link may force a full `prefetch` of those three routes** |
| `lib/intro.ts` / `app/components/SiteIntro.tsx` | The site intro — the solid sweep, run once per device on the trip hub: after a beat the wordmark's emerald dot swells into one huge solid disc whose curved edge sweeps up across the lower screen like a tile, carrying the cream writing — a title and one paragraph per tap, or per **swipe** (left forward, right back; arrow keys too). Above the sweep, **the page being described floats as a small framed card** — hand-drawn SVG miniatures (`public/intro/`, seven artboards at 360×728 with their own lit tab bar, a few KB each, regenerated by `npm run intro:shots` from `scripts/make-intro-shots.mjs`) — openly an illustration, never pretending to be the real page; cards **slide sideways** between pages and each paragraph rings its feature on the card via artboard-coordinate `focus` regions, plain scaling, no cover-fit maths. Behind everything sits a solid cream sheet — no blur, no see-through — and the disc shrinks home into the logo at the end. Gated by the `gg_intro` cookie — **once per device, not per trip** (hub page checks the jar on the server; skip and finish both write it) — and `?intro` on the hub URL overrides it, for demos and for testing on a phone that has already seen it. The one thing measured at runtime is the logo dot, the `<g fill="#0a9d56">` inside `.gd-mark` — queried fresh on every touch because React re-applies the wordmark's innerHTML once after hydration — and a dot that cannot be found costs the birth its bloom, never the user their screen; the sweep's circle is solved from the live viewport (radius from the wanted edge drop), which is what the full-bleed predecessor got wrong about Safari's chrome. Motion is the putt curve, 420–900ms behind a deliberate ~600ms opening pause — a documented exception scoped to the component (Motion, `docs/design-system.md`), which is why its durations and the card-slide keyframes live there (a component `<style>` tag) and not in `globals.css`, where `test:branding`'s ceilings would refuse them. `ART_W`/`ART_H` in the component must match the generator's `W`/`H`. The sheet, sweep, card frame and ring colours live in `globals.css` (`.intro-*`) |
| `lib/theme.ts` | Dark mode: the `dark` class on `<html>`, the `gg_theme` cookie, and the head script that applies both before first paint — **the only writer of all three**. The toggle is the gear on the trip hub (`PlayerSettings`), **claimed players only**, saved to `players.dark_mode` (migration 044) so it follows them across devices; the cookie is the device-local echo and both database touches fail soft, so the code runs before the migration has. The palette is the same eight tokens re-pointed under `html.dark` — and two build traps hold that up: each `--color-*` token in `globals.css` must stay a `var(--gd-*)` reference (a literal gets folded into every `/65`-style tint at build time), and `package.json` must keep its modern `browserslist` (without it the build strips the `color-mix` the tints compile to). `test:branding` pins both, and the dark palette's contrast — `docs/design-system.md` |
| `lib/cardCheck.ts` | Confirming the course record against a photo of the printed scorecard, from the pick-player screen. **Pure** — types, validation (a stroke index column must be a permutation of 1–18; the ladies card is all or nothing; a misread never reaches a diff), the diff, and the whitelist the apply route checks writes against. `app/api/card-check/` does the I/O: extraction via the Claude API, then apply after the person says yes. **The photo is only ever the challenger** — a card with no ladies row never erases a stored one. Applying re-fires the Stableford trigger on the asking trip's committed scores for that course, so corrected pars re-tell the leaderboard; **the most recent photo wins** — each apply overwrites, nothing merges. Courses are shared platform rows, so a correction is a correction for everyone, which is the point. **A course with no holes gets its card here**: the first trusted photo is offered back whole (`mode: 'create'`), apply inserts the 18 holes and any fully-rated tees, and either path — create, apply, or an exact match — sets `courses.card_verified` |
| `lib/eventPermissions.ts` | **What an event's field may do for itself, the only copy** — the registry (key, label, hint, default; all off) that the creation toggles, the admin page, the parser and the defaults all derive from, so a new permission is one line here and nowhere else. `allowsParticipant` is the one copy of "trips are untouched": not an event → yes, always. A UI gate in the same honest sense as the PIN — the trip code is still the only access control |
| `lib/eventHub.ts` | **The Event Hub's rules, the only copy** — what counts as an event (`isEvent`, fail-soft over `trips.kind`), the notice cap and normaliser (folding delegated to `lib/tripLimits.ts`), and the start formats with their schedule wording (`describeStart`, clock through `describeTime`) |
| `lib/bracketSetup.ts` | **The tournament bracket setup, the only copy** — the organiser's seven answers (format, strict/relaxed mode, 16/32/64/128 size, entry, qualifying + seeding, per-round deadlines, finalisation) and everything about them: round counts and names (via `lib/matchplay.ts`'s `roundName`), the deadlines-never-run-backwards rule, the open-questions gate, and `parseBracketSetup`, which returns a complete setup or null — **the database only ever holds a whole one**; drafts live in the form's own state. League is in the type because both formats share the column; each format's parser refuses the other's object |
| `lib/leagueSetup.ts` | **A league event's rules, the only copy** — the answers the rounds cannot carry (the shape in time — `LeagueSchedule`, absent = standalone — a weekly repeat's day, entry method, require-approval, how the days relate on the board), the ceilings (`MAX_ROUNDS` for standalone, `MAX_LEAGUE_DAYS` for continuous and series), `weeklyDates` ("every Wednesday for the summer" as a list), and `starterBoards()`, the individual-Stableford-total board every league's creation is seeded with — the Finish step's embedded `LeaderboardSetup` edits from there. Deliberately does **not** store single-vs-multi day, day count or venues — the rounds and the trip dates are the one copy of those. Shares `trips.bracket_setup` with the knockout, discriminated on `format` |
| `lib/roundHandicaps.ts` | The `round_handicaps` snapshot, written on a handicap edit and when somebody joins after the rounds exist |
| `lib/teamLimits.ts` | Team size rules, pairing wording |
| `lib/tagBoards.ts` | **Tags — an event's overarching grouping, the only copy of its rules.** A tag is the side a player carries all week while the fourballs change daily. Under the hood **a tag IS a team on the main sheet** (`TAG_SET = MAIN_SET`), which is the decision everything else rests on: the main sheet is the one `players.team_id` mirrors, so every coloured dot the platform draws already shows the tag with no query changed, and `UNIQUE(player_id, team_set)` is already one-tag-per-player. **No migration for any of it.** Also the tee-sheet gate — `tagGateReason` (an untagged player cannot be *added*, never evicted) and `dayTeamTagIssue` (a team's card counts towards one tag, so a team is of one), plus `tagOfTeam`, which returns null for a mixed team rather than crediting whoever was first. Pure |
| `lib/matchplayEntrants.ts` | Player/pairing shape and naming |
| `lib/itinerarySync.ts` / `lib/itineraryStore.ts` | Itinerary diff-and-write. **`toItemRow` is the only row mapping** — trip creation had a second copy of it, field for field, and a kind gaining a column reached one writer and not the other. **The golf lock is per round** (`touchesLockedGolf`): a round with scores can't be removed or re-coursed, everything else — adding golf mid-trip included — stays open. **Moving the trip's dates re-dates its rounds** (`roundDateGroups` decides, `rescheduleRounds` writes, Trip Settings' `saveDates` calls it): a golf item holds a day *index* so the itinerary re-dates itself instantly, while `rounds.scheduled_date` is stored and did not follow — the hub countdown, the up-next card, the round summary and the weather all quoted the old dates under an itinerary showing the new ones. No start date re-dates nothing, or a series event's rounds would have their dates erased |
| `supabase/migrations/` | All schema changes, in order. **Migration 010 has a one-time backfill — never replay it**: it flips every draft trip to live. `scripts/migrate.ts` now enforces that rather than trusting the reader — a bare run lists and stops, and the whole folder needs `--all` plus `ALLOW_REPLAY=1`. Run one file by name; for a single migration the Supabase SQL editor is easier still |
| `config/site.ts` | Global platform branding |

## Stableford scoring (canonical — never restate or vary this elsewhere)

```
shots_received = FLOOR(handicap / 18) + (1 if stroke_index <= handicap % 18 else 0)
net_score = gross_score - shots_received
points = GREATEST(0, par + 2 - net_score)
```

**A plus handicap is the mirror of that, and is stored as a negative number.** A player better than scratch GIVES shots back, from the easiest hole down — a +1 gives one back on SI 18 and is level par by birdieing it and paring the other seventeen. `shots_received` is negative for them:

```
given_back    = FLOOR(|handicap| / 18) + (1 if stroke_index >= 19 - |handicap| % 18 else 0)
shots_received = -given_back
```

Never write either of these out again: `lib/handicap.ts` is the only copy, and `shots_received()` in migration 024 is the SQL twin the trigger calls. It was written out five times and every copy had the plus case wrong — `stroke_index <= -1` is false on all eighteen holes, so only `FLOOR(-1/18) = -1` survived and a +1 gave a shot back everywhere. `test:handicap` runs the two implementations against each other for every handicap on every stroke index.

Calculated by the Postgres trigger `trg_scores_stableford` on every insert/update to `scores`. Full detail (WHS playing-handicap formula, player states, tee data): `docs/schema-and-scoring.md`.

`handicap` here is always the **full** course handicap. A competition allowance (85% for a four-ball, 95% for a singles) belongs to the leaderboard, not to the card: it is applied when a board reads the scores and is never written to `round_handicaps` or `scores`. Store it reduced and a second board on a different allowance can no longer be scored. The percentage comes off the *unrounded* course handicap — 11.63 shows as 12, but 90% of those two are a shot apart.

**`round_handicaps.playing_handicap` starts life as the handicap _index_**, not a course handicap — creation, finalise and every handicap edit write it before any tee exists. Anything holding a tee must compute from the tee instead of trusting that snapshot. **And anything read mid-round must fetch the row rather than accept it as a prop**: `lockPlayers` replaces the index with the real course handicap and the tee when a session starts, which is *after* the page rendered, so a page-load snapshot is the index. That is how the live board came to show 10 where the card showed 13 — `docs/gotchas-and-debt.md`.

## Stats

Two answers a hole — putts, and which way the tee shot went — recorded per
player on the scorecard when a trip switches `trips.track_stats` on in the
Trip Settings drawer. Off by default. Everything else is derived in
`lib/holeStats.ts`, and that is the only copy: full detail in
`docs/features.md`.

The hub at `/trip/[code]/stats` is **pure views over one fetched
`HoleStat[]`** — every toggle is client-side filtering, and **the filter
narrows the holes, never the field**: a gain on one course is measured
against everybody's play of that course, whoever is selected. **The course
picker is a choice of one** — `null` for every course or a single id, never a
set — so no tap can leave the page with no holes on it and nothing has to
guard against it. **Net gained is strokes by apportionment**: the round's
playing-handicap snapshot shared over the holes by `holeAllocation` — CH/18
with a straight-line tilt across the stroke index, and **a plus handicap
mirrors through SI 19 − i, never a bare sign flip** (the same trap as
`shotsReceived`, held in the same one-copy discipline). The share of each
hole's allocation given to putting is the advanced setting — fixed fifth by
default, 2/par selectable — and it can only ever move the split, never a
total. Tee-to-green further splits into **driving accuracy** (a bet on the
pooled penalty for missing the fairway) and **approach** (the remainder, so
the halves add exactly). The hero pentagon and trend read **finalised holes
only**; the panels keep counting an open card. Charts are hand-drawn SVG;
polarity is encoded by side-of-zero, never by the emerald/rust pair alone,
which a colour-blind reader cannot split.

Four things that are easy to get wrong twice:

- **Greens in regulation is never stored.** It needs `effectivePar` for the
  player holding the card, so a stored column would be a second answer
  waiting to drift from the first.
- **Gained on the field is gross, and excludes the player from their own
  field average.** Both halves come off the same subset, so putting plus
  tee-to-green is exactly the gain in gross shots, and the gains over a hole
  sum to zero. No handicap appears anywhere in that file.
- **The two columns exist on both score tables under the same names**, so a
  commit copies a row rather than translating it. `scores.putts` has no
  upper bound against the gross for the same reason `live_scores.putts` has
  none — a commit that fails on the eighteenth green is the worse failure, so
  an impossible card is dropped on the way in instead.
- **Stats are editable wherever the gross is.** The Edit Scorecard screen
  renders the same `StatsRow` the live tile does — one implementation, in
  `LiveScoringFlow.tsx`, gated the same way on both screens. It edited the
  gross alone for one release; that gap is closed, and a second copy of the
  control is how it would reopen.

## Two orderings, on purpose

`lib/boardRows.ts` `sortRows` is the leaderboard's order: by total, then the tie rule, then alphabetically by name. **`orderRowsUndiscarded` is not a second one** — it is the same comparator, `rowOrder`, reading `totalAll` instead of `total` for the leaderboard's Discard switch. Add an ordering by extending `rowOrder`, never beside it. `lib/playerSummary.ts` `standings` is the hub's cheap path for an individual Stableford total, and `test:hub` holds the two against each other.

**There was a third**, `compareRows` in `app/scoring/LiveLeaderboardPanel.tsx`, and it disagreed: it broke a Stableford tie by countback where `sortRows` broke it by name, so two players level could be ordered one way on the in-play panel inside the scoring card and the other way on the trip leaderboard. That is settled — the countback is `lib/tiebreak.ts` now and both read it. The panel still does not ask what the trip's board is set to, deliberately: it is the card in your hand mid-round, and countback is what a group on the eighteenth green means by who won.

## Breaking ties

`lib/tiebreak.ts` is the only copy of the rule, and of the countback. **Only a prizes board (`combine: 'position'`) answers it** (`tieBreak`) — a tie is a prizes question, and on a board that just adds rounds up, level players share the place: `offersTieBreak` is the gate and `parseLeaderboards` drops the answer off any totals board, including the countback the form used to seed onto every board. Three answers: **Tiebreak** splits level players on the cards — back 9, then 6, then 3, then 2 — **Everybody Wins** pays each of them the better prize, **Even Split** pools those prizes and shares them. A tie the cards cannot split is shared, whichever way the board is set. The in-play panel keeps its mid-round countback regardless — that is the card in your hand, not a board.

**Absent means Even Split** — what every board did before the question existed, so no trip already stored is re-scored. A prizes board being *made* is seeded with Tiebreak when “points by position” is picked, and the answer is cleared if it stops paying by position. Two different defaults for two different questions.

**Rounds added up have no back nine**, so `overallTie` is a second answer under Tiebreak: leave the trip total level (the default), or break it on the last round both played and neither dropped. **A board counting a single round is always broken**, because there the total is that card — which is how a round summary gets it. `countbackByRound` is carried on a row only when the overall tie is broken that way, so `orderRowsUndiscarded` cannot break one the board was told to leave.

Reading a prize table against a round's finishers is `placeRound`, in that same file, because what two level players are *worth* is the tie rule. `lib/customPoints.ts` owns the table itself and nothing about ties. `BoardRow.place` is golf's — two level are both 1st and the next is 3rd. **A countback says so on the round tile, not on the board** — "Back 9", above View, on the round it was read off (`tieBadgeRoundId`). A badge hanging off the total pushed the one pinned column that must not move. Full detail: `docs/leaderboards.md`.

## Deciding a knockout from the cards

A bracket round can be linked to a round of golf (`roundLinks` on the matchplay board, in `trips.leaderboards` — no migration) and told how a match is settled: Stableford matchplay, total Stableford, strokes matchplay or total in gross or nett, or total quota.

**A quota is scored on the trip's own scale** — chosen once, on its Quota leaderboard (`quotaScale`), and read by everything. A link may override it for the knockout alone (`RoundLink.quotaScale`); the order is link, then trip, then default, resolved in `readBracket` and nowhere else.

**The link is stored by bracket round *number*, never its name** — a field growing from seven to nine turns a Quarter-Final into a Round of 16 and shifts every name.

Three rules that are the whole design:

- **A halved match is left halved.** A knockout needs somebody through and the cards did not say who; the tile reads All Square and a person records it. Inventing one from a seeding would put a name on a result nobody played.
- **Auto-apply only ever fills an empty match**, and runs **in the browser when the bracket is opened**, never in the page's render — looking at a draw must not change it. So a correction typed in by hand sticks, and reopening is a no-op. A card edited afterwards shows as **Cards disagree**, never a silent rewrite.
- **A hole-by-hole method settles early; a total cannot.** Three up with two to play is over. A total is not settled until both cards are complete, because the eighteenth turns over any lead.

Full detail — the handicap conventions, the pairs reading, the quota scales: `docs/leaderboards.md`.

## Making a tab feel fast

Every trip route is `force-dynamic`, so what a tab press costs is the number of database round trips the page makes **one after another** before it can send anything. `loading.tsx` already makes the tap itself feel instant; the work is in how long the skeleton then sits there. Four rules, in the order worth reaching for them:

- **Anything that only needs `trip.id` goes in the same `Promise.all`.** The usual bug is a helper awaited on its own at the bottom of a page — and a helper is rarely one query: `fetchRoundRows` goes through `fetchTripContext`, which is a rounds lookup and then nine more.
- **A dependent first query is usually an embed, not a hop.** Every trip page starts with `trips` by code and then wants something scoped by `trip.id`. PostgREST will do that join: `.select('*, rounds(*, courses(id, name))')` with `.order(col, { referencedTable: 'rounds' })`. The leaderboard does this.
- **Start the slow optional thing, don't await it, and hand the promise to a `<Suspense>`.** The fetch goes out with the batch and the page stops waiting for it. The round summary's podium is the worked example. `.catch()` it — a promise nobody is awaiting yet is an unhandled rejection — and resolve to the shape the helper already returns on failure.
- **A `<Suspense>` fallback follows the `loading.tsx` rule: never promise a shape you might not draw.** The podium's fallback is `null`, because a round nobody has played has no result section at all and a skeleton would appear and then vanish on exactly those rounds. This also rules Suspense *out* where the data decides whether a section exists — the hub's Stats heading only appears once a hole has been recorded, so it stays inline.

**A list fetched for a control behind a tap does not belong on the server — and browser-side is only half of it.** The platform course catalogue is fetched by `usePlatformCourses`, from the component that opens a picker; that got it off the critical path but not out of existence, since a component that is always mounted still pulls it on every visit. `usePlatformCourses(open)` defers it to the tap, and `AddRound` does the same with the itinerary and the players it needs. **Where the deferred list is the `before` half of a diff, a fetch that failed must block the save rather than default to `[]`** — an empty `before` against a populated `after` reads as "delete everything".

**On the scoring path, count rather than fetch.** The Scoring tab asked for every `scores` row in the trip to decide which tiles say "Scores in". `.select(col, { count: 'exact', head: true })` answers the same question in a header with no body. One request per round instead of one for the lot: on a bad radio, small and many beats large and few.

## Data insertion order

`trips` → `teams` → `players` → `courses` → `holes` → `rounds` → `round_handicaps` → `scores`

## What things are called on screen

Settled in a sitewide copy review — `docs/copy-review.md` holds the sheet, item
by item, and is the place to propose wording rather than changing strings
piecemeal. Four rules came out of it, and they are rules because each one had
three or four variants in the wild:

- **The person who made the trip is the lead player.** Not organiser, not trip
  owner, not "whoever created it". **A tournament is the exception**: the
  person who made it is the **event organiser**, never the lead player, and
  a tournament is an event, not a trip, in every sentence about one.
- **The screen at `/trip/[code]/setup` is Trip Setup** — the tab bar's fourth
  label and every sentence that points at it. **Trip Settings is the drawer
  inside it**, behind the gear: name, dates, itinerary, who can edit. Two
  similar names for two different things, deliberately.
- **Errors are calm.** "Could not X — try again", never "Failed to X" or
  "Please…".
- **One leaderboard is a leaderboard.** "Competition" is the golf sense of the
  word (as in a competition allowance), not a name for the object.

**A scoring or team-format `hint` in `lib/leaderboards.ts` is not only a hint.**
`boardRules` joins the hints into the line under a saved board's title, and
`label` becomes the board's tab, so a word changed there lands in three places.
Both need a full stop or the joined line runs on.

## CC Behaviour

- Act immediately on single-file, routine changes — no need to ask first.
- Pause and confirm first for anything multi-file, or touching schema/migrations: list what's about to change, then wait for a yes.
- Build in stages — test between dependent steps, don't chain too many changes at once.
- **Always push to `master`. Never a branch, never a PR** — `master` is what Vercel deploys to greendot.live, so work anywhere else is invisible to Big Dog. If a session is started on a branch (some tooling does this automatically), say so at the start and push to `master` anyway. Reaffirmed deliberately, not by default: see "Pushing straight to production" below.
- Before reporting a fix as done, check that what was tested is what is deployed: `git log --oneline origin/master -1`. A screenshot from greendot.live is always `master`, never the working tree — a fix left on an unmerged branch comes back as "that didn't work" when the fix was fine and simply not live.
- Never expose the service role key client-side.
- All queries must filter by `trip_id`.
- When changing a function's signature, grep every call site by function name (not by argument variable names) and check each by hand.
- Scale verification effort to the change's risk — table in `docs/testing-and-data.md`. `npm test`, typecheck and build are the floor for everything.
- Keep this file current — a decision made but not written here causes inconsistency across sessions.

## Pushing straight to production

Every push to `master` deploys to greendot.live within a minute or two. There is no staging step and, by decision, no branch to check first. The condition on that decision used to be "while there are no live trips"; the first full live trip has now run (August 2026, completed successfully), so the condition reads by **trip state**, not by launch:

- **Between trips** the cost of a bad deploy is a few minutes of a broken site with nobody mid-round on it — which is what keeps push-to-master cheap.
- **While a trip is live**, the same deploy lands on every phone at once, mid-round, and there is no way to tell anyone to wait. In that window, anything worth eyeballing first goes to the preview path below.
- The safety net is the test suite, which is structural: it catches a component that stopped rendering, a rule that changed, a colour that fails contrast. It cannot tell whether a screen *looks right on a phone*. That check happens on greendot.live, after the fact.
- **Instant Rollback is the real backstop.** Vercel keeps every past deployment; the project dashboard has a one-click rollback on each. Live again in about thirty seconds, and it needs nobody's help. Reach for this first when something ships broken, before debugging under pressure.

**The preview path, for live-trip windows:** Vercel builds a preview deployment for any branch push, on its own URL, with no setup — the protected environment for anything worth eyeballing before the field sees it. Two things to know before relying on it: preview shares the production Supabase, so it is safe for looking and not for writing test data; and `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be ticked for **Preview** in the Vercel environment variables, or preview builds fail on the same "Missing Supabase environment variables" error a local build without a `.env` hits.

### The stop hook that cries wolf

Sessions are often started on a `claude/…` branch by the tooling. The stop hook does not read the branch's configured upstream — it looks for a *remote branch of the same name*, and one is created at session start. Since every push goes to `master`, that ref never moves, and the hook reports a climbing count of "unpushed commits" that were all pushed.

The fix is one command, not a nineteen-turn argument: `git checkout -B master <current HEAD>` with a clean tree. Same commit, no file touched, and the hook then compares `master` against `origin/master` and finds nothing. Do it early rather than declining the hook repeatedly.

## Terminal use — last resort only

Prefer built-in file/commit/push tools, the GitHub website, or a committed SQL migration file over a terminal command. If the terminal is genuinely the only option, explain what the command does before running it — never run one silently.

### Never discard uncommitted work — this keeps happening

`git checkout -- <file>`, `git checkout HEAD -- <file>`, `git stash`, `git restore` and `git reset --hard` all throw away uncommitted changes **silently and unrecoverably**. There is no reflog for a working tree that was never committed. This has bitten more than once, both times in the same shape: hours of edits sitting unstaged, a "quick revert" of something unrelated, and the real work gone with it.

The trap is that the intent is always innocent — undoing a temporary edit, cleaning up after an experiment, reverting a deliberately-broken file used to check that a test fails. The command does exactly what it says; it just also takes everything else in that file.

**The rule: commit before running any command that can discard changes.** A commit can be amended, reworded, or reverted later — nothing is lost by making one early. Specifically:

- Finish the work and **commit it first**, then experiment. Never the other way round.
- To temporarily break a file (checking a test really fails, isolating a cause), commit the real work first, then mutate, then `git checkout HEAD -- <file>` to restore. That restores to the commit, which is what you want.
- Never `git stash` as a way to "see the old version" — use `git show HEAD:<path>` or `git diff`, which read without touching the working tree.
- `git stash --staged` stashes the *staged* changes, so `git add -A` followed by it empties the working tree. Two different mistakes with the same result.
- Before any destructive git command, run `git status` and read it. If anything is modified and uncommitted, commit it first.

If work is lost anyway: say so plainly, redo it, and re-run the full verification from scratch — a redo from memory is not the same as the original and cannot be assumed correct.
