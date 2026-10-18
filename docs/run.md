# Green Dot Run

The platform's second sport: an ongoing **team running challenge** — a
month, a quarter — where runs earn points by the challenge's rules and teams
climb a leaderboard. Corporate team challenges are the target.

## The model

A run challenge **is a `trips` row with `kind = 'run'`** (migration 052). It
reuses golf's machinery wholesale:

| Reused from golf | How |
|---|---|
| The 6-character code, joining by code | Same `trip_code`; the trip layout redirects `/trip/[code]` → `/run/[code]` |
| The organiser PIN | `settings_passcode_hash`, the same `PasscodeGate`, the same session unlock |
| The confirmation email | Same route and claim; `sport: 'run'` swaps the words, never the shape |
| Teams | `teams` + `team_members` on the main sheet, written through `setTeam` |
| Permissions | `trips.event_permissions`, under run-only keys (`RUN_PERMISSIONS`) |

What golf has no column for lives in **`trips.run_setup`** (jsonb):

- **rules** — how a run earns points: points per km, points per run, the
  shortest run that counts (inclusive: "1 km or more"), a daily limit on the
  *day* (a morning 10k and an evening 5k share it), and which activities
  count (run, trail run, treadmill on by default; walk and hike offered).
- **boards** — who is ranked: individuals, and teams on their **average per
  member** (default — fair when teams differ in size, and a teammate who
  never runs pulls the average down) or their **total**. A list from day
  one, so a sub-leaderboard is a new entry, not a restructure.

**Points are never stored.** A board reads the runs and applies the rules
each time it is drawn, so changing a rule mid-challenge re-tells the board.
`lib/runChallenge.ts` is the only copy of every rule; `test:run-challenge`
holds it, mutation-tested.

## Routes

