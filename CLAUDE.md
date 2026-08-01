# Green Dot Golf

A multi-trip golf platform. Any group leader creates a trip, gets a shareable code, and their group gets a full live scoring experience — courses, scorecards, leaderboards, teams.

## The name

Your handicap is the best 8 of your last 20 rounds. On a handicap graph those eight show as green dots — so a green dot is a round that counted. Every golfer teeing off is chasing one.

The mark is `app/components/GreenDot.tsx`: a glowing green dot that breathes and sends out a slow ripple. It appears beneath the wordmark on the landing page and at the top of every trip hub. Keyframes live in `app/globals.css` and are disabled under `prefers-reduced-motion`.

Gold (`#C9A84C`) remains the accent for scores and actions. Green is reserved for the dot and for live/won states — the two should not be mixed in the mark itself.

Forked from Donegal Masters — a single-trip family golf app. This project converts it into a platform where anyone can run their own trip. The Donegal Masters UX is the gold standard for look and feel.

## Who is building this

Big Dog — not a coder. Uses Claude.ai for all design decisions and Claude Code (CC) for all execution. Never ask for confirmation before making changes. Always push to remote at the end of every task.

## Working approach

- Claude.ai leads design and clarifies requirements before any CC prompt is written
- CC prompts must be: succinct, robust, copiable, targeted to specific files or components
- Chunked sequential prompts preferred — test and deploy between dependent steps
- CLI and automated approaches preferred over manual dashboard steps
- No jargon without explanation
- Do not over-specify logic the codebase already handles
- User refers to Claude Code as "CC"

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS (mobile-first)
- **Database:** Supabase (PostgreSQL + RLS)
- **Hosting:** Vercel (Hobby)
- **Repo:** github.com/dr-rodd/GripItGolf (branch: master)
- **Product name:** Green Dot Golf (repo name unchanged)
- **Supabase project ref:** bnnnnuxoczzuipefhvms
- **Package manager:** npm

## Environment variables
NEXT_PUBLIC_SUPABASE_URL=https://bnnnnuxoczzuipefhvms.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRON_SECRET=...
ADMIN_PASSWORD=...   # /admin/trips. No NEXT_PUBLIC_ prefix — server only.
NEXT_PUBLIC_DONATION_URL=...   # Revolut payment link. Unset = no support link anywhere.

Stored in `.env.local` (gitignored). Service role key must never be exposed client-side.
Vercel project: grip-it-golf (auto-deploys from master branch on GitHub)

## Design system — Green Dot Collective

`STYLE_GUIDE.md` is the source of truth; `app/globals.css` is its code. **No file outside globals.css should carry a raw brand hex.** `npm run test:branding` enforces that.

Mobile first, always. Nearly all real use is a phone, on a course, in daylight.

### Palette

| Token | Value | Use |
|---|---|---|
| `cream` | `#F6F4F0` | The page, everywhere |
| `surface` | `#FFFFFF` | Cards, the tab bar, anything raised |
| `ink` | `#2B2118` | Text — 100% primary, 65% secondary, 40% muted |
| `bark` | `#4A3728` | **Every** neutral, at an opacity. Borders are `bark/12`, strong `bark/25` |
| `accent` | `#0A9D56` | Emerald. Buttons, active states, win, live |
| `rust` | `#B5533C` | Loss only |

**No pure grey anywhere** — neutrals are `bark` at an opacity, never a grey hex or a Tailwind `gray-*`. **No gradients. No glows.** Emerald is an accent: one primary action per screen. A page with three emerald buttons has none.

### Type

Three families, one job each, never mixed. Clash Display (headlines), Bespoke Serif (body and all dense data), Archivo (buttons, labels, form fields). Use the scale classes — `t-h1` `t-h2` `t-card` `t-body` `t-data` `t-label` `t-cap` — rather than ad-hoc sizes.

Clash Display and Bespoke Serif are **Fontshare** fonts loaded from their CDN in `layout.tsx`; Archivo is self-hosted via `next/font`. The fallback chain degrades to a sans and a serif respectively, so a blocked CDN changes the faces but not the register.

### The wordmark

Two forms of one mark, both files, both rendered by `app/components/Wordmark.tsx` as an `<img>`. Never recreated in a webfont, never recoloured per page — brown on cream or brown on white, nothing else. Replacing either file needs no code change.

| File | Form | Where |
|---|---|---|
| `public/logo.svg` | stacked — green / dot / golf, square. **The supplied artwork.** | Landing, and the trip hub hero |
| `public/logo-line.svg` | single line — green dot. **Generated**, not drawn. | The sticky header |

**The line version is derived from the stacked one** by `scripts/make-line-logo.ts` (`npm run logo:line`). No separate line file was supplied, and the guide forbids redrawing the mark — so the generator reuses the very same paths. The export places each word in its own `<g transform="translate(x, y)">`, which makes putting "green" and "dot" on a shared baseline arithmetic on those transforms. Every curve is the original; "golf" is dropped and the emerald dot follows.

**Re-run `npm run logo:line` whenever `public/logo.svg` is replaced**, and update `WORDMARK.line.ratio` in `Wordmark.tsx` to the aspect ratio it prints.

Two things the generator learned the hard way, both visible only by rendering it:
- Spacing off the glyph *transforms* gives "greendot". The word space has to come from where the ink actually ends, so bounds are parsed out of the path data and a word space is a third of the cap height.
- Cropping to each glyph's original bounds clips the ascenders off the `d` and the `t`, because they are measured on the baseline the glyph came from rather than the one it moves to.

