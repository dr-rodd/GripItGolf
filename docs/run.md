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
4. **Strava** — connect with a consent tick, backfill since the start date,
   Strava's webhook for new, edited and deleted runs, disconnect. Tokens in a
   table the browser cannot read at all (RLS, no policies).
5. **Sub-leaderboards** — a date window ("Week 2") or an activity filter on a
   board.

## Strava — the rules that shape the design

Researched October 2026 from secondary sources (Strava's own pages were not
reachable from the build container) — **re-check before stage 4**.

- **Display.** Strava's API agreement says an app may show a user's Strava
  data **only to that user**. A leaderboard shows one runner's runs to their
  colleagues — exactly what that restricts. A clause in their policy (§6.1)
  appears to exempt apps under 9,999 athletes, but it conflicts with the
  main rule (§2.3) and Strava has not said which wins. One reported case:
  Strava required another app (Wandrer) to have users opt in before
  appearing on a leaderboard — a sign an opt-in leaderboard can pass review.
- **Capacity.** A new Strava app serves 1 athlete; the owner can raise it to
  10 without review; beyond that needs Strava's review. Since June 2026 the
  account owning the app also needs a paid Strava subscription.
- **Data handling.** Raw data cached at most 7 days; a user's data deleted
  within 30 days of them disconnecting; **no Strava data into any AI tool**
  (Policy §5.3 as reported) — which includes pasting it into Claude.

What the design does about it:

- Boards show **points and totals only** — never maps, routes or run titles.
- A **consent tick** at connect: "my run totals appear on this challenge's
  leaderboard".
- A runner's own run list is shown **only to them**.
- **Disconnecting removes their Strava runs** from the challenge.
- Typed-in runs (stage 3) mean a challenge works before — or without —
  Strava's approval, and for colleagues who don't use Strava.
- The scope asked for is `activity:read`, so a run marked "Only you" on
  Strava stays off the board.

Before stage 4, the owner creates the Strava API app (callback domain
`greendot.live`), adds its keys to Vercel, and applies for review describing
the team leaderboard plainly. Strava cannot be reached from the build
container, so Strava testing happens on greendot.live with real accounts.