| Route | What |
|---|---|
| `/create` | Which sport — Golf or Running |
| `/dashboard/create?type=run` | The four-step wizard: challenge, teams, points, finish (permissions + PIN) |
| `/run/[code]` | The challenge's home |
| `/run/[code]/join` | Joining: who you are, then which team |
| `/run/[code]/add` | The Add tab: log a run, your own runs, Strava's place |
| `/run/[code]/leaderboard` | The leaderboard — a tab per board in the setup |
| `/run/[code]/stats` | Named, marked coming soon |
| `/run/[code]/settings` | Who this phone is, Strava's place, the door to the organiser area |
| `/run/[code]/organiser` | The organiser area, behind the PIN |
| `/api/run/runs` | The one writer of typed-in runs (POST, DELETE) |
| `/api/run/me/delete` | Leave and delete my data — the runner this phone joined as, everything, confirmed in writing |
| `/api/run/strava/*` | connect, callback, webhook, disconnect, sync (POST: the runner's check; GET: the nightly job) |
| `/privacy`, `/terms` | The privacy notice and terms — every sport, static |

Every `/run/[code]` page sits under one layout that draws golf's own tab bar
with running's five tabs — Home, Add, Leaderboard (centre), Stats, Settings
(`app/components/runTabs.ts`, `TabBar sport="run"`).

`/run/` is its own route tree so that **no golf screen changes for it** —
which matters because a deploy lands on every phone at once if a golf trip
is live. The redirect lives in the trip layout because every way into an
event (the landing page's code box, `/join`, the short link) reaches it.

## Who's who

The person who makes a challenge is **the organiser**, who may or may not
be running (same as a tournament). Running, they are the first player:
`is_lead`, claimed, this device's cookie, on the team they picked. Not
running, no player row exists for them. **Anyone with the PIN is an admin**
— the creation screen says to share it with anyone helping run the
challenge. The PIN is the same soft lock as golf's (`lib/passcode.ts`).

## Stages

Each stage is tested on greendot.live before the next starts.

1. **Create** — built. The sport chooser, the wizard, the email, the hub and
   a read-only organiser area (permissions save on the spot).
2. **Join and teams** — built. Enter the code, claim a name the organiser
   added (or one already joined on another phone, which only links this
   one) or add your own (`join_self`), then pick a team — or start one
   (`create_teams`). Nobody finishes joining without a team: a join writes
   new team → runner → membership (`setTeam`) and links the phone only
   after the team is set; a failed membership keeps the runner and retries
   the team alone. The organiser area edits teams in full — add, rename,
   remove once empty; add, rename, move, remove runners — each change one
   write filtered on the challenge, then `router.refresh()`.
3. **Runs and the leaderboard** — built. A `runs` table (migration 053)
   **closed to the browser both ways** — RLS on, no policies — stricter than
   the plan's read policy, because closing reads too is what guarantees a
   runner's runs only leave the database as totals. One writer
   (`/api/run/runs`: `log_runs`, the runner this phone joined as,
   `runEntryIssue` with a day's timezone grace; a runner deletes only their
   own typed-in runs) and one reader (`app/run/[tripCode]/runs.ts`, service
   role). `lib/runBoards.ts` turns runs into boards — the challenge's days
   only, the daily limit on the day, golf's shared places, teams on average
   (everyone counts) or total. The organiser can change the points rules,
   through the same `RunRulesFields` setup uses; every board re-counts. Not
   yet: the organiser removing somebody else's run — the PIN is a soft lock
   whose hash anyone can read, so a server check on it would be theatre; it
   arrives with real organiser identity or as a soft-lock action like the
   rest.
4. **Strava** — built. The runner ticks consent (their totals on this
   challenge's board; their runs only to them) and taps Connect:
   `/api/run/strava/connect` → Strava's authorise page (`activity:read`) with
   an HMAC-signed `state` naming challenge and runner → the callback checks
   the state, the granted scope, and that the Strava account feeds no other
   name here (`UNIQUE (trip_id, athlete_id)`), stores tokens in
   `strava_athletes`, links the runner in `strava_links` with the consent
   time (migration 054, both closed to the browser), pulls in their runs
   since the start, and sets up Strava's webhook if it is missing.
   The webhook answers at once and works after (`after()`). **It is
   unsigned**, so every activity event — deletes included — re-reads the
   activity with the athlete's own token, and a revoke is acted on only
   when Strava confirms it (stored token refused as unauthorised, or the
   refresh token refused *by name*). A nightly cron (`/api/run/strava/sync`,
   60 connections, inside Strava's 100 reads per 15 minutes) catches what was
   missed; the runner has Check for new runs and Disconnect on the Add tab
   and in Settings. A refused refresh is only ever a retry — a regenerated
   secret not yet in Vercel looks exactly like that, and must not wipe the
   boards. Garmin-recorded runs say so in the runner's own list
   (`runs.device_name`).

   **Then Strava's API Policy, built in** (migration 055) — see "A
   challenge's life" below. **Strava's "Powered by Strava" logo** (their API
   logo pack, unaltered, in `public/strava/` — orange for light, white for
   dark, `PoweredByStrava`) ends every Strava card and sits under any board
   counting Strava runs, a frozen one included. **The button that starts a
   connection is Strava's own "Connect with Strava"** (their button pack,
   the orange file unaltered at its 48px height, `ConnectWithStrava`) — in
   both themes, and never greyed out: until the consent box is ticked it is
   a plain button that asks for the tick, and only then the link carrying
   `consent=1`. The pack's "Compatible with Strava" logos are not used —
   they are for apps that send data *to* Strava. **Before Strava's review:**
   check Garmin's own brand guidelines against our credit wording.
5. **Sub-leaderboards** — a date window ("Week 2") or an activity filter on a
   board.

## A challenge's life, and Strava's limits

Strava's API Policy keeps an app's copy of anybody's data short-lived and
tied to its purpose, so **a Strava connection lasts for its challenge, not
for ever** — the consent says so, with room for the organiser to extend.
`lib/runChallenge.ts` holds the shape (`challengePhase`):

| Phase | When | What happens |
|---|---|---|
| upcoming | before the start | Joining and connecting are open |
| live | start to finish | Runs count; Strava keeps them arriving |
| closing | the `FINAL_GRACE_DAYS` (3) after the finish | Late uploads still count; the organiser can still extend (`RunDatesEditor`) |
| final | the night after `closesOn(end)` | Team standings frozen into `trips.run_results`; then every Strava run deleted and every link ended (forgetting accounts that feed nothing else, with Strava told) |

**What a final challenge keeps is the team standings only** — names,
colours, places, scores; no runner, not even an id (`freezeResults`). The
board shows them from then on; the runners board survives only if no Strava
run was ever part of it, because re-telling it from typed-in runs alone
would be a race nobody ran, and the same goes for a runner's own total on
the hub and Add tab. Whether a total derived from Strava runs may be kept at
all is a question for Strava (below): `FREEZE_INCLUDES_STRAVA` in
`app/api/run/finalise.ts` is the one line that changes if they say no.

The freeze is written before anything is deleted, and a failed freeze
deletes nothing — the next night tries again. Past `closesOn` the runs route
and the connect route refuse, on the same test.

**Before that, three limits** run every night whatever else fails
(`/api/run/strava/sync` GET, in this order):

- **Seven days (§6.2).** Every Strava write stamps `runs.refreshed_at`;
  any Strava run not re-confirmed within `STRAVA_CACHE_DAYS` is deleted.
  The nightly re-read keeps live ones fresh, so in practice it only bites
  when syncing has stopped — which is exactly when it must.
- **Gone on Strava (§6.3, 48 hours).** The webhook removes it at once; the
  nightly re-read catches any event that never came.
- **Thirty days after revoking (§7.4).** A confirmed revoke forgets at once.
  A connection that has not worked (`strava_athletes.last_ok_at`) for
  `DEAD_CONNECTION_DAYS` (25) is treated as revoked and forgotten — the
  only door that acts on silence, and never sooner than 25 days, so a wrong
  key or an outage costs nobody their place.

**The boards' copy (`app/run/[tripCode]/runs.ts`).** The hub, Add tab and
leaderboard read four columns a run (whose, what, when, how far, plus the
source), not whole rows, and keep a challenge's runs in Next's server cache
for `BOARD_CACHE_SECONDS` (five minutes): a busy board is a few database
reads an hour instead of one per look, which is what keeps a big challenge
inside Supabase's free data allowance. The viewer's own runs are read fresh
and laid over the copy (`withViewerRuns`), so whoever logs or removes a run,
or disconnects, sees it at once; everybody else within minutes. **No copy
older than `BOARD_MAX_AGE_MS` (ten minutes) is ever shown** — past it the
look reads the database — so a deleted Strava run leaves every board well
inside §6.3's 48 hours and no copy approaches §6.2's seven days; the privacy
notice imports that figure too. Disconnect and Leave-and-delete drop the copy
outright (`forgetBoardCopy`, `revalidateTag(…, { expire: 0 })`) so a runner
taking their data away leaves everybody's board at once. A failed read is
thrown out of the cached function so a failure is never what gets kept. The
Garmin credit is a header-only count (`GARMIN_LIKE`, `isGarmin`'s word as a
pattern), not a device read per run. **The freeze never uses the copy** —
`fetchRuns` reads whole rows straight from the database.

A sync pages through activities (three pages, 300, at most); **a list cut
short removes nothing**, because a run missing from it may be on the page
not read — that run is then kept fresh by its webhook or expires.

**Four doors forget an athlete**, and `test:run-challenge` counts them:
the confirmed revoke, Disconnect, the dead connection, the challenge
closing. **A runner deletes everything themselves** from Settings (`/api/run/me/delete`):
Strava first, while the link still names the tokens, then the player row,
which cascades to their runs, team place and link. The answer is the
written confirmation §2.5 asks for; so is Disconnect's, which says when the
tokens stayed because another challenge still uses them.

The support address is `SITE.supportEmail` (support@greendot.live); the
privacy notice imports the retention constants rather than typing
them, so it cannot promise one thing while the job does another.
`SITE.controller` is the name both pages give as the person running Green
Dot — Ross O’Grady, name only: GDPR wants the controller's identity and
contact details, and the support address is the contact. No postal address
by decision; if Green Dot ever charges, a business address service would
cover the e-commerce rule without a home address.

## Strava — the rules that shape the design

Read from Strava's API Agreement and API Policy themselves (pasted in,
October 2026 — strava.com cannot be reached from the build container).

- **Display (§2.3 vs §6.1).** §2.3 says a user's Strava data may be shown
  only to that user. §6.1 exempts apps with up to 9,999 athletes from that,
  and §5.13 forbids showing it to others *without prior express consent* —
  which is what the consent tick collects. Green Dot sits in that tier, but
  the two clauses pull against each other: **get Strava's written yes before
  a real challenge.**
- **Capacity.** A new app serves 1 athlete; the owner can raise it to 10;
  beyond that needs Strava's review. The account owning the app needs a paid
  Strava subscription.
- **Consent (§2.1).** Before any data: what is collected, how, how to
  withdraw, how to ask for deletion, and that deletion is confirmed.
  `StravaCard` says all five, before the box, with the privacy notice linked.
- **Retention (§6.2, §6.3, §7.4).** Seven days, 48 hours, thirty days —
  built in, above.
- **Deletion and access (§2.2, §2.5).** A runner sees every run held for them
  on the Add tab, and deletes everything from Settings.
- **Support and links (§2.4).** A support address; View on Strava on every
  Strava run; Manage on Strava on the connected card.
- **Garmin (§4.4).** Information derived from Garmin data credits Garmin: the
  device on the runner's own run, and a line under any board counting one —
  carried into the frozen result.
- **Privacy policy and terms (§7.3, §6.5, §7.7, §9.2).** `/privacy` carries
  the usage-data statement, the subprocessors and Strava's policy governing
  Strava data; `/terms` the third-party warranty disclaimer, in full. Both
  want a qualified read before review.
- **No AI (§5.3).** No Strava data into any AI tool — including pasting it
  into Claude to debug.

What the design does about the rest: boards show points and totals only,
never maps, routes or titles; a runner's runs are shown only to them; the
scope is `activity:read`, so Only You runs never arrive; typed-in runs mean
a challenge works before — or without — Strava's approval.

### Questions for Strava, and the email

Open, and in the email below: **§2.3 vs §6.1** (the consented board at our
tier); **§5.4**, "may not combine Strava Data with other customer data" —
our boards add Strava runs to typed-in ones, the sharpest question; **the
frozen team total** kept after the Strava runs are deleted (§5.5, §6.4);
and **§5.2**, the overlap with Strava's own club challenges.

```
To: developers@strava.com
Subject: Use-case confirmation — Green Dot (Client ID: [your ID])

Hello,

Green Dot (greendot.live) runs team running challenges for workplaces
and clubs: a few weeks or months, runs earn points by the organiser's
rules, and teams are compared on a shared leaderboard. We are under 10
athletes today and would like to confirm our design before applying to
grow.

How it works with Strava:
- Each runner connects their own account. Before connecting they see
  what is kept (type, date, distance, moving time and device of each
  run, walk or hike), how, who sees it, how long, how to withdraw and
  how to delete, and must tick an explicit consent.
- Others in that one challenge see the runner's totals only — points,
  distance, number of runs. Individual activities are shown only to the
  runner, with a "View on Strava" link. Scope is activity:read.
- A connection lasts for its challenge. Three days after the finish we
  freeze the team standings, delete every Strava activity in the
  challenge and deauthorise any account that feeds nothing else.
- Every stored activity is re-confirmed nightly and deleted if not
  confirmed within 7 days; deletions on Strava are removed by webhook
  (checked with Strava first); a revoked or dead connection is erased
  within 30 days. Runners can disconnect, or delete all their data
  themselves, and are told in writing when it is done.
- Strava data is stored server-side only and never used with AI tools.
  Our privacy notice is at greendot.live/privacy and terms at
  greendot.live/terms; support is support@greendot.live.

Could you confirm in writing:
1. That showing these consented totals to the other members of the
   same challenge is permitted (Policy §2.3, §5.13, §6.1)?
2. That adding a runner's Strava activities to runs they type in by
   hand, to make one challenge total, is not "combining Strava Data
   with other customer data" under §5.4?
3. That, once the Strava activities are deleted at a challenge's end,
   we may keep the frozen team totals (team names and scores, no
   individual data) as the challenge's result (§5.5, §6.4)?
4. Whether you see any overlap with Strava's own club challenges that
   concerns you (§5.2)? Runners can also log runs by hand, organisers
   set their own scoring, and teams of different sizes are compared on
   average per member.

Thank you,
[Your name]
```

### For the owner, as the business

- **§4.6** — no announcement or marketing post mentioning Strava without
  Strava's written consent.
- **§5.8** — no charging for the Strava part; Green Dot's own features are
  fine to charge for.
- **§8.3** — a security breach goes to legal@strava.com within 24 hours.
- **Stats** — Strava data may feed a runner's own stats, never team analysis
  (§5.4).