The supplied stacked file has a cream background baked in, a shade off our own. It is only ever shown on cream, so it stays as supplied; the generated line mark has no background, since the header has to survive a white surface.

### The sticky header

`app/components/TripHeader.tsx` — the mark at the top of every trip screen, and the way back to the trip hub from anywhere. 52px, exported as `HEADER_H` so the leaderboard's own sticky column row can clear it.

Two behaviours:

- **`morph`** — the trip hub only. **One element the whole way**: the mark starts large and centred below the header and travels up into it over 190px of scroll. Nothing crossfades and no letter is drawn twice.

  **The page is genuinely frozen while it happens** (`HeroPin`). Two parts, both needed:

  - the content is pushed back down by exactly the distance scrolled, so it does not move at all
  - the gap the mark leaves closes separately, and only from `RELEASE_AT` (0.68) — once the mark has essentially landed

  A shrinking spacer *alone* moves content up at **twice** the scroll speed, because the spacer is closing and the page is moving. `TRAVEL` is deliberately longer than `HERO_SPACE` (×1.7): when they were equal the catch-up was crammed into whatever scroll remained and the page shot up at 3×.

  **Each word shrinks on its own rise**, not on one shared curve. A shared shrink measures every word's resting position from an edge that is itself moving, so words visibly drift left *before their turn* — the emerald dot especially.

  Every word is positioned in **screen pixels**, not nudged inside a scaling frame. That matters: in a frame, `dot` has to travel right to reach its place after `green`, so it lurched right while the mark as a whole moved left. Positioned in screen space, the mark shrinks towards its left edge and *every* word genuinely moves left.

  **Up, then left — strictly, one word at a time** (`MorphWordmark.tsx`):

  | Word | Motion | Window |
  |---|---|---|
  | `green` | up, then away left — leads | y 0–.16 · x .16–.44 |
  | `dot` | rises while green is still sliding, then follows | y .20–.50 · x .50–.74 |
  | `golf` | drops **down** and out, fading. Up would take it through `dot` and `green` | y 0–.30 |
  | `.` | rises with the words, lands last | y .24–.52 · x .52–.80 |

  A word never moves on both axes at once: its vertical window closes before its horizontal one opens. **Between** words the windows overlap heavily — the only real constraint is that green must be clear of the spot dot lands on before dot gets there, and `easeOut` carries green most of the way in the first third of its slide, so dot needs a short head start rather than a long wait. Staggering them any further reads as dead air. `EXIT_DROP` is in pixels rather than artwork units, because everything in units is multiplied by a scale that shrinks to a third — a generous drop in units came out tiny on screen, and with the rest of the mark rising past it `golf` appeared to drift *upwards*.

  `test:branding` samples the whole travel and asserts no two words ever collide, allowing for the overlap the artwork's own kerning already has at rest.

  The offsets come from `app/components/wordmarkMorph.ts`, **generated** by `npm run logo:line` from the artwork's own word groups. Replace the logo, re-run it, and the animation still lands.
- **`fixed`** — everywhere else. Just the line mark, sticky from the first pixel. **The leaderboard and scoring screens never morph**: they are read standing on a tee, and nothing on them should move that is not a score.

`useScrollProgress` is one hook shared by both marks. Two copies would drift apart mid-scroll and the morph would come apart in the middle. The listener is passive and frame-coalesced; reduced motion settles to the end state immediately rather than animating slower.

### Navigation

Bottom tab bar, `app/components/TabBar.tsx` — Home · Leaderboard · Scoring · Settings, scoped to a trip. Fixed to the bottom with `env(safe-area-inset-bottom)`; without that the bottom row of taps lands on the iPhone home indicator. Pages carrying it add `has-tabbar` for clearance. Labels are 10px so **Leaderboard** fits one line.

Deliberately **absent from the scoring flow**, where the bottom of the screen is score entry and a nav bar under it is a mis-tap waiting to happen.

### Motion

`ease-out` everywhere. Micro 120–180ms, larger 250–350ms, nothing over 400ms. **No bounce, no spring, no elastic easing.** Pages fade in over 200ms (`page-enter`). A changed live score flashes its cell emerald and fades (`score-flash`) — it never moves, because it is being read. Every animation is stilled under `prefers-reduced-motion`.

### Scoring symbols

Thick emerald ring (eagle), thin emerald ring (birdie), bare number (par), thin bark square (bogey), thick bark square (double+). The paper scorecard is now white on cream with bark rules rather than parchment.

- Touch targets minimum 48px
- Leaderboard, scoring and bracket screens stay tight (4–16px). Generous spacing is for entry screens only

## Platform concept

- A **lead player** creates a trip — no account required, open access for now
- A **6-character alphanumeric trip code** is generated on creation (e.g. `GX7K2P`)
- Other players join by entering the trip code at `/join`
- All trip data is scoped by `trip_id` — no data leaks between trips
- No auth gate yet — trip code is the only access control
- Auth (Supabase email/password) will be added later for trip management

## Routing

| Route | Purpose |
|---|---|
| `/` | Landing page — create or join a trip |
| `/join` | Enter trip code to join |
| `/trip/[tripCode]` | Trip hub — hero, nav, player list |
| `/trip/[tripCode]/setup` | Trip setup — formats, players, finalise/unlock |
| `/trip/[tripCode]/teams` | Drag-and-drop team assignment |
| `/trip/[tripCode]/players` | Join trip / claim a player slot |
| `/trip/[tripCode]/course` | Round picker for live scoring |
| `/trip/[tripCode]/course/[roundNumber]` | Course dashboard — live scoring |
| `/trip/[tripCode]/leaderboard` | Leaderboard — one tab per enabled format |
| `/admin/trips` | Owner-only overview of every trip. Unlinked, noindex, password-gated |
| `/dashboard` | Lead player's trip list (future — post auth) |
| `/dashboard/create` | Trip creation wizard (future — post auth) |

## Database schema

### Core tables

| Table | Description |
|---|---|
| `trips` | Top-level. `name`, `slug`, `trip_code` (6-char unique), `status`, `formats` (JSONB), `num_teams`, `setup_status`, `edit_permission`, `finalised_at`, `start_date`, `end_date`, `created_at` |
| `tees` | Scoped to `course_id`. `name` (colour), `gender`, `par`, `course_rating`, `slope`. Unique on `(course_id, name, gender)` |
| `teams` | Scoped to `trip_id`. `name`, `color` (hex) |
| `players` | Scoped to `trip_id`. `team_id` (nullable), `name`, `role` (player), `handicap`, `is_lead` (boolean) |
| `courses` | Scoped to `trip_id`. `name`, `slug`, `location` |
| `holes` | 18 per course. `hole_number`, `par`, `stroke_index` |
| `rounds` | Scoped to `trip_id`. Links `round_number` to `course_id`. `status` (upcoming/active/completed) |
| `round_handicaps` | Snapshot of `playing_handicap` per player per round — use this for scoring, never `players.handicap` |
| `scores` | One row per player/hole/round. `gross_score`, auto-calculated `stableford_points` |

### Live scoring tables

| Table | Description |
|---|---|
| `live_rounds` | Active scoring sessions per player/round. `session_finalised_at` marks completion |
| `live_scores` | Hole-by-hole scores during active play, before finalisation |
| `live_player_locks` | Prevents concurrent scoring sessions for same player/round |

### Views

| View | Description |
|---|---|
| `leaderboard_by_round` | Best stableford per hole per team per round, with `running_team_total` |
| `leaderboard_summary` | Total team points per round per trip, ordered by score |

### Key constraints

- One score per player per hole per round
- A course may be played more than once per trip (the original `(trip_id, course_id)` unique constraint was dropped in migration 017). Round numbers are still unique within a trip.
- `players.trip_id` must match `teams.trip_id`
- Composite players have `team_id = NULL` — always fetch flat, never via nested PostgREST

## Stableford scoring (canonical — do not deviate)

Calculated by PostgreSQL trigger `trg_scores_stableford` on every insert/update to `scores`.
shots_received = FLOOR(handicap / 18) + (1 if stroke_index <= handicap % 18 else 0)
net_score      = gross_score - shots_received
points         = GREATEST(0, par + 2 - net_score)

- NR = 0 points
- Max nett capped at score giving 0 points (net double bogey)
- Leaderboard display: relative to 2pts/hole baseline. 36 points = "E", 38 = "+2"
- Team leaderboard: best individual stableford score per hole per team, summed across 18 holes

## Player states (live scoring)

| State | Description |
|---|---|
| Available | Not in any active scorecard this session |
| Active | Assigned to an in-progress scorecard |
| Finalised | Scorecard completed and committed |

One state at a time. Finalised players cannot be reselected unless manually unfinalised via settings.

## Leaderboards — what a trip plays for

**`lib/leaderboards.ts` is the current model.** A trip carries an ordered **list** of complete competitions in `trips.leaderboards` (migration 022). The first is the primary.

This replaced a model where every choice was a flag on one object, so any combination was expressible — including meaningless ones like a team format on an individual board. **A leaderboard is either fully answered or it is not in the list.** That is what lets the scoring module trust what it is handed.

### Three independent questions

A league board is three answers, and they do not constrain one another:

| Question | Answers |
|---|---|
| Who is ranked | individuals · teams |
| How a round is scored | Stableford · Strokes |
| *(teams only)* how the players combine | better ball · hero · cut the dead weight |
| How the rounds add up | total them · pay by finishing position |

Discard (0–2 worst rounds) is asked of **every** league board. A draw asks nothing — it is generated at random.

**Every combination is a board that exists and is implemented.** `everyBoard()` is that grid, and the form offers cells from it and nothing else, so settings can never ask for maths that has not been written. This is the whole design: the renderer's capability is the fixed thing and the form is a selector over it, rather than each new option needing new scoring code.

**"Custom points" used to sit beside Stableford and Strokes as a third way of scoring a round.** It never was one — it is Stableford, paid out by position — and having it in the wrong slot is what forced discard to be switched off for it, made the prize table hang off two unrelated fields, and made teams ask the same question again under the name `aggregation`. Splitting scoring from combining is what opened up nett-strokes team formats and strokes paid by position, neither of which was expressible before.

**Team formats** (`lib/teamScoring.ts`): `better_ball` (best score on each hole), `hero` (best single card carries it), `cut_dead_weight` (everyone counts except the worst card of the day — that player is back in next round; ties broken by id so the same total is produced every time). Each works on either scoring: `teamRoundPoints` takes a `basis`, and `beats()` is the one place the direction lives — lowest wins on strokes, highest on Stableford.

**Uniqueness.** `slotKey` is every answer that changes the maths, so two boards are the same only when they would produce the same table. **Stableford totalled and Stableford paid by position are two boards** — an order of merit and a daily prize are a normal pair to run together, and the old model could only hold one of them. The tab names them apart (`Stableford` / `Stableford prizes`). **Matchplay is capped at one per trip**, whoever it is between — a second draw is a different tournament, not a second view of this one. `parseLeaderboards` enforces all of this on read too, not only in the form.

**The form** (`LeaderboardSetup.tsx`) asks the same questions in the same order every time, each opening the next; nothing is hidden by an earlier answer. Question numbers are counted rather than written down, since teams ask one more. "Add another leaderboard" sits underneath from the start so it is clear more is possible, but is disabled until the primary is complete. Adding a second offers the same cascade with whatever is running shown as **In use**.

Anything stored that cannot be understood is **dropped, not repaired** — a half-understood board would quietly score a trip wrongly, while no board sends the organiser back to a form that says so.

### From settings to the board

`lib/boardRows.ts` is the join. `buildRows(board, context)` takes **one** leaderboard and the trip's scores and returns that board's rows; everything it needs comes off the board itself. Two boards on one trip can therefore be scored genuinely differently — Stableford keeping every card beside Strokes dropping the worst. Under the old model discard was one number on the trip and the team format one setting on the trip, so that was not expressible: it was one answer applied twice.

The leaderboard page renders `Leaderboard[]` and nothing else. Tabs are the league boards in list order; matchplay is a button, never a tab, because a draw is not a table.

**Two shells, not one builder per format.** `individualRows` and `teamRows`, each taking how a round is scored and how the rounds add up; `combineRounds` is the second axis and is shared by both, because totalling rounds or paying positions means the same thing whoever is being ranked.

`combine: 'position'` places each round on its own result and pays the table. **The round column then shows what the position was worth, not the score that earned it** — otherwise the total would not add up beside its own columns. Prize points are always higher-is-better, whatever earned them, so a nett-strokes prize board is placed lowest-first and then totalled highest-first.

**Old trips are read, not migrated.** `lib/leaderboardsCompat.ts` turns `trips.formats` into the boards those flags always described: teams first, then each individual board ticked (all inheriting the single trip-wide discard, exactly as they always did), then the draw. `parseLeaderboards` also reads the first shape of the current model — `scoring: 'custom'` and `aggregation: 'custom_points'` both come back as Stableford paid by position, and a team board with no scoring at all reads as Stableford, which is the only thing that model could mean. A stored list always wins; an empty one means a trip from before the column existed, not a trip playing for nothing. Delete the file whole once no trip has an empty `leaderboards`.

**Team format options survive the switch.** `better_ball` with three scores counting and a grandstand finish is not expressible as a leaderboard — the form asks for the format only. `teamScoringFor(board, legacy)` hands back the trip's old `team_scoring` verbatim when the format matches, so a trip mid-way through is never silently re-scored. Options from a *different* format are not carried across. `aggregate` was retired from the form but stays in `ALL_TEAM_FORMATS` so trips running it still read and score as themselves.

### Pairing names

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
- A stored table is padded rather than regenerated when players join, so edits survive
- Positions are decided on that round's Stableford result
- **Players level on the day share the places they occupy** — two tied for first with a 10/6 table take eight each. The total awarded is the same however a round finishes

### Matchplay: singles and pairs

A draw is between **players** (singles) or **pairings** (pairs). A pairing IS a team of two, so pairs requires teams — `isPairsMatchplay(f)` returns false without them however the stored value reads.

- **Teams are locked at two** under a pairs draw: banner above team selection, `n/2` on each column, refused drags, disabled dropdown options, and a finalise block if the sheet is broken. `lib/teamLimits.ts` is the single rule (`PAIR_SIZE`, `teamSizeLimit`, `canJoinTeam`, `pairsBlockedReason`).
- **Teams are called pairings** throughout the pairs UI — `teamNoun(f)` gives the words.
- **A pairing is never named on the draw.** A tile carries its two players' first names side by side ("Ross & Dave"); "Team B" tells nobody who is playing. Elsewhere — team lists, the team leaderboard — a team keeps its name. `lib/matchplayEntrants.ts` does the naming; members are ordered by handicap so a pairing reads the same every time.
- Auto-balance already paired high with low at two per team (snake draft, second lap reversed), so it was unchanged.

**Storage.** `matchplay_matches` has a team column beside each player column, with `entrant_type` (`player`/`pair`) saying which set a row uses (migration 019). Every constraint guarding the player columns is mirrored for the team ones. `lib/matchplay.ts` and `lib/matchplayProgress.ts` are untouched — they care only that a side has an id — and the mapping lives in `toStored`/`toRow` in `lib/matchplayStore.ts` and nowhere else. A row with no `entrant_type` is a pre-pairs row and reads as singles.

The bracket page reads `entrant_type` from the **rows**, not from current settings: a draw made before the format was switched is still a real draw, and reading it against the wrong entrant kind renders a column of blanks.

### Leaderboard

Each active board is a tab, teams first when teams are on. With more than one running, a title card above the board names it and states how it is being scored.

A round is **In play** — a glowing green badge — when a `live_rounds` row for it has status `active`. Recorded scores alone do not count; the scorecard has to be open.

**Green while the card is open, gold once it is in.** A round with uncommitted `live_scores` shows green and reads as *how far ahead of level it stands*. Once finalised it turns gold and reverts to the total.

| Board | While in play | Once finalised |
|---|---|---|
| Stableford | against two points a hole — 27 off nine holes reads `+9` | the total |
| Strokes | nett against the par of the **holes played**, not of eighteen | the nett total |
| Custom | colour only — a prize table pays position, there is no level | the points awarded |
| Teams | colour only — level depends on the mode and team size | the total |

Level prints as `E`. The row's live dot is **green**, not gold — gold now means the opposite, and both being gold would say nothing. A legend appears while anything is in play.

Committed scores always win over in-progress ones for the same hole.

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
| `better_ball` | Composite card: best N Stableford scores on each hole, optionally opening up to the whole team over the closing holes | `countingScores` 1–4, `aggregateFinish` 0/1/2/3/6/9 |
| `aggregate` | Every member's score counts, over the closing X holes | `aggregateHoles` 18/9/6/3/2/1 |

`aggregateFinish` is the grandstand-finish rule: holes inside the closing stretch count **every** player rather than the best N, so a trailing team can still catch up. It can only raise a team's total, never lower it. Setting it to 18 is equivalent to the standalone `aggregate` mode.

Team sizes are deliberately **not** fixed for a team league — a team can have any number of players. `countingScores` above the smallest team's size is allowed (it just caps out); setup warns rather than blocks. A **pairs matchplay draw is the one exception**: it fixes teams at two, since that is what a pairing is.

This supersedes Donegal Masters rule 6 ("best-2-of-3") for trip pages — best-2 is now just the `better_ball` default, not a hard rule. The legacy DM leaderboard still hard-codes best-2.

**Future:** Skins, Nassau, Best Ball, Scramble, bracketed (rather than round-robin) matchplay.

## Admin overview

`/admin/trips` lists every trip on the platform, newest first: name, code, created date, lead email, player count and status. View only, linked from nowhere, `noindex`. You reach it by typing the URL.

**The lock is server-side, unlike `lib/passcode.ts`.** That distinction matters and should not be collapsed:

| | Trip settings passcode | Admin password |
|---|---|---|
| Guards | one trip's settings | every trip, and organisers' email addresses |
| Checked | in the browser | on the server |
| Secret | SHA-256 hash in a public column | `ADMIN_PASSWORD` env var, never `NEXT_PUBLIC_` |
| Session | `sessionStorage` flag | HMAC-signed httpOnly cookie, 12h |

A client-side check here would ship the password in the JS bundle and fetch the data with the anon key — no protection at all. The trip query sits below the cookie check, so a failed login never touches the data. The cookie is signed with the password itself, so it cannot be forged and changing the password logs everyone out. An unset `ADMIN_PASSWORD` fails **closed** — a misconfigured deploy is locked, not open.

Still a shared password: no per-user accounts, no audit trail, no way to revoke one person. Fine for one operator; not fine for two. `lib/adminAuth.ts`, tested adversarially in `scripts/test-admin.ts`.

## Lead player email

`trips.lead_email` (migration 020) is nullable and optional, asked once on the creation form. **It must never block trip creation** — blank, half-typed and malformed all normalise to `null` and the trip is created regardless. `lib/email.ts` is a reader, not a validator: it either recognises an address or returns null. The column carries a shape check as a guard against hand-written rows, not as validation.

Never shown to other players. Only surfaced on `/admin/trips`.

## Returning players

A player joins without an account, so a cookie is the only way to greet them next time. `lib/playerCookie.ts`, `lib/playerSummary.ts`, `WelcomeBack.tsx`.

**A cookie, not an IP address.** A household shares one IP, a club's wifi shares one across everybody in the bar, and a phone's changes on mobile data. None of that identifies a person.

**A cookie, not localStorage.** The trip hub is server-rendered, so a cookie is readable while the page is being built and the greeting is in the first paint. localStorage would mean rendering as a stranger and then correcting it — a flicker on every visit.

| | |
|---|---|
| Name | `gg_player_<TRIP_CODE>` — one per trip, so two trips can never be confused |
| Value | the player's own `players.id`; no second identifier to keep in step |
| Life | 180 days, `path=/`, `samesite=lax`, `secure` only over https |
| Set on | claiming a slot, adding yourself, and creating a trip (the organiser) |

**It is not a credential and must not become one.** It decides whose name is greeted and whose summary is shown, and every one of those facts is already visible to anyone holding the trip code. It is deliberately JavaScript-readable, since the join flow sets it in the browser. If it ever starts gating something — editing scores, seeing an email — it needs real auth behind it.

The id is checked for UUID shape and then against *this trip's* roster, so a stale, junk or copied cookie recognises nobody rather than greeting a stranger. An unrecognised visitor sees the page exactly as it was before the feature existed: no error, no empty block.

**Nothing is fetched for a stranger.** The scores and matchplay queries sit inside `if (me)`, so a first-time visitor pays nothing for a greeting they will not see.

The summary reuses `totalAfterDiscard` — the trip's own discard rule — so the hub and the leaderboard cannot disagree. A **"Not you?"** control clears the cookie: a phone gets handed round on a golf trip, and without it the first person to join on a shared handset owns that device's greeting for six months.

## Support link

An optional "support the app" link in the footer of the trip hub and the leaderboard. `app/components/SupportLink.tsx`, reading `NEXT_PUBLIC_DONATION_URL`.

- **Unset means gone.** No link, no wrapper, no gap — `SupportLink` returns `null`, so removing the variable removes the feature completely.
- The value is sanitised before it becomes an `href` (`lib/donation.ts`). An href is one of the few places a bad string becomes executable, so `javascript:` and `data:` are refused and render nothing.
- `target="_blank"` with **both** `noopener` and `noreferrer`.
- Never a modal, banner or popup, and never on the scoring pages — it must not sit anywhere near someone entering a score.

## The itinerary

A trip is a drive to the coast, a tee time, another drive, a guesthouse — in that order, on a given day. `itinerary_items` (migration 021) holds that running order; `lib/itinerary.ts` is the model, pure.

**Creation is three steps** — trip details, the itinerary, players. It does not ask about teams. Whether a trip has teams at all follows from the leaderboards it runs, and those are chosen in settings; asking at creation as well gave one question two answers, and the creation one was the answer nothing read. No `teams` rows are written and every player starts with `team_id = null`.

**Creation step 2 is the itinerary builder**, replacing the old "pick a course per round" list. One day open at a time, tiles in the order they happen, and three add buttons pinned to the bottom of the screen — on a phone that is where the thumb already is.

| Kind | Carries |
|---|---|
| `golf` | course (platform list only), first tee time, number of tee times |
| `stay` | a name. Free text on purpose — an organiser knows what "the guesthouse in Ballina" means |
| `travel` | car / flight / train, from, to, duration |

**Golf items are the source of truth for rounds.** A round exists because a golf item does. On save the itinerary is written first so every row has an id, then golf items become rounds in `(day_index, position)` order — which is the order they are numbered in — each carrying `rounds.itinerary_item_id` back to the item that made it. The rounds-count picker is gone; the cap still applies, counted from the golf items.

**Positions are gapless**, renumbered on every add, delete and move. These lists are a handful of items long and a sequence you can read is worth more than avoiding a rewrite of four rows. Drag and drop moves items within a day or between days (`@dnd-kit`, press-and-hold on touch so a drag is never started by a scroll).

The schema uses one wide table with a `kind` column and a check constraint that each kind carries its own detail and none of anyone else's — without it a half-edited row can claim to be a drive with a tee time. Verified against Postgres: 5 valid shapes accepted, 8 malformed ones refused.

### On the trip hub

`Itinerary.tsx` shows the running order and **dims what has already happened**, so the eye lands on what is next. A day whose items are all past fades as a whole; the item happening now carries the emerald tint and the live dot.

`itemState` takes `now` as an argument and is judged by day first, then by tee time — a round is roughly four and a half hours plus ten minutes a group. The component reads the clock through `useSyncExternalStore`, bucketed to the minute: the server has no idea what time it is where the reader is, so rendering against `new Date()` directly is a hydration error, and a snapshot that changed every render would loop.

## Trip lifecycle

Trips have a `setup_status` of `draft` or `live`.

- **Draft** — everything editable: name, dates, formats, teams, players, handicaps. Scoring and the leaderboard are locked on the trip hub. Players can still join with the trip code.
- **Finalise** — writes a `round_handicaps` row for every player on every round (this is what catches players who joined after creation), then flips to `live` and opens scoring.
- **Unlock** — returns a live trip to `draft`. **Scores are never touched by the switch.** Re-finalising only fills gaps; it never overwrites existing handicap rows.

`edit_permission` is `everyone` or `owner`. Owner is a device flag in localStorage (`gig-owner-<TRIP_CODE>`) set at creation — placeholder until auth lands.

Trips predating this feature were marked `live` by migration 010, so nothing changed for them.

## Key files

| File | Purpose |
|---|---|
| `app/page.tsx` | Landing page |
| `app/layout.tsx` | Root layout |
| `lib/supabase.ts` | Supabase client |
| `lib/leaderboards.ts` | What a trip plays for — the list of complete competitions |
| `lib/boardRows.ts` | Scores into leaderboard rows, one board at a time |
| `lib/leaderboardsCompat.ts` | Reading a pre-migration trip's flags as boards |
| `lib/formats.ts` | The superseded decision-tree model, still read for old trips |
| `lib/tripSetupFlow.ts` | The tree itself: which questions, in what order |
| `lib/teamLimits.ts` | Team size rules and the pairing/team wording |
| `lib/matchplayEntrants.ts` | Players or pairings as one shape, and how they are named |
| `supabase/migrations/` | All schema migrations in order |
| `supabase/seed.sql` | Empty — trip data entered through the app |
| `config/site.ts` | Global platform branding |

## Tee data

The `tees` table drives tee selection in live scoring and the WHS playing-handicap calculation. It was empty in production until July 2026 — tee selection was permanently blocked on every platform course.

- **Migration 008** — all 22 platform courses. Real tee colours, par, CR and slope researched from club sites and golf databases. Confidence is noted per course in the file comments.
- **Migration 009** — the three Rosapenna courses, using certified figures from the Donegal Masters 2026 scorecards.

**Still estimated, needs a real scorecard:** Ballyliffin Old (no WHS data published anywhere), Portsalon, Royal Portrush Valley (redesigned post-2019 Open, databases stale), Narin & Portnoo (Gil Hanse redesign changed par 73 → 70, databases stale). Ladies par is estimated on The Island and Doonbeg.

When adding a course, insert its tees in the same migration. A course with no tee rows cannot be scored.

## Test suites

Every suite is a plain `tsx` script under `scripts/`, run by `npm test`. No framework: they print named checks and set a non-zero exit code. Logic lives in pure `lib/*.ts` modules so it can be driven without a database, and components are rendered with `renderToStaticMarkup`.

| Suite | Covers |
|---|---|
| `test:formats` | The format model and all three generations of stored settings |
| `test:setup-flow` | The decision tree, team size limits, pairs blocking |
| `test:matchplay` | Bracket generation and seeding |
| `test:entrants` | Player/pairing naming, and the real column-mapping functions |
| `test:custom-points` | The prize table and discard rules |
| `test:bracket-layout` | Column geometry and connectors |
| `test:bracket-render` | The bracket component at every size, singles and pairs |
| `test:progress` | Recording and correcting winners, and the cascade |
| `test:trip-form` | Trip creation |
| `test:leaderboard` | Every board, live vs finalised, score ownership, per-board rules, and old trips read through the shim |
| `test:admin` | Optional email, derived trip status, admin session signing |
| `test:recognition` | The per-trip cookie, the personal summary, the greeting |
| `test:support` | The donation link, and that it vanishes when unconfigured |
| `test:branding` | The green dot, the wordmark, back controls |

**Mutation testing is the standard, not an extra.** Break the code deliberately, confirm a test fails, restore. It has repeatedly found suites that passed while testing nothing — most recently a pair-size assertion written against the constant it was meant to pin, so changing `PAIR_SIZE` to 3 left every check green.

## Data insertion order

1. `trips`
2. `teams`
3. `players`
4. `courses`
5. `holes`
6. `rounds`
7. `round_handicaps`
8. `scores`

## Background jobs

Abandoned scorecard cleanup: Vercel cron route. Requires `CRON_SECRET`. Implemented as Supabase SQL migration + Next.js API route.

## CC Behaviour

- Never ask for permission or confirmation before making changes — just do it
- Always commit and push directly to master — never create a new branch
- Vercel auto-deploys from master via GitHub integration — no manual deploy steps needed
- Never expose service role key client-side
- All queries must filter by `trip_id`

## Terminal use — last resort only

The user has no coding background. Treat the terminal as a last resort, not a default tool.

**Prefer instead:**
- File edits, commits, and pushes via built-in tools
- The GitHub website for branch management, deletions, and file history
- Direct Supabase actions (migrations, schema changes) via SQL files committed and pushed

**When the terminal is genuinely required** (no alternative exists), explain in plain language what the command does and why there is no other way, before running it. Never run a terminal command silently.

## Multi-year architecture (inherited from Donegal Masters 2026 archive work)

Every table holding tournament-instance data has an `edition_year` INTEGER NOT NULL column. A `tournament_config` table holds one row with `current_year`. All live-app queries filter by `current_year` via a `lib/getCurrentYear.ts` helper (5-minute cache, server-side only — never call from client). Client components receive currentYear as a prop threaded from the server component chain.

Year-scoped unique constraints: any uniqueness that was implicitly "one tournament" must be `(original_columns, edition_year)`. Examples from Donegal Masters: `teams.name`, `rounds.round_number`, `rounds.course_id`.

Archive routes live at `/past/[year]` and are strictly read-only — no .insert/.update/.upsert/.delete anywhere under that path, and reused components take a `readOnly` prop that short-circuits all write handlers and realtime subscriptions.

In GripItGolf's multi-tenant model, this pattern needs scoping per-trip: `edition_year` likely becomes something like `(trip_id, edition_year)` or just `trip_id` since each trip IS a tournament instance.

## Iron-clad rules from the live tournament

1. **iOS Safari stacking context gotcha.** A `transform: translateX(0)` animation on a slide container combined with `overflow-hidden` on the parent breaks tap hit-testing until the first scroll. Use `margin-left` transitions instead. Never use transform for horizontal slide animations inside an overflow-hidden parent.

2. **Live leaderboard must merge uncommitted scores.** During live scoring, the leaderboard must fetch `live_scores` (uncommitted) alongside `scores` (finalised) and merge in real time. Do not gate updates on "session finalised" — users want to see leaderboard movement while rounds are still in progress.

3. **Offline score queue: stamp at enqueue time, not flush time.** Rosapenna had poor connectivity. Scores are queued in localStorage with 15-second retry. The `trip_id` MUST be stamped when the score is enqueued, not when it's flushed. A score entered offline must remain scoped to the correct trip regardless of when it syncs.

4. **Handicap formula is full Golf Ireland WHS.** `PH = HI × Slope ÷ 113 + CR − Par`. No 95% allowance. Do NOT truncate HI before the slope multiplication. Fetch `round_handicaps` live alongside scores so PH doesn't show as 0 on live leaderboards.

5. **Ladies tees must apply across ALL courses, not just one.** Stableford triggers, `effectivePar`, and `effectiveSI` must pull gender-specific par and stroke index for every course. Never special-case one course.

6. **Team scoring is best-2-of-3 per hole.** Both the page leaderboard and the live panel. Not best-1. Apply consistently.

7. **Scoring logic canonical rules:**
   - Nett per hole = gross minus strokes received
   - Max nett capped at the score giving 0 Stableford points (one over par after handicap strokes)
   - NR = max score, 0 points
   - Stableford: 3pts birdie, 2pts net par, 1pt bogey, 0pts double bogey+
   - Display vs 2pts/hole baseline

8. **Unique constraint on role-per-team needs null-swap pattern.** Swapping a player between two teams fails if both teams already have a player in that role, because of `UNIQUE (team_id, role)`. Use a 3-step write: null out the source, place the new player, restore the displaced player to the source team. Single-transaction optimistic UI revert on any failure.

9. **Silent Supabase write failures must surface.** Always check the `error` field on Supabase mutations and revert optimistic UI + show a toast on failure. Never assume success.

10. **Leaderboard cache must be force-dynamic (no ISR) during live play.** 30-second ISR caches caused team changes to lag. Use `export const dynamic = 'force-dynamic'` on any page displaying live tournament state.

11. **Gender-specific tee auto-selection.** On player setup and session resume, auto-select Blue/Slate for men and Red/Claret for women. Don't make users do this manually — they'll forget and score against the wrong tees.

12. **Session resume must restore confirmed playing handicaps.** When a scoring session resumes after an interruption, the confirmed round_handicaps row must be restored to the UI. Writing new round_handicaps rows at session start, then failing to re-read them on resume, causes PH to display as zero.

## Donegal Masters 2026 lessons — compliance status

| # | Rule | Status | Reference |
|---|------|--------|-----------|
| 1 | iOS: `translateX` inside `overflow-hidden` breaks tap hit-testing | ⚠️ TODO | `app/scoring/LiveScoringFlow.tsx:921` — `translateX` inside `overflow-x-hidden` div. Not `overflow-hidden` exactly but adjacent enough to revisit before iOS testing. |
| 2 | Leaderboard merges uncommitted `live_scores` + committed `scores` | ✅ Fixed (trip pages) | `app/trip/[tripCode]/leaderboard/` fetches both and merges — committed always wins per hole. In-progress rounds show a pulsing dot. The legacy DM `app/leaderboard/` still queries `scores` only. |
| 3 | Offline queue stamps `trip_id` at enqueue, not flush | N/A | Feature not built. No offline queue exists in this codebase. |
| 4 | WHS formula: `PH = HI × Slope/113 + (CR − Par)`, no 95%, no truncation | ✅ Compliant | Verified 2026-04-24. `calcPlayingHandicap` in `LiveScoringFlow.tsx`, `LiveClient.tsx`, `LeaderboardClient.tsx`. |
| 5 | Ladies tees applied on all courses, not just one | ✅ Fixed | commit `a320b53` + `be82e21` (2026-04-24). `ST_PATRICKS_COURSE_ID` gate removed from all 4 files; missed call site fixed. |
| 6 | Team scoring: best-2-of-3 per hole, not best-1 | ✅ Fixed | commit `a320b53` (2026-04-24). `teamRoundPts` and `bestPts` in `LeaderboardClient.tsx` now sort and slice top 2. |
| 7 | Scoring canonical rules: NR cap, Stableford formula, 2pts baseline display | ✅ Compliant | `shotsReceived` ✅ `calcStableford` (MAX(0, par+2−net)) ✅ `nrGross` (par+2+shots cap) ✅ `no_return` flag ✅ `stablefordRelative = total − holesCompleted×2` ✅ |
| 8 | Team re-assignment: 3-step null/place/restore to satisfy role-per-team constraint | N/A | Feature not built. No team re-assignment UI exists yet. |
| 9 | Silent mutation failures surfaced to user | ⚠️ TODO | `// TODO(error-handling)` comments added 2026-04-24 to 7 unchecked mutation sites across `LiveScoringFlow.tsx` and `LiveClient.tsx`. Full fix requires error destructuring + UI feedback. |
| 10 | `force-dynamic` on leaderboard pages (not `revalidate = 30`) | ✅ Fixed | Fixed 2026-04-24 — was missed in initial port from Donegal Masters. Both `app/leaderboard/page.tsx` and `app/leaderboard/individual/page.tsx`. |
| 11 | Tee auto-selection on fresh start | ✅ Fixed | `togglePlayer` in `LiveScoringFlow.tsx` auto-selects when a player's gender has exactly one tee on that course. Men usually see 2–3 options and choose, since the choice changes their playing handicap. |
| 12 | Session resume fetches fresh `round_handicaps` (not stale page-load prop) | ✅ Fixed | commit `0d7296c` (2026-04-24). `doResume()` fetches fresh; `effectiveRoundHandicaps` state unifies sources; `resolvePlayingHandicap()` logs fallback. |
| — | Next.js 16: dynamic route `params` must be awaited as a Promise | ✅ Compliant | Both dynamic routes use `const { x } = await params`: `app/scoring/[slug]/page.tsx:19`, `app/scorecard/[playerId]/page.tsx:16`. |

## Refactoring Discipline

### Signature changes (arity or argument order)

Never use `sed` with variable-name patterns to update call sites. On 2026-04-23 a call site in `LiveLeaderboardPanel` was missed when removing the third argument from `effectivePar` because the sed pattern matched `h` (a reduce callback parameter) but the missed line used `hole` (a find result). The function compiled; the wrong par was silently used for nett scoring.

Required procedure when changing a function signature:
1. `grep -rn 'functionName(' app/` — list every call site.
2. Read the list. Acknowledge it explicitly.
3. Edit each call site by hand or with a pattern that matches the function name only, not the argument variable names.

## Next.js 16 gotcha

Dynamic route params and searchParams are now Promises. Server components must destructure via `const { x } = await params` — synchronous access returns 404s on all dynamic routes. Applies to every `[slug]`, `[id]`, `[tripCode]`, `[roundNumber]`, `[sessionId]` segment.

## Performance pattern (from scorecard modal work)

Sequential multi-query page navigations should be replaced with inline bottom-sheet modals that reuse already-fetched data. Instant UX, zero additional queries. Applied this to individual scorecards in Donegal Masters pre-trip and it was the single biggest UX improvement of the app.

## Security debt carried from Donegal Masters

`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` was exposed client-side in Donegal Masters. This is acceptable for a closed 12-person family tournament but is NOT acceptable for GripItGolf, which will be public and paid. Before any GripItGolf public launch:
- Move service role key server-side only
- Enable RLS on every tournament-instance table
- Duplicate all trip filters at the RLS layer (client filters alone are insufficient once the service role key is gone, since anon users query via anon key)

## Build discipline (carried from Donegal Masters sessions)

- Build in stages. Test between dependent steps. Never chain too many changes.
- Audit-before-modify: for any multi-file change, produce an audit list first, pause for confirmation, then apply.
- Prompts scoped to specific files. Avoid broad "audit the codebase" requests.
- Automated/CLI approaches preferred over manual dashboard steps.
- Decisions not written into CLAUDE.md cause inconsistency across sessions. Keep CLAUDE.md current.
