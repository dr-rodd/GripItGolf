# Design brief — for Claude.ai design sessions

Paste everything below the line into a Claude.ai Project's instructions (or the
first message of a design chat). It is the background a designer needs to make
UI decisions for Green Dot without guessing. The facts in it come from the code;
when the code changes, change this file too. The bracketed lines are mine to
fill in.

---

## Who you are working with, and how

I'm Ross (Big Dog), the owner of Green Dot Live. I have no coding background.
**You (Claude.ai) make the design decisions with me; Claude Code builds them**
in the repository (github.com/dr-rodd/GripItGolf). Speak plainly and explain any
design or technical term the first time you use it. Recommend, don't survey: if
there are options, give me your pick and why, and show me no more than three.

Work **one screen or one decision at a time**. Show, don't describe: give me
mockups I can open on my phone (390px wide, light and dark), side by side when
I'm choosing. When a proposal breaks one of the rules below, say which rule and
what it would cost — some of them exist because of real incidents, and I'd
rather change a rule on purpose than drift past it.

Finish every session with the **hand-off spec** (format at the end) and an
updated **decisions list**, so the next chat starts where this one stopped.

## What Green Dot is

Green Dot Live (greendot.live) is free live scoring with leaderboards that build
themselves from the scores, for any event with a winner. Two sports so far:

- **Golf** — trips (a group's golf week) and tournaments/events (leagues,
  knockouts). Live hole-by-hole scoring, many leaderboard formats, teams,
  itinerary, weather, stats. A full live trip has run (North West 26, Aug 2026).
- **Running** — month-long team running challenges, aimed at workplaces and
  charities. Typed-in runs or Strava. Teams climb a leaderboard.

More sports are planned (tennis, sports days, park runs, sailing). The brand is
moving from "green dot golf" to **Green Dot Live**; **a new logo is coming** and
the current wordmark stays unchanged until it does.

**Who uses it and where:** almost entirely on a phone. Golf is played outdoors,
in daylight, one-handed, often on a weak signal, often by people whose reading
glasses are in the car. Running is checked in short glances. **Nobody needs
to sign in to join, play, score or watch** — a six-character event code is
the way in. Making an event needs a free Green Dot account (D135), and golf
clubs keep their members' list on Green Dot (D116–D140). Three tiers are
planned (D142): no account, Green Dot member with a personal page, and club
member, who sees the site through their club.

## The screens

- **Front door:** landing (type an event code, or Create), Create (pick a
  sport), Golf doorway, Join, the create wizards (behind sign-in since D135),
  Privacy, Terms. **Planned (D146–D148):** Create leaves the front page for a
  Green Dot members card; a signed-in phone opens its own `/home`.
- **Green Dot members:** `/account` (sign in, join, Forgot password, Me),
  My events, Clubs and a club's list (`/account/clubs`, `/account/club`).
  **Planned:** `/home` — a personal page (Home · Events · Board · Stats · Me,
  no skin) or, for a club member, the club area (Home · Comps · Board ·
  Stats · Club, in the club's skin) — and `/club/[slug]`, a club's public
  page.
- **A golf trip** — tab bar: Home · Scoring · **Leaderboard** (centre) · Stats ·
  Trip Setup. Plus the round summary, teams, players, match play bracket,
  export. Scoring is a full-screen card with no tab bar (the bottom of the
  screen is score entry).
- **A golf event** — the Event Hub (notices, schedule on a timescale), an
  organiser area behind a PIN, tags/sides, a tee sheet (events swap Trip Setup
  for it).
- **A run challenge** — tab bar: Home · Add · **Leaderboard** · Stats (coming
  soon) · Settings. Plus joining, and an organiser area.

[Attach current screenshots of each, light and dark, in the Project.]

## The design system today (`docs/style-guide.md`, `app/globals.css`)

- **Colour.** Cream page `#F6F4F0`, white surfaces, ink `#2B2118` text, every
  neutral is bark `#4A3728` at an opacity (no greys at all), **emerald
  `#0A9D56` the only accent** (`#0A6B3C` behind button text and for emerald
  text under 24px), rust `#B5533C` for errors and a no return. **Results
  have their own colours** (Ross, 21 Oct 2026, `lib/resultTone.ts`): gold
  `#D4A02A` for winning (gold text `#755610`), its tint for up, the brown
  (bark) for down and solid bark for lost; emerald for live and never a
  result. The old identity's `#C9A84C` is still out. **No
  gradients, no glows** (one deliberate exception: the glow on a round being
  played right now). One primary emerald action per screen. The opacities
  that recur have names — `line` (hairlines), `line-strong` (field and chip
  borders), `tint` (flat surfaces), `accent-tint` (the chosen wash),
  `disabled-bg`/`disabled-fg` — and nothing retypes them.
- **Depth and texture.** The page is paper: cream with a very faint grain
  (a hint of tooth, not an imitation — it was halved after the first look on a
  phone). Cards are smooth white, lifted by a hairline and a warm shadow:
  flat, raised, floating, and the one primary button. Pressed, a card sinks:
  shadow off, 97%. Radius: cards 20, buttons 16, fields 14, tiles 12.
- **Dark mode** is the same eight tokens with night values (warm browns, never
  black or grey) — not a second design.
- **Type.** Schibsted Grotesk 700 for titles, Archivo for every other word
  (body, labels, buttons, fields), Bespoke Serif only for the names and
  numbers on boards, scorecards and standings. Scale 32 / 23 / 18 / 17 / 16 /
  15 / 13 (`t-eyebrow`, table column headings only).
  **Nothing smaller than 13px.** Text never below 3:1 contrast; the tests
  compute real contrast in both themes. **No spaced capitals** except table
  column headings and the event code. Labels and buttons in sentence case.
  Tab labels 13px Archivo at 87.5% width.
- **Shapes and parts.** One kit (`app/components/ui.tsx`): cards, buttons,
  fields, chips (a short answer), options (an answer with a line under it),
  segmented controls (switching a view), toggles, pills, list groups,
  section headers, and one wizard frame for every create flow. Touch targets
  at least 48px. Scores use filled shapes, never outlines (birdie a soft emerald
  disc, bogey a faint bark square). Leaderboard, scoring and bracket screens are
  dense (4–16px spacing); entry screens are generous.
- **The mark.** The wordmark and its emerald dot are supplied artwork, never
  recoloured or redrawn. Strava's logo is used exactly as supplied.
- **Motion today.** One curve, the **putt curve** (`cubic-bezier(0.16, 1, 0.3,
  1)`: quick off the face, a long settle), and ease-out for fades. Small
  responses 120–160ms, a wizard step slides in 340ms (a soft fade under Reduce
  Motion), **nothing that answers a touch over 400ms. No bounce, spring or
  elastic.**
  Pages fade in (200ms). Cards press to 97% on tap (tab bar 94%). A changed live
  score flashes its cell emerald and **never moves, because it is being read.**
  Repeating "breaths" (live dot, skeletons, a tab waiting) run 0.9–2s.
  Everything stops for people who turn on Reduce Motion.
  Two documented exceptions: the landing page's logo collapse (~1s) and the
  first-visit intro tour (1.5s bloom, its own curve).
- **These rules are enforced by automated tests** (`test:branding`). Changing a
  rule is fine — it means Claude Code updates the test on purpose, so the spec
  must say so.

## What I want

A sitewide revamp that feels **more professional and more alive**, including
better animation — consistency and polish rather than more movement for its own
sake. [In three words, how should it feel? e.g. calm, premium, live.]
[Apps whose feel I like, with screenshots: e.g. Apple Sports, Strava, Revolut.]
[Anything I dislike today.]

### Open decisions — settle these first

1. **New default team colours** — muted to sit on cream, no emerald, told
   apart by lightness as well as hue (brick, cobalt, plum, orange, slate, rose,
   olive, navy are proposed in `refresh-plan.md` 3.2). Existing teams keep
   theirs.
2. **The copy questions** marked "Ross" in `docs/copy-review.md` — chiefly
   X-04 (Title Case buttons like "Start Round"), X-06 (em-dashes), X-08
   (British spelling), X-09 (register, and the two loud outliers), and the
   landing page's closing quote.
3. **Rows gliding to their new places** on a live board — decided no for now
   (D9); revisit after an event on the new look.
4. **Re-check the title font** when the new logo lands (D12).
5. **Title type and colour against the wordmark.** On a phone the titles
   (Schibsted, ink) read as a different voice from the mark (its own
   lettering, bark). Stopgap: the hub's name is bark. Decide the sitewide
   answer — colour, face, or both — ideally with D12.
6. **Phase 8** (count-up, dot bloom) is scoped in `refresh-plan.md`, with
   three questions for Ross before it is built.

## Constraints that don't move

- **Phone first, outdoors, daylight**: contrast and size beat subtlety.
- **Fast on old phones and bad signal.** No heavy animation libraries by
  default; prefer what the browser does natively (CSS transitions, the View
  Transitions API for screen-to-screen motion). A library only if a decision
  above truly needs it, and say so.
- **Reduce Motion** must still work: every animation needs a still version.
- **Light and dark** for every mockup.
- **Never move a number while it's being read on a live board**, unless
  decision 1 changes that deliberately.
- **Strava's rules:** a runner's data is shown to others as totals only; no maps
  or locations; the Strava logo unaltered.
- The site must stay **free to run**.
- Scoring screens change last and least — they're used mid-round.

## Hand-off spec (end every session with this — one block per task for Claude Code)

The format the Clubhouse calendar task (D234–D251) came in, adopted for every
hand-off (M18; Ross, 17 Nov 2026). Sections 0–8, in this order:

```
TASK: <name>
From Claude.ai, <date>. Repo read at <commit>.

0. HOW TO USE THIS
- Everything Claude Code needs is in this block; there is no other doc to find.
- Repo facts (3) were true at <commit>. Where the code disagrees, the code
  wins: say so in the plan; don't follow the stale fact.
- MUST rules (2) are Ross's decisions. "Your call" (5) is Claude Code's.
  Anything this block doesn't mention: decide, and list it in the hand-back.
- Record the MUSTs in docs/design-brief.md and CLAUDE.md as decisions,
  numbered from the next free D-number.
- PLAN FIRST. Wait for Ross's yes before building, and before any migration
  (listed, with undo, fail-soft until pasted).
- Questions back to Claude.ai only if a MUST is impossible or two MUSTs
  contradict: at most 5, in the format in 8. Everything else, ask Ross.

1. GOAL
<a paragraph: what changes for whom, and why>

2. MUST (rule -> how we know it's done)
M1 <rule>
   -> <a check Ross or a test can run>

3. REPO FACTS (<commit>)
- <file or table>: <what is true there today>

4. STAGES (each ends with tests, typecheck, build, push, Ross's check)
s0 <name>: <MUSTs>. Done when <check>.

5. YOUR CALL
<what Claude Code decides, and says why>

6. OUT OF SCOPE
<what waits>

7. SCREENS (house kit; tokens only; 13px floor; one emerald action a screen)
- <screen>: <what is on it>
  Optional detail, when a screen needs it:
    Before → after (mockup or screenshot reference)
    Colours: existing token names only (cream, surface, ink, bark, accent,
      accent-deep, rust, gold — gold only for winning) — or a proposed new
      token with light AND dark values
    Type: scale names (t-h1, t-h2, t-card, t-body, t-data, t-label, t-cap)
    Spacing / radius / shadow: exact values
    Motion: trigger → what moves → duration (ms) → easing; the Reduce Motion version
    Dark mode notes
    States covered: loading / empty / error / long names / 1 vs 40 rows
    How I'll check it on my phone

8. HAND BACK
The plan by stage with choices marked; migrations and their undo; Ross's
jobs by hand; how he checks each stage on a laptop and a phone.
Only if needed:
QUESTIONS FOR CLAUDE.AI: Q1 <question> — options A/B — your lean.
```

## Decisions so far

From the October 2026 design session (`docs/refresh-plan.md` §8), all built:

| # | Decision |
|---|---|
| D1 | Feel: clean, snappy, textured |
| D2 | Refresh, not redesign: palette, wordmark, cream, score entry layout, leaderboard layout stay |
| D3 | Fix the font bug first, on its own |
| D4 | Title font: Schibsted Grotesk 700 (over Bricolage Grotesque and Instrument Sans; Gabarito too round, Clash Display too wide) |
| D5 | Archivo for all words; Bespoke Serif only for names and numbers on boards, cards and standings |
| D6 | No spaced capitals except table column headings and code entry |
| D7 | Depth: flat, raised and floating; hairlines kept for sunlight; grain on the page only; gradients still out; one glow (live round) |
| D8 | One curve, the putt curve; touch responses ≤400ms; no springs or overshoot |
| D9 | Rows don't glide on live boards, for now |
| D10 | Count-up only after logging a run and on a signed round's total; never on a live board (Phase 8) |
| D11 | One celebration, the dot bloom, when a card is signed or a run logged; never in score entry or on boards (Phase 8) |
| D12 | Refresh now; re-check the title font when the new logo lands |
| D13 | Team names on boards stack, one per line, no gliding |
| D14 | Wizards slide right to left, 340ms, one question per step, sticky Continue |
| D15 | After the first look on a phone (19 Oct): the grain halved, the tab bar and wizard header given more room |
| D18 | Style lab at `/admin/style`: admin only, this phone only, six axes (title, text and score font; depth; corners; grain), no colour |
| D19 | Lab fonts load lazily through `@font-face` from `public/fonts/lab/`; house fonts stay on `next/font`; nothing lab-related in `globals.css` |
| D20 | A lab setup becomes the house style only through Claude Code, with tests and fit checks, never a switch |
| D21 | The "lab is on" indicator is a pill in the existing header, not a banner, so no layout shifts. Clash Display is not offered, having been rejected |

From the November 2026 session on the tournament create flow (Ross, 8 Nov;
`docs/event-use-cases.md`, "The chooser, as decided November 2026"):

| # | Decision | Status |
|---|---|---|
| D22 | A golf tournament is asked **Standalone** or **Ongoing** first | Built |
| D23 | Standalone offers **League** or **Match play**; single or multi-day is asked inside the wizard | Built |
| D24 | Ongoing offers **Series**, **Continuous** and **Match play** | Built |
| D25 | Series: rounds played together on a day, each with its own leaderboard, linked into an overall; recurring or manual | Already built |
| D26 | Continuous: rounds are time periods, cards submitted within them, ranked by the rules set (best card that round), tags for team leagues | Built (D30) |
| D27 | The top answer is "Ongoing"; the league type keeps "Continuous"; stored values unchanged | Built |
| D28 | Chooser answers live in the URL; step 1 of a tournament wizard goes back to the chooser | Built |
| D29 | An event's schedule is golf and activities; travel and stays are a trip's. Stored ones are kept | Built |
| D30 | Continuous is a league of periods: cards handed in any time inside a period, ranked by best card or best composite card, each period its own result adding to the overall; anyone in the field starts a card by default; periods an equal run adjusted by hand | Built |
| D34 | **Knockout** (a bracket) and **Matches** (match play results on a leaderboard) are separate in data, readers and words | Built |
| D35 | The first leaderboard question is **"Enable Dynamic Overall Leaderboard?"**, off by default; Yes runs the sessions, then back to finalise the Overall | Built; replaced by D77 (the question goes at stage 3 of `docs/format-first-plan.md`) |
| D36 | A round in a dynamic event is a **session** with its own format; later sessions start "Same as Session 1"; Format TBC counts nothing until set | Built |
| D37 | Main leaderboard = Primary (today's) or the Dynamic Overall Leaderboard ("Overall" on screen); secondary boards as before | Built |
| D38 | Sessions feed the Overall by finishing position (stroke) or per match result (Matches, default 1 / ½ / 0); the Ryder Cup scores per match to the tag | Built |
| D39 | A session is ranked in its own format; a Matches session shows its matches with results | Built |
| D40 | In a Matches session a tee time is a match: two tags get a fixed header in their colours, one tag a side, a pair stacked, "vs" between | Built |
| D41 | Without tee times the same layout is the **Order of play** ("Match 1, Match 2…"), the fourth tab | Built |
| D42 | The creation form says tee times (or the order of play) decide the matches | Built |
| D43 | Foursomes: one ball a side off 50% of the combined handicaps | Built (stage 7) |
| D44 | A session match can be halved; no extra holes | Built |
| D45 | Session matches have their own scoring permission (Strict: the players and the organiser) | Built |
| D46 | Standalone cards are **League** and **Knockout**; the Ongoing bracket card is Knockout too | Built |
| D47 | Events first; trips follow, every existing trip unchanged | Built |
| D48 | The date-span freeze is fixed first, in the league form and the itinerary builder | Built |
| D49 | No spectator mode; strict events control who scores matches | Built |
| D50 | Two tags facing off: the Overall is a ticker of every point up for grabs (each tag filling in from its own edge, matches in play softened in the leader's colour), a session dropdown, and the session's matches one tappable row each; a Matches session's match count asked at creation | Built |

**One scorecard gate** (Ross, 11 Nov 2026). A course with no scorecard used to be refused at one door, late — a stroke round went live before its photo was asked for, and a match card on one dead-ended. `cardBlocker` in `lib/courseCard.ts` is now the one question every door asks, and `ScorecardGate` the one answer:

| # | Decision | Status |
|---|---|---|
| D68 | One scorecard gate: no card on a course with no scorecard ever starts, at any door; the same photo prompt fixes it in place | Built |
| D69 | Choosing a course is never refused, starting a card is. "No scorecard"/"No ratings" is a plain line where it blocks, never a pill | Built |
| D70 | The server refuses a live card on a blocked course (migration 073); match card writes are closed with RLS stages 7–8 | Built (073 to paste) |
| D71 | Whoever may start a card may photograph its scorecard, trips and events alike | Built |

| # | Decision | Status |
|---|---|---|
| D72 | The card start sheet moves onto the parts kit: rounded player cards with tees inside, 12px tee tiles (not pills), a sticky "Start round" | Built |
| D73 | Whoever may start a round may add its course: "Add a course" is in every course picker, the photo deferrable, and the field's add-courses setting is gone | Built |
| D74 | A user's course is live for everyone at once; the database knows which courses the system added and which a user did (`courses.added_by`, migration 074), never who. A review to confirm them is a future project | Built (074 to paste) |
| D75 | New default team colours: brick, cobalt, plum, orange, slate, rose, olive, navy. Existing teams keep theirs (decided as D73 on 11 Nov; renumbered, D73 was already taken) | Built |

| # | Decision | Status |
|---|---|---|
| D91 | The golf leaderboard reads from one shared server copy per event, at most 10 seconds old (`GOLF_BOARD_SECONDS`), to cut what Supabase sends out. Nothing a player sees changes; the poller stays at 15s live, 3 min idle (Ross, 14 Nov 2026) | Built |
| D92 | A look at an older copy reads the database once and shows that read, which becomes the copy — never the old one shown while it refreshes behind, never two reads for one look. A failed read is never kept and never shown as an empty board | Built |
| D93 | The copy is not dropped when a card is committed; a score reaches other boards within about 25 seconds. Revisit only if 10 seconds draws a complaint. The other golf screens stay uncached for now | Built |
| D76 | The card check offers a tee's colour, approximated from the card or the tee's name, only where the name does not already say one; kept on the tee and drawn on its dot. Team-colour dots wear a hairline ring | Built (075 to paste) |
| D77 | Creation asks for a Format and Settings, never a "leaderboard"; "Enable Dynamic Overall Leaderboard?" is removed (replaces D35) | Built (stage 3) |
| D78 | Creation's order: details, field, Format, Settings | Built (stage 3) |
| D79 | A single board is "Leaderboard"; with secondaries the main one is "Primary"; the Overall is "Overall" | Built (stage 2) |
| D80 | Matches always require the Overall; its rounds are sessions | Rule built (`eventShape`) |
| D81 | Matches mixed with stroke days always require the Overall | Rule built |
| D82 | Stroke play with one total is Leaderboard / Primary; its rounds are rounds | Rule built |
| D83 | Secondaries are allowed beside the Overall as well as the Primary | Built (stage 5) |
| D84 | The platform reads the event and offers only the board types it can feed | Rule built; screens from stage 3 |
| D85 | Recognition reads formats and tags, never player count; two tags + Matches gets the face-off | Rule built |
| D86 | Allowance alone never makes a round a different format | Rule built (`shapeKey`) |
| D87 | A secondary over rounds it can't read names them rather than being refused — every Matches session, for a stroke secondary (Ross, 13 Nov 2026) | Built (stage 5) |
| D88 | Stroke foursomes is a new team format | Built (stage 7) |
| D89 | Crossing Primary ↔ Overall after creation asks first, shows the standings before and after, deletes nothing | Built (stage 6) |
| D90 | Stroke rounds in different formats that fit one board: asked once, one total (Primary) or points per round (Overall). Rounds that don't fit one board — Stableford beside strokes — get the Overall (Ross, 13 Nov 2026) | Built (stage 4) |

**Accounts and clubs** (Ross, 14–15 Nov 2026; the whole plan, D94–D152, is in `docs/pending-concepts.md`, "Accounts and clubs"). The rule above all, D94: nobody ever needs an account to join, play, score or watch — an account only adds. Built so far: sign-in by username or email and a password (D128–D133; on screen "Green Dot member", never a bare "member"), owners and My events (D105–D107, D134), only members make events (D135), a PIN per event (D136–D137), clubs and their lists with a club's admins running its events (D116–D117, D138–D140).

| # | Decision | Status |
|---|---|---|
| D141 | Accounts more visible on the front page | Built (g): the Green Dot members card under the code box |
| D142 | Three tiers: no account (nothing changes, ever); Green Dot member ("Dot member" in code and docs) with a personal page; Club member (on a verified club's list, linked) who sees the site through the club and keeps every Dot member feature. On screen the words stay as D133 | Agreed |
| D143 | A Dot member's personal page: their events, their stats (the headline feature), making events. Tab bar as the club's less Club | Built (g): `/home` — Home, Events, Board, Stats, Me |
| D144 | A Club member's default view is the club area; their open events and the events they made sit in its upcoming list | Built (h): the club area stays at `/club/<slug>` (the server draws the skin before paint); a member's own events are its Outside the club |
| D145 | One club per account, for now | *Retired by D218 and D223* (stage (k0)) |
| D146 | Making a trip or event moves off the front page, onto the personal page and the club area | Built (g): Create gone from the front page; Make an event on `/home` |
| D147 | Front page by tier: signed out, the code box first, then a Green Dot members card (Sign in, Join, one line on what it gives), no Create; a quiet "Organise an event" goes to Join. Signed in, greendot.live opens the member's home, which carries the code box | Built (g): signed out the code box, the members card, Organise an event; signed in the head script goes on to `/home` |
| D148 | One home address, `/home` (club area or personal page); `/club/[slug]` the club's public page; `/home` signed out goes to sign in; old account addresses redirect | Built (g): `/home` the personal page; a Club member sent on to `/club/[slug]` until (h) |
| D149 | Personal tab bar Home · Events · Board · Stats · Me; Board opens the live event's board, else the latest, never empty. Club tab bar stays D127 | Built (g) |
| D150 | D145 enforced on the server only: a second club refused, naming the first; the tables can hold more | *Retired by D218 and D223*: the refusal is gone (stage (k0)), no migration needed |
| D151 | The personal page has no skin; only a club area does | Built (g): emerald lit tab, no club tokens |
| D152 | The card summary row and its backfill (stage (f)) come before or with the personal page | Proposed; plan (f) before (g) |

**For the next design session**: the club page's look (D118, D123–D127 — the Pints mockup), handed back as a hand-off spec, is what stage (e1) waits on; the personal page and the members card on the front page (D143, D147, D149) follow.

**The club skin** (Ross, 14–15 Nov 2026 — the Pints mockup; full text, previously only in the Claude.ai list):

| # | Decision | Status |
|---|---|---|
| D123 | Art behind every members page: the home about 60%, fading into the cream by the first card; every other page about 20%, behind the title only. Never behind a board, a scorecard or score entry | Built (e1): `.club-art`, `.club-art-title` |
| D124 | Light: the art multiplies into the cream. Dark: the filter in D155. The grain sits above the art | Built (e1) |
| D125 | The club colour is for identity only: the crest's ring, "Members", the lit tab, the "Members only" pill, your own row. Emerald stays the action and Live; gold the winner | Built (e1): `lib/clubColour.ts`, `test:clubs` |
| D126 | Art at least 1170px wide, landscape, soft and light, sky at the top | Built (e1): refused on upload otherwise |
| D127 | The club tab bar: Home · Comps · Board (centre) · Stats · Club | Built (e1) without Stats until (f) |

| # | Decision | Status |
|---|---|---|
| D153 | A club's owner or admin making an event from the club area is asked "the club's" (default, Club admins only) or "just mine"; any other club member makes their own. The club area lists the club's events to everyone on its list and a member's own to them alone | Built (h): asked at the create gate (`MemberGate`) |
| D154 | The phone's sign-in hint holds a kind and a slug, never a name. The pre-paint script reads it on "/" alone (never a code path or a query). `/home` finding it stale clears it and shows the front page, not sign-in | Built (g): `lib/tierHint.ts`; on `/home` a club hint also goes on to the club |
| D155 | One art image per club; dark mode derives it in CSS (brightness .62, saturate .75, sepia .15). An optional dark override is kept, never required | Built (e1): `clubs.art_path`, `art_dark_path` (087) |
| D156 | sharp is a real dependency; images are resized on the server (art 1600 wide, crest 512, WebP), never on the phone | Built (e1) |
| D157 | `/club/[slug]` is one address, two views: a signed-in member on that verified club's list sees the members home, anyone else the public face; an unverified or unknown slug is "not found" | Built (e1) |
| D158 | The public face: art, crest, name, the verified tick, "<club> members: sign in", and the club's guests-welcome events ("Anyone in the event") with their links. Never the list, the calendar or members-only boards | Built (e1) |
| D159 | Comps lists the club's events — Upcoming, My entries, Results — each opening its event; no booking until (d) | Built (e1) |
| D160 | Resend stays on its free plan until a day passes 50 emails (D111); the day's count is on /admin | Built (e1): `lib/emailCount.ts`, /admin Trips |
| D161 | A club's home course (`clubs.home_course_id`), set on its list page with the scorecard gate asked there; new competitions default to it | Built (d1): set on the list page, the scorecard gate asked there |
| D162 | "New competition" on Comps for owners and admins: name, date, format and allowance, tee times; no PIN, no collaboration question, no tags | Built (d2) |
| D163 | A competition's field is the club's list: a player row made when a member is booked, pointing at the list row (`players.club_member_id`) | Agreed; plan (d1)–(d2) |
| D164 | A members-only club competition admits a signed-in member on the club's list with no code or PIN, and nobody else bar a watch link (members-only boards, D113) | Agreed: the public PIN door with a PIN nobody holds; plan (d1)–(d2) |
| D165 | *Amended again 16 Nov:* every player needs their own account; members score each other's cards on any device (who keys the scores is never enforced) | Built (d2): booking refuses a list row with no account |
| D166 | *Replaced by D179* | — |
| D167 | The competition page inside the club shell: back to Comps, name, date, one phase line | Built (d2), `/club/[slug]/comp/[code]` |
| D168 | *Replaced by D180–D181* (and the card's place by D183's "the event's own bar") | — |
| D169–D172 | Phases Announced, Booking open, In play, Awaiting sign-off, Certified; scoring closes when every booked player is signed or No return; admins mark No return, sign or void, Certify (countback, lock, Results, gold) and Reopen; only certified rounds feed the season | Built (d3)–(d4): Certify shows the day's handicap index changes first; migration 091 locks a certified round to every phone |
| D173 | Booking: your own name in one tap, partners from the list, withdraw until the time has gone | Built (d2) |
| D174 | External (non-club) events open on their own with their own tab bar, as today | Agreed; nothing changes |
| D175 | No emails when booking opens until the email plan allows | Agreed |
| D176 | *Amended 16 Nov:* a competition card is final only with the player's approval on their own account (at any stage — a forgotten phone's card is scored on another and approved later) and a marker's. Was: two different accounts — the finaliser — the one that finalises, then a marker chosen from the club's list (the tee time's other players first, then a name search); the player may change the marker until it is co-signed | Built (d3): the finalise counts as the player's approval when the player finalises, and as the marker's signature when the finaliser chose themselves; never the same account for both |
| D177 | "Cards to sign" at the top of the marker's club Home and in the competition's Scoring section, opening the finalise screen read-only with "Sign as marker" and "Send it back" (the card back to the player, unsigned) | Built (d3): the card hole by hole in the Scoring section, with Approve my card, Sign as marker and Send it back |
| D178 | An owner or admin may sign as marker. *The no-account member's card is gone with the amendment: every player has an account and approves their own.* Signing runs on the server for player, marker and admin alike | Built (d3), `/api/card/sign`, `card_signatures` (migration 090) |
| D179 | The handicap index lives on the Green Dot account (shown on Me), one value: the list shows it for a linked member, an unlinked row holds its own until linked; the card start sheet shows each index to confirm and a change there updates it everywhere; every change logged (old, new, when, by whom) and the day's changes shown at Certify | Built (d1): Me, the list, linking, the log; the start sheet (d2) and Certify (d4) to come. `account_handicaps`, `handicap_changes` |
| D180 | *Amended 16 Nov evening (replaces the four-slot sketch):* the footer on a competition's four pages is the club footer with Home and Comps where they are and **Tee times, Scoring, Leaderboard** in the three slots Board, Stats and Club hold; the same metrics as `ClubTabBar` (64px, five columns, 13px labels at 87.5%); drawn by the server with the page, never depending on who is signed in. Coming from the club area the three slide out of the Comps tab; leaving, the club tabs return. Was: Tee sheet, Scoring, Leaderboard, Home over the club footer | Built (d2, amended): one bar, `ClubTabBar`, drawn by the club's layout (`app/club/[slug]/layout.tsx`) so the change of set is in place; the set from the address (`lib/clubBar.ts` `barOf`). *Ross, 16 Nov:* the three slide out from behind Comps **at full opacity**, the tray the accent that says they are its children |
| D181 | All three sections always in the bar; one not yet live is a single line saying when it starts | Built (d2) |
| D182 | Ties: `lib/tiebreak.ts` as it is (back 9, 6, 3, 2), then shared; on finished (co-signed) cards only | Built (d2) as the countback; "co-signed only" holds at Certify (d4), when every card is final — before it the board is provisional and a card waiting says "To be signed" |
| D183 | Owners and admins get "Manage competition" on the page, opening the existing organiser area with the event's own bar | Built (d2) |
| D184 | Members only by default; "Guests can watch" is read-only for anyone with the code (the spectator role). Watching split from editing for competitions only | Built (d2); amended by D185 |
| D185 | *Ross, 16 Nov 2026:* every club event may be viewed by every member on the club's list; only the players on a competition's tee sheet play it | Built with (d3): a member signed in goes through any club event's PIN door with no PIN; on a competition anybody but its admins is a player while booked and a spectator otherwise, set afresh on every entry |
| D186 | *Ross, 16 Nov evening (numbered D185 in his list; D185 was already taken):* the competition's own address, `/club/[slug]/comp/[code]`, is its **Summary**: name, date, course, format, the phase line, the phase's one emerald action (Book a tee time / Start your card / Certify result for an admin), your tee time once booked, the top three while live, and Manage competition for owners and admins. The three sections are `/tee-times`, `/scoring` and `/leaderboard` under it. *Ross, 16 Nov:* the phase line says **In play** (the one copy, `PHASE_WORDS`), not Live; See the results drawn secondary for him to judge | Built (d2, amended): `comp/[code]/page.tsx`, `CompSummaryAction`, a section's "‹ Summary" |
| D187 | *(his D186)* Home and the header's green dot go to the club Home (`/club/[slug]`). Comps goes back one level: from a section to the Summary, from the Summary to `/club/[slug]?tab=comps`. *Amended by Ross, 16 Nov:* Comps from any competition page goes back to the club's Comps list and the footer returns to normal; a section reaches the Summary by "‹ Summary" above its title | Built (d2, amended): `compsBack` |
| D188 | *(his D187)* A tray in `--gd-club-tint` behind Comps and the three sections; Comps shows a back chevron in place of its icon while a competition is open | Built (d2, amended) |
| D189 | *(his D188)* Board on the club footer, while a competition is live, opens that competition's `/leaderboard` | Built (d2, amended): the first competition in play |
| D190 | *(his D189)* The scoring card is full screen with no bar, unchanged; its back arrow returns to `/scoring` | Built (d2, amended): through `/club/comp/<code>?view=scoring` |
| D191 | *Speed, Ross, 16 Nov 2026* (about 15 seconds from greendot.live to his club home): measure first. Ross's own stopwatch: club home 4s to a page, 8s full; into a competition 4s/6s; each competition tab 2s/4s; the Comps tab instant | Done by stopwatch. The functions ran in Washington (iad1), the database in Ireland (West EU): every read crossed the Atlantic, twenty to thirty a screen, one after another |
| D196 | The functions run beside the database | Built: Vercel's region Dublin (`dub1`), set in the dashboard by Ross and pinned in `vercel.json`. One region is what the plan gives a function |
| D192 | One hop from greendot.live to a member's home: the hint is dropped only on sign-out, delete, or the server saying the account is not signed in or not on the list; a phone with a stored sign-in and no hint is sent on by the head script before any paint; a Club member never waits on /api/account to reach the club | Built: `readAccount` no longer drops the hint; `/home` sends a phone to the front only with no sign-in kept at all or on the server's 401/403, else says it could not reach Green Dot with Try again; the head script reads the kept sign-in (`TIER_BOOT_SCRIPT`). A club hint already went straight to the club. The installed app keeps its own storage: on first launch it holds no sign-in and no hint, so it opens on the front page until signed in inside it once |
| D193 | The club home is kept on the phone (the last /api/club answer, by account and club, versioned) and drawn at once from it, then refreshed in place without moving what is on screen; cleared on sign-out, delete and "not on this club's list" | Built: `lib/clubHomeCopy.ts` (`gd.clubhome.v1:<account>:<club>`), drawn before the page's first paint once its scripts run; cleared on sign-out, delete and not on the list |
| D194 | Never from the copy: Live now, Cards to sign, Your next round — they fade in (160ms, none under Reduce Motion) when the fresh answer lands. No copy yet: the club header, the tab bar and placeholder cards, never the public face | Built: Cards to sign is never kept, Live now is not drawn from a copy (`fromCopy`), both fade in (`.club-fresh-in`); Your next round is still to come with booking |
| D195 | Fewer steps on the server: /api/club home in three waves at most after the token check; /api/account home answers first and tidies after; the club home asked for by the head script on its way | Built: `/api/club` home asks the club (with its art and home course), this account's row and the club's events together by the club's address (`clubHome`), then entries, season, outside, top scores, cards to sign and the phases together — two waves after the token, falling back to the old reads if the first cannot be read whole; the home asks check the token locally (`userFromClaims`, supabase-js `getClaims`: with the project's signing keys no round trip to Auth; it gives up noticing a sign-out elsewhere or a deleted account until the token runs out, an hour at most — every change still asks Auth); `/api/account` home answers first and claims and links after (Next's `after()`), so a newly claimed event shows on the next visit. Not done: asking the club home from the head script — the copy already paints at once, and it would put the sign-in token into every page's head script |
| D197 | A phone that belongs to the club never sees the public face on the way in — the hand-off spec of 16 Nov (placeholders: greeting 32 high, two cards radius 20 at 96 high, three date rows 56 high; the existing skeleton's breath) — held by a test | Built: the head script marks `<html data-club-member>` at the hinted club, the stylesheet hides the public face and shows the stand-in and the footer; `test:account` and `test:clubs` hold it |
| D198 | *Ross, 16 Nov 2026:* preload and then be snappy rather than lag each time. Inside a competition, Tee sheet · Scoring · Leaderboard switch at once with the animation; their data loads or refreshes behind | Built: the footer lights and slides at the tap (`going` in `ClubBarContext`); the club page fetches up to four unfinished competitions whole, and every competition page the other three (`prefetchWhole`, `CompAhead`), each drawn page asking again behind itself once if its copy is older than 8 seconds; the parts that ask who you are in a competition share one answer and keep it (`kept`/`peekKept` in `lib/accountClient.ts`); a page not fetched ahead lands on a stand-in (`comp/[code]/loading.tsx`) |

**The Clubhouse** (Ross, 16 Nov 2026, project doc `clubhouse-plan-2026-11-16`, final 20:30): a desktop-first office where a club's management and Green Dot staff run the club's side; members stay on phones. The full list is below (Ross pasted the project doc's decision list on 17 Nov 2026); where a decision carries a build note it is the one the code follows.

| # | Decision | Status |
|---|---|---|
| D199 | Clubhouse: club management and Green Dot staff run the club's side of the app | Agreed — built (k0–k2) |
| D200 | `/golf/clubhouse/[slug]`, its own tree; `/club/[slug]/list` redirects | Agreed, **then moved by D212 amended: the office is `/clubhouse/[slug]`**, sport-neutral, never under `/golf` (Ross, 16 Nov 2026). `/club/[slug]/list` redirects there |
| D201 | Officers act in the members app (make and edit competitions, on-the-day powers); Clubhouse users act in the Clubhouse; competitions can be made and edited in both | Amended by D214: the Clubhouse adds the season table, copy and repeat; New competition and Manage stay in the members app for Officers |
| D202 | Desktop first. Spreadsheet-like work is never held back for a phone; a phone gets what folds cheaply to one column, anything else says "Open this on a computer" — **amended by D264: nothing says that any more** | Built (k1, k2): the sidebar folds to a bar at 1024; Members, Competitions and Calendar fold to one-column lists, a row opening whole; paste, upload, download, bulk changes and Copy say "Open this on a computer" |
| D203 | House look; the club only at the sidebar head | Agreed — built (k1): the sidebar head carries the club's crest, name and colour as identity only, no art |
| D204 | New kit parts: sidebar, grid, hover and focus, ticked-rows bar, side panel | Agreed — built (k1): the `.ch-*` classes in `globals.css` (hover, focus, row, side panel, ticked-rows bar) |
| D205 | Overview · Members · Competitions · Calendar · Club settings | Agreed — built (k1, k2); **Memberships added between Members and Competitions by D225** |
| D206 | Members grid: name, email, club number, GUI number, index, standing, credentials | Agreed — built (k1); Gender, Born and Membership added by D226 |
| D207 | Credentials are ticked in the Members grid | Built (k1): `/clubhouse/<club>/members` — the grid, edit in place, paste, upload, download, bulk, 50 a page on the server. The list page redirects there |
| D208 | `lib/clubMay.ts` answers every "may this account do this"; nothing checks a role inline after it | Built (k0): `clubMay`, `credentialChangeIssue`, `removeIssue`; every server route and screen asks it; `test:clubs` fails an inline role check |
| D209 | A row without Plays here is in no field, board or stat | Built (k0) for the field: booking refuses it, the partner search leaves it out. No club board or club stat reads the list yet |
| D210 | The activity log records from the first change; its screen comes later | Built (k0), moved forward from (k1) because ticks are first given in (k0): `club_activity` (migration 092) — who, staff or not, when, what, which row by name, each field before and after, numbers as the screen showed them; a pasted list one line a row under one batch id. Index changes stay in `handicap_changes`. (k1) adds `list.download`, `staff.open` and `competition.copy`, and keeps 24 months (`ACTIVITY_KEEP_MONTHS`, the nightly cleanup). Screen: later |
| D211 | Sign out always visible (the 12-hour limit dropped) | Amended — built (k0): Sign out sits in the sidebar foot (the bar's menu on a phone) on every page; the Clubhouse sets no session limit of its own |
| D212 | The door: the site's own sign-in, no second password. Signed in, the last club used with Clubhouse opens; signed out, sign in and come back; signed in without Clubhouse anywhere, "You haven't been given access to the Clubhouse." with a line that the club's office can grant it and a way back. Never a blank page or a raw error | Built (k0). *Amended by Ross, 16 Nov 2026:* **greendot.live/clubhouse and /clubhouse/<club>**, not /golf/clubhouse — one address for every sport and any organisation (`app/clubhouse/`) |
| D213 | Grids paged at 50, searched on the server | Agreed — built (k1): `PAGE_SIZE` 50 in `lib/clubhouse.ts`, search, filters and order all on the server (`readListPage`) |
| D214, D215 | Competitions and Calendar in the Clubhouse: the season table, copy to another date, repeat weekly; the members app keeps New competition and Manage for Officers | Built (k2): the season table a year at a time; Copy and Repeat weekly (up to 26) for Officers, each made as New competition makes one; the Calendar a month at a time |
| D216 | Later: categories, desk tee sheet, billing | Agreed as later — **categories are now built (D225, stage (m))**; the desk tee sheet and billing remain later |
| D217, D224 | The list is a list: names, emails, the club's member number, the GUI number, the handicap index, credentials. No categories, fees, renewals or Green Dot numbers | Agreed; **categories amended by D225** (Ross, 17 Nov 2026). *Ross, 16 Nov 2026:* numbers **in full in the Clubhouse** (built (k0), `whole`), partly hidden on a phone as before |
| D218, D223 | Many clubs per account. An account's GUI number agrees across clubs. The members home opens the club last used; tapping the floating header goes to the next club (only with more than one), says which of how many, and wears a dot when another club has Cards to sign for this account. Season stats and Cards to sign per club; the handicap index one per account | Built (k0): the refusals gone; the hint carries every club, last used first (`club:pints\|lahinch`, `lib/tierHint.ts`); `/api/account` home lists them; `/api/club` home answers `myClubs` (only for more than one); `clubSwitch` in `lib/clubBar.ts`; the 200ms cross-fade a view transition, the header held; season filtered to the club's rounds and the account's own |
| D219, D220 | Credentials as three independent ticks on a list row: **Plays here**; **Officer** — edit access in the members app (New competition, Manage competition, tee times, No return, sign or void, Certify, Reopen, calling a competition off); **Clubhouse** — access to the Clubhouse, the list included, and granting Plays here and Officer. Clubhouse with or without Officer. Only an Owner or Green Dot staff ticks Clubhouse; Owner holds all. Today's admins get Officer and Clubhouse, owners everything | Built (k0), migration 092. *Ross, 16 Nov 2026:* the club owns its data; the organisation's people hold Clubhouse (admin access), golfers who edit on the phone hold Officer, some both; **Green Dot sets the club up and holds Owner**. So an owner holds Officer and Clubhouse always but **Plays here is free** — an owner need not play. `role` kept: `owner`, and `admin` mirroring "both" for a safe rollback |
| D221 | Separate sign-in | **Withdrawn** — D212: the Clubhouse uses the site's own sign-in, no second password |
| D222 | Green Dot staff (accounts Ross names by hand) open any club, finding it by search; logged and shown to the club as "Green Dot staff"; a line in the privacy notice | Built (k1): `green_dot_staff` (migration 093, rows added by hand), `/clubhouse?find`, every visit and change logged as "Green Dot staff", the pill in the sidebar, the privacy notice's Green Dot staff paragraph |
| D225 | **Memberships** (stage (m), Ross, 17 Nov 2026 — amends D217's "no categories"): a Clubhouse tab where a club names its memberships (Full, 6 Day, Junior…), each given a short code for the spreadsheet's Category column, and the days of the week it plays. No fees or renewals | Built (m2): `/clubhouse/[slug]/memberships`, `club_categories` (migration 094), the code made from the name and unique in the club, a weekday picker, deleted only when empty |
| D226 | A person's **gender** (Male, Female, not given) and **date of birth** (or not given): one value everywhere, provided by the club, never by the player; shown on their own account, read only — "contact your club" if they try to change it. Seen by the club's Clubhouse only | Built (m1, m4): `club_members.gender` / `birth_date`, mirrored from `account_details` for a linked row (the D179 pattern — on linking the account's stand, the row's fill gaps); Me's and the Club tab's **Your details** card; the grid's Gender and Born columns; the activity log notes a change, never the value |
| D227 | A membership's days decide when its people play: no membership plays any day. A competition with no memberships ticked admits those whose membership plays that day; **a membership ticked on a competition enters whatever its days say**. Without memberships set up, a competition cannot be limited to any | Built: `entryRefusal` in `lib/clubMembership.ts`, the one copy |
| D228 | A competition's **entry rules**, set at New competition: Men's and/or Ladies' (neither or both = everybody), any number of memberships, an age band. A man may not book a ladies' competition and a full member may not book a junior one; no gender recorded blocks a gendered competition, no date of birth an age band | Built (m3): `trip_private.entry_rules` (094), `CompForm.entry`, checked by `/api/club/booking` on every booking, said on the tee sheet ("Open to: Ladies’ · Aged 50 and over") and the Clubhouse's Competitions table; copies carry them |
| D229 | Ages count on a day the club chooses each season — 1 January unless it says otherwise (1 February, say) | Built: `clubs.age_date`, the Memberships tab's "Ages count on"; `ageCountedOn` |
| D230 | **Junior is a membership**, never worked out from an age — juniors sometimes move up early. No junior platform | Built: nothing derives a membership from a date of birth |
| D231 | An Officer may **Book anyway** somebody the rules refuse; it is logged | Built: `anyway` on the booking, `booking.override` in `club_activity` |
| D232 | Privileges are playing days only for now; more come with casual tee sheets | Recorded |
| D233 | A player's own tees follow their gender: a competition's player is made from the list row's gender (not given stays the men's, as before) | Built (m3): `insertPlayer`'s `gender` |
| D234 (M1) | **Events**: the Clubhouse's Competitions becomes Events — every club event, competitions and non-golf, in the season table, filtered by type and who sees it; competitions keep their editor, non-golf events are made and changed in a side panel | Built (c1a, c1b): `/clubhouse/[slug]/events` (`/competitions` redirects), `EventPanel`, `CompPanel` |
| D235 (M2) | Seven types: Competition (members book), Golf (on the calendar, not booked here), Social, Club business, Other sport, Course, Miscellaneous — COMP GOLF SOCIAL BUSINESS SPORT COURSE MISC | Built: `lib/clubEvents.ts`, `club_events` (095) for all but Competition |
| D236 (M3) | Visibility per event: Members or Office only — the Clubhouse alone, never the members app, not even an Officer without Clubhouse; filtered on the server. *Ross, 17 Nov 2026:* **Office only is never for golf** — anything that affects the tee sheets is the members' (Competition, Golf, Course always Members) | Built: `noteIssue`, 095's CHECK, `membersNotes` in `app/api/club/club.ts`; `test:clubs` holds that no answer to an Officer without Clubhouse carries an Office only event |
| D237 (M4) | Club settings: "Show to members" per type, on by default; a Members event of a type not shown stays in the Clubhouse | Built: `ShowToMembers`, `clubs.hidden_event_types`; the golf types (Competition, Golf, Course) always shown, per D236 |
| D238 (M5) | A member's "From my clubs, show me": a tick per type for the club home and Upcoming, all on to start; Competitions always show | Built: `ClubEventTypesCard` on Me and the club's Club tab, `account_event_prefs` (095), applied on the server |
| D239 (M6) | The members app shows the club's own events on the club calendar and Comps' Upcoming, with type chips; a tap opens a simple sheet (title, date, times, where, notes) — no booking, no tee sheet | Built: `ClubNotes.tsx` (`NoteRow`, `TypeChips`, `NoteSheet`) |
| D240 (M7) | **Event presets**: named templates (a code unique in the club, "used for", format, allowance, entry rules, up to four runs of tee times with sunrise and sunset, when booking opens; one the default). New competition can start from one; a calendar row names one, its own values overriding; values copied in when made | Built (c1b): `lib/clubPresets.ts`, `club_presets` (095), `PresetPanel`; both New competitions start from a preset |
| D241 (M8) | Players per tee time per run (threes at ten until one, then fours at fifteen); sheets saved before read exactly as today | Built (c0): `TeeBatch.groupSize`, `slotGroupSizes`; `test:tee-sheet` |
| D242 (M9) | Sunrise and sunset worked out here, free, from the course's location and the day, Irish time. The grid: the next full hour after sunrise less whole intervals; a sunrise start the first grid time at or after it; a sunset end the last at or before sunset less the offset. *Ross, 17 Nov 2026:* a course with no location is worked out for Greenwich (GMT), never refused; **a tee sheet shows sunrise at its head and sunset at its foot**; the default last tee time is **4h30 before sunset for competitions, 1h for casual golf** (casual tee sheets a pending concept) | Built (c0): `lib/sun.ts` (NOAA formulas), `COMP_LAST_TEE_BEFORE_SUNSET_MINS`, `CASUAL_LAST_TEE_BEFORE_SUNSET_MINS`; the competition tee sheet's Sunrise/Sunset lines |
| D243 (M10) | New competition and the competition editor take several runs with their own players a time, or a preset; Copy and Repeat weekly work on any sheet | Built (c0, c1b): `CompForm.batches`, `CompBatches`, `compFormFrom` |
| D244 (M11) | Tee sheets changed after the fact: every booking stays at its tee time and the member stays in if they may still enter (Book anyway kept); otherwise refused, each member named with why. A competition made in the Clubhouse whose sheet can't be made is not made, and says why | Built (c1b): `planSheetChange`, `changeOne`; never once a card has started or the results are certified |
| D245 (M12) | Import a calendar, in the Calendar tab, desktop only: copy the prompt or download the template; paste or upload the CSV; preview; import | Built (c2): `/clubhouse/[slug]/calendar/import` |
| D246 (M13) | The prompt is written live from the club (memberships, presets, home course, season, types and visibility, the header, the rules, two example rows), stamped "Green Dot calendar format v1"; another version is refused with what to do | Built: `calendarPrompt`, `calendarTemplate`, `readCalendarFile`. A blank Memberships keeps the preset's (with none, whoever plays that day) — the prompt says so |
| D247 (M14) | CSV v1: Ref, Date, End date, Start, End, Title, Type, Visibility, Memberships, Gender, Min age, Max age, Format, Allowance, Preset, Where, Notes, Check | Built: `CALENDAR_COLUMNS`; a COMP's Start and End also take SUNRISE and SUNSET, and replace the preset's tee times with one run at its first interval and players a time (Ross, 17 Nov 2026) |
| D248 (M15) | The preview before anything saves: New / Changed / Same / Not in this file; bad cells in rust with why; Check rows amber, imported only when ticked; nothing deleted | Built: amber is the gold tint (the Clubhouse draws no boards, so it never reads as winning) |
| D249 (M16) | Import through New competition's own path, matched on Ref else day and title — the same file twice changes nothing; one failing row never stops the rest; a competition whose sheet can't be made or changed comes in without it; one batch id in club_activity, a line per row | Built (c2): `runCalendarImport`. **Differs on one point**: a *new* competition whose tee sheet can't be made is not made (as D244) — the platform has no competition without a tee sheet — and the row is listed to fix and import again; an existing one keeps its old sheet and says so |
| D250 (M17) | No AI calls from Green Dot; no .ics import (it goes through the chatbot like any file) | Built: nothing calls a model; `test:clubs` holds `lib/sun.ts` to no fetch |
| D251 (M18) | The hand-off spec is the 0–8 block, the old visual fields optional under section 7 | Done (c3): "Hand-off spec" above |
| D252 | **Clubhouse is its own level of admin** (Ross, 17 Nov 2026): making, changing and copying competitions in the Clubhouse, the club's events, presets and the calendar import are Clubhouse holders' (and Green Dot staff's); Officers keep their golf editing on the phone in the members app | Built: `keep_calendar` in `lib/clubMay.ts`; Copy moved from Officers to Clubhouse |
| D253 | **A club's casual tee sheet** (Ross, 17 Nov 2026): members book casual golf on the members app; the Clubhouse keeps it in full — a birdseye of the day and the week, booking, moving and taking off anybody | Built: `lib/clubTeeSheet.ts`, `/api/club/tee-times`, migration 096; `keep_tee_sheet` in `lib/clubMay.ts` |
| D254 | The sheet runs from the first time at or after sunrise on the interval's grid to the last an hour before sunset, on the home course (Greenwich without one); one course a club for now | Built: `casualDay`; a club with two courses is a pending concept |
| D255 | Tee times takes Board's place in the club footer; the competition in play moves to Comps (Live now). Competition tee sheets are reached from the competition, and from its overlay | Built: `ClubTabBar`, `ClubTeeTimes`; an old `?tab=board` opens Comps |
| D256 | A competition takes the casual sheet from its first tee time to its last, no gap either side; one on another course takes nothing. Its overlay says so and carries **Book** to its own tee sheet for a member who may enter it | Built: `competitionOverlay`, `covers` |
| D257 | Block booking is a Golf or Course event ticked **Takes the tee sheet** — its start to its end, all day without times — never Office only, on the calendar and importable like any event | Built: `club_events.blocks_tee_sheet` (096, a CHECK); a calendar import keeps an event's tick |
| D258 | A member books themselves, members from the list (each checked for the day) and guests by name, who take a place and read "Guest of …"; one tee time a member a day; booking opens seven days before at 7 pm; cancelled up to the tee time by the member or whoever booked them — all changeable by the Clubhouse | Built: `casualBookIssue`, `casualCancelIssue`, `readCasualSettings` |
| D259 | A membership's "Books tee times" tick follows its playing days; a club with no memberships set up lets everybody who plays here book. Times within a day per membership is a pending concept | Built: `club_categories.books_tee_times` (096), `bookingRefusal` |
| D260 | Officers get nothing extra on the casual sheet; the office books anybody, any day, before booking opens — never under an overlay or past a time's places | Built: the `office.*` actions |
| D261 | **A new competition's first tee time follows sunrise** (Ross, 17 Nov 2026): from scratch, the first time on the grid at or after sunrise for the day and course — sunrise 08:12 at fifteen minutes is 08:15, then 08:30, 08:45 and 09:00 on the hour — moving with the day, course and interval until one is typed; a first time before sunrise is said, never refused | Built: `sunriseFirstTee`, `beforeSunriseLine` in `lib/clubComp.ts`, `useSunriseStart` (New competition and the Clubhouse's panel) |
| D262 | **The Clubhouse's admin stays in the Clubhouse**: no tee sheet editing from it goes out to the members app. A competition opens on the Clubhouse's own page — its details, Change, and its tee sheet to book, move and take off | Built: `/clubhouse/[slug]/events/[code]`, `office.*` on `/api/club/booking`; a trip or event the club runs on its own pages opens in a new tab |
| D263 | **Clubs are set up by Green Dot, from /admin — not by members** (Ross, 17 Nov 2026): a name and the Green Dot account that owns it (username or email), verified at once; a test club is made the same way. The member's "Set up your club" is gone and `create` is refused. **No link into the Clubhouse unless the account holds it**: the old `/club/[slug]/list` address goes to the club's own page, and only the Club tab and `/account/club` link in, each gated | Built: `makeClub` in `app/admin/clubs/actions.ts`, `provisionClub`, `NewClub` |
| D264 | **The Clubhouse works on a phone, as well as is reasonable** (Ross, 20 Nov 2026 — amends D202): nothing in it sends a phone to a computer. Both tee sheets lay each time out through one `SheetRow` — a time column and the places across on a computer, the time in a gutter and the places two by two on a phone, the empty places folded into one "Book · n free"; the week strip and the section menu scroll sideways to what is open; Members ticks rows on a phone too (its bar scrolling sideways), its filters behind one Filters button; Events, Presets, New event, New competition, Change, Copy, Block, Settings, Paste, Upload, Download and Import a calendar all open on a phone, every panel full screen; the hover tint follows a pointer that hovers, a finger's press tinting while it is down. The spreadsheet grid itself stays a computer's — a phone gets the one-column list with Details | Built |
| D272 | **Clubhouse copy and tidy** (Ross, 21 Nov 2026): the club switcher's chevron sits inside the select's padding; the phase "Announced" reads **Scheduled** on screen (key `announced` unchanged); Events' "Course or where" is **Location**, and a club whose competitions name one course says "Course" in a course row; Memberships shows categories only — "Ages count on" sits behind a gear ("Membership settings", a side panel) and "In the spreadsheet" is gone | Built: `ClubhouseShell`, `PHASE_WORDS`, `Events` (`oneCourse`), `Memberships` |
| D273 | **The Members grid reads cleanly on a computer** (Ross, 21 Nov 2026): a fixed-layout table, every header and cell on the same padding, so headers line up with their cells (Born right-aligned; a sort arrow never moves a header's text); column widths dragged from a header's edge (a keyboard handle too, ← →), remembered per browser (`gd.clubhouse.members.cols.v1`, localStorage in try/catch), a double-click fitting the widest cell on the page, 72–480px; the tick column fixed, Name resizing; long values truncate with an ellipsis and show whole on hover; Details is a ⋯ button named "Details for <name>" | Built: `lib/gridColumns.ts`, `MembersGrid` |
| D274 | **One Edit per event in the Clubhouse, Copy inside it** (Ross, 21 Nov 2026): Change and Copy become one **Edit** on each row (wide and narrow) and on a competition's own page; the edit panel sets every answer the make form has — who can watch now included, written only when it changes — and its footer is "Save the changes", **Copy** (the saved competition into the copy flow, said when there are unsaved changes) and Close; a started or certified competition still says why and still copies. **Fixed**: every competition's Edit failed with "Could not make the competition" — the tee sheet read embedded `players(...)` from `tee_assignments`, which has two keys to `players` since 065 (`player_id`, `booked_by`), so the read was refused; it names `players!player_id` now, and a fault says what was being done (`failWords`) | Built: `route.ts`, `CompPanel`, `CopyPanel`, `Events`, `CompOffice`; `test:clubs` |
| D275 | **"Plays here" is retired as a tick: playing follows the membership** (Ross, 21 Nov 2026): a member plays here when their membership plays on at least one day; **a member with no membership plays, until Ross decides otherwise**. Which days they play is the membership's, as before. The Members grid's column, the bulk Plays here / Doesn't play buttons, the row panel's tick, the two filters, Overview's figure and the download's column go; a hand change is refused ("Playing follows the membership now"). Every answer is the same wherever the old tick and the membership agreed. `club_members.plays_here` is no longer read or written, and migration 098 drops it (paste after the deploy) | Built: `playsByMembership` in `lib/clubMay.ts`, `asRow` in `app/api/club/rows.ts`; `test:clubs` |
| D276 | **The Clubhouse Overview is a control centre** (Ross, 21 Nov 2026): the three equal cards go. A search across the top finds events, competitions, members (for whoever keeps the list) and a date, each result opening its own section in the same window (Ross: "Same window"); "/" focuses it. **Today | This week** (Monday to Sunday) drives Yours and What's on. **Yours** is what the signed-in account is in — playing, booked, entered, and a club event they added (a club event has no bookings, so "booked by them" is adding it) — with a `role` kind shaped for the role model and filled by nothing yet. **What's on**: competitions with phase and booked of places, the club's own events, the casual tee sheet's places booked. **Alerts** stay whatever the toggle says, because one from last week still needs doing. Cards are sized to what they hold, a card the account may not use is not drawn, and the list's figures sit in a strip at the foot | Built: `lib/clubOverview.ts`, `Overview.tsx`, `OverviewSearch.tsx`, `readYoursFacts`; `test:clubs` |
| D277 | **Club locations and the day view** (Ross, 21 Nov 2026). The club lists its locations in Club settings, linked from the Overview: **its courses come in unasked — Course 1, Course 2…, and a one-course club's is just "Course": everything golf is there and nobody is asked** (Ross: the vast majority of clubs have one course and play the vast majority of golf on it); a second course can be added before any competition uses it. Rooms (the bar, the function room) are the club's own names. A competition's location is its course. A Golf or Course event is on the course (asked only where there are two); any other event picks a room or **Other**, free text. Start and end times as stored; no end is an hour; no start, or several days, is all day. Overlaps sit side by side. An imported Where is matched by name, else kept as text and said so. **The day view**: a day on the Calendar opens every location side by side, an hour rail on the left, the courses first in the club's tint, each booking a block for its length, a line at now on today; Office only events still show only in the Clubhouse | Built: `lib/clubLocations.ts`, `lib/clubDay.ts`, `ClubLocations`, `DayView`, migration 099; `test:clubs` |
| D278 | **The members app is for using the club** (Ross, 21 Nov 2026). Home: the code box, Join and Make an event move to the very bottom, quiet ("Joining something else?"). **New competition leaves the members app for everyone** — competitions are made in the Clubhouse only; `NewCompetition.tsx` is deleted and `/api/club/competition` refuses a make that does not come from the Clubhouse. The "Members only" pill goes (club events need no label); an outside event shows its event code in the same pill. "Open" / "Semi-open" pills have nothing to read yet (no competition stores guest booking) and wait for it. "Outside the club" becomes **Other events**: only events the member plays in, Upcoming then Previous (three, then Show all). Your season stays a heads-up and opens Stats. A competition's leaderboard before play says "This competition hasn't started yet." A one-course club's competition header names no course | Built: `ClubView.tsx`, `competition.ts`, `compPhase.ts`, `read.ts`, `outsideEvents`; `test:clubs` |
| D279 | **A tee sheet says why before it offers Book** (Ross, 21 Nov 2026): a member the competition's entry rules refuse sees a notice card at the top of its tee sheet, reason first ("This is a ladies' competition — you're not eligible to book on this tee sheet." — gender, membership, age band or playing day, `notEligibleLine` over `refusalWords`), and no + Book; the times still show. Officers keep Book and Book anyway for others. On the casual Tee times a competition card the member cannot enter says why in place of Book (`Overlay.bookNote`). The refusal rides in the sheet's `state` answer — no extra ask | Built: `CompTeeSheet.tsx`, `ClubTeeTimes.tsx`, `teeTimes.ts`, `lib/clubMembership.ts`; `test:clubs` |
| D280 | **A club member lives in their club** (Ross, 21 Nov 2026). The club name opens a list of the member's clubs under the header — crest, name, a dot where a card waits, the one here ticked — and choosing one goes there; the tap that cycled clubs is gone (`clubSwitch` now lists, `myClubs` carries each crest). The account icon opens **Your page**, `/club/[slug]/me` — handicap, your details, what you see, Your events and the account (username, password, sign out at `/account`) — whose way back is always the club's home; the Club tab reaches it too. "Home" for a club member is their last club's home everywhere: the green dot on the club page, Back and Your page on `/account`, Home on `/home` (`homeHref`, `myPageHref` in `lib/tierHint.ts`). The Clubhouse row stays gated on the Clubhouse credential (an owner always holds it). Comps or Home inside a competition is asked for outright and checked; the footer keeps its set until the address has left the competition | Built: `ClubView.tsx`, `ClubTabBar.tsx`, `me/`, `lib/clubBar.ts`, `lib/tierHint.ts`; `test:clubs` |
| D281 | **Live now means something is happening** (Ross, 21 Nov 2026): never a season-long event — a series or continuous league (an order of merit), a knockout over weeks, a run challenge, a club match play (D266), or anything spanning more than 14 days (`seasonLongOf`: the event's own shape first, its length the backstop for one whose shape says nothing); Golfer of the Year is no event and never listed. A one-day club competition is live only while In play. Any other event is live from its first tee time on its first day to the end of its last, the evenings between days included — whether or not the member is in it. One rule, `clubEventLive` beside `clubEventWhen` in `lib/clubs.ts`; Home's and Comps' Live now read it | Built: `lib/clubs.ts`, `app/api/club/store.ts` (`seasonLong`, `liveFrom`), `ClubView.tsx`; `test:clubs` |
| D282 | **Comps is short, and the club's pages are quicker** (Ross, 21 Nov 2026). Comps' Upcoming shows the next two weeks (`COMPS_DAYS_AHEAD`), the club's own events among them, then **See all** — the whole season on its own page, `/club/[slug]/comps`, asked for only when opened (`/api/club` home with `whole`); My entries is unchanged; Results shows ten, then **More results** ten at a time. The members home carries only what Home and Comps show — on now, the next two weeks, everything entered, the latest ten results, the match plays — and says how many more there are (`more`). A competition's art and headers are its layout's (`comp/[code]/layout.tsx`), kept while moving between its pages, so opening one is the footer's tabs sliding out once and the page filling in; the loading screen is only the page's part. Speed: a day's casual tee sheet checks the sign-in locally and starts its reads beside it, the day's competitions in one read, today's sheet asked for ahead of the tab; a competition reads its club and round in one go and its sheet in one wave. Every club answer, tee-times and booking answer and competition page logs its time (`lib/timing.ts`, a Server-Timing header) — the before and after are read off the live site | Built: `ClubView.tsx`, `comps/`, `comp/[code]/layout.tsx`, `teeTimes.ts`, `teeTimesStore.ts`, `bookingStore.ts`, `ClubTeeTimes.tsx`; `test:clubs` |
| D283 | **Stats is your season** (Ross, 21 Nov 2026): the Stats tab — the club area's and a Green Dot member's own — opens on this year's summary: Rounds, Average points, Best points and Average gross; the best round named by its competition or event, with its date, points and gross, opening it; the handicap index this year where any change was logged, from where it started to where it is with a quiet line of each step (`handicap_changes`); the rounds by the event's name, the course under it. Then **In depth**, a fixed set, each figure only where cards recorded it and saying how many rounds it is from: fairways hit, greens in regulation, putts a round, and the scoring mix (birdies or better, pars, bogeys, doubles or worse) a round. Statistics a golfer chooses are a pending concept. Home's "Your season" stays three tiles | Built: `lib/cardSummary.ts` (`seasonOf`, `seasonDepth`, `indexTrend`), `app/api/stats/season.ts`, `SeasonSummary` in `app/components/Season.tsx`; `test:card-summary` |
| D284 | **A club competition is played inside the club** (Ross, 21 Nov 2026: "all club comp activity incl scoring and leaderboard inside the members app", Manage competition too): the scorecard, a match play's match and its card, the full bracket, and Manage competition (the organiser area, its Tags, day formats, Formats, bracket setup, Trip Setup and the tee sheet wizard) open at the competition's own address, `/club/<slug>/comp/<CODE>/…`, under the club's footer — Scoring (Matches) lit on the card and a match, Leaderboard (Draw) on the bracket — never the event's tab bar. Each is the event's own screen, unchanged, behind the competition's members-only door; a scorecard keeps the whole screen (no art or club header). The event's own address of any of them sends a competition into the club, so an old link or bookmark lands inside too; a screen the club does not mount (a round summary, say) still opens at the event's address | Built: `(play)` routes under `app/club/[slug]/comp/[code]/` (`inClub`, `readCompGate`), the Summary and sections moved to `(frame)`; `clubCompRoot`/`tripHomeAt` in `lib/tripPaths.ts`; `clubPathOf` and the new footer paths in `lib/clubBar.ts`; `intoClub` in the trip tree's `kind.ts`; `/club/comp/<code>?to=`; `test:clubs` |
| D285 | **An event outside the members app is linked to it, or not** (Ross, 22 Nov 2026): a standalone event on the club calendar that opens outside the members app (its own pages) shows two chain links where its status would be — an event outside the app has no status the club tracks. Linked, members see it in Comps, Home and Other events; **tap the links and it is unlinked**: it stays under the club, the Clubhouse still reads its dates and details (Events, Calendar, the day) greyed, and no member's list, the public face or the Overview's What's on has it. Tap again to link it. The Clubhouse's (`keep_calendar`) tap; every change on the activity log (`event.link`, `event.unlink`). **The setting lives on the event**: its own "Run by <club>" card (organiser area, Trip Setup) has the same switch, for the club's Officers or the event's owner. A competition and the club's own events are never unlinked. Put under a club again, an event starts linked | Built: migration **100** (`trip_private.club_unlinked_at`, paste after the deploy — before it nothing is unlinked and the tap says "not set up yet"), `readClubEvents(…, { withUnlinked })`, `linkable` in `lib/clubhouse.ts`, `event.link` in `clubhouse.ts`, `LinkToggle`, `runEventClub` `linked`; `test:clubs` |
| D286 | **Your bookings first, and a real Calendar** (Ross, 22 Nov 2026). The members Home leads (after a card waiting to be signed) with **Your bookings** — every competition the member is on the tee sheet for ("Booked in at 14:00 with:" and the others one a line), their casual tee times, and their next match play matches (the old "Your next match" folded in) — each a tap to it. **Club calendar is Calendar**: Home shows the next three things on, then **Open calendar** — its own page, `/club/<club>/calendar`, Home still lit, with **Month** (the default, remembered per phone; a grid, Monday first, a mark a kind — competition, tee sheet open, club event — and the days the member is booked in the club's tint; a tap on a day opens Day), **Week** (seven columns against the hours, like a phone's calendar app) and **Day** (a scrollable timeline: the casual tee sheet's open hours down the left in the club's tint, competitions and the club's events beside it, a line at now). Every item says, from the member's side: **Booked in at 14:00 with:** and the names, **Book now**, **Booking hasn't opened. Opens …**, **You aren't eligible to book this event.**, **Booking closed**, **Results are in** — booked said first, then over, then not eligible, then not open. A competition whose booking is live opens straight into its tee times, otherwise its Summary; the open sheet opens Tee times on that day; a club event its sheet. Office-only and unlinked (D285) events never show | Built: `lib/clubCalendar.ts` (the lines, `compStatus`, `openStatus`, `compHref`, `viewRange`, `bookedItems`, `nextItems`), `/api/club/tee-times` `calendar` (`calendarItems` in `app/api/club/teeTimes.ts`, a competition's seats and opening read with it), `app/club/[slug]/calendarParts.tsx`, `app/club/[slug]/calendar/`; `test:clubs` |
| D287 | **The Calendar, tightened** (Ross, 22 Nov 2026). Home's **Calendar** title is the way in, a chevron beside it (the separate Open calendar link gone). **Week is seven rows, a day each** (a phone's own training calendar the model): the day down the left, today ringed, that day's things side by side as cards — a colour down each card's left edge, the title, the time and the member's own line — a busy day scrolling sideways, words wrapping and the row growing rather than shrinking below what reads; the hour-grid week is gone (Day keeps its timeline). **The club's frosted card (crest, name, Members, the account button) is Home's alone** — the Calendar, a competition, See all, an award and Your page lose it, their tops denser — and on Home it sits under the sticky header as the page scrolls, never over it (it was drawn on the same layer, later in the page) | Built: `WeekView`/`WeekCard` in `app/club/[slug]/calendar/CalendarScreen.tsx`, `KIND_BAR` in `calendarParts.tsx`; `ClubHeader` at `z-20`; `test:clubs` |
| D288 | **Labels** (Ross, 22 Nov 2026). A **label** is a named colour a club makes in the Clubhouse (Events → **Labels**, beside Presets): who belongs, as one or more groups — any group matching is enough — each group memberships, gender, an age range and a handicap range ("Men's": Men's Full; or Men's Senior; or Junior, under 18, handicap under 12). Colours from the eight team colours, never emerald or gold. **(1) A label decides who may enter**: picking it on a competition fills who may enter from it, still adjustable — who-may-enter gains a handicap range. **(2) The handicap judged is the member's index when they book or enter** (a match play's on the day entries close) — **written so another source can stand in later** (Golf Ireland's, `docs/golf-ireland.md`). **(3) A club event may carry a label too**; with none, **every event type has a default label** (Competition, Golf, Social, Club business, Other sport, Course, Miscellaneous) the club may change in the Labels module, so everything on the calendar has a colour. **(4) The colour travels like the running app's**: a card in a list wears it down its left edge (Calendar week and month, Comps, Your bookings, the Clubhouse's Events and Calendar, the tee sheet's overlays), and an event's own page a soft faded wash of it behind the page's background at the top. Migration 101 (labels; a label on competitions, presets and club events), read fail-soft | Built: `lib/clubLabels.ts` (defaults by type, `readLabel`, `labelIssue`, `colourFor`), the gate in `lib/clubMembership.ts` (`LabelGroup`, `LabelGate` inside `EntryRules.label`, judged by `entryRefusal` — `label`, `no_index`), migration 101 (`club_labels`, `club_events.label_id`), `app/api/club/labelsStore.ts` (the one writer keeping each competition's copy in step, `freshEntry` on every competition write, `indexesOf` — where another index source stands in), `labelIndex.ts`, Clubhouse `labels`/`label.save`/`label.delete`, Events → Labels (`LabelPanel`), the picker in `EntryRulesFields` and `EventPanel`; colour on the Calendar, Your bookings, Comps, Live now, the casual tee sheet, the Clubhouse's Events, Calendar and day view; `.label-wash` on a competition's pages (the style guide's third gradient exception); `test:clubs` |
| D289 | **The Calendar, refined** (Ross, 23 Nov 2026). **(1) The club's art is the same on every club page** — Home's tall, strong picture; it had shrunk to a faint strip off Home (`Art` in `ClubView.tsx` always `club-art-home`). **(2) Week is a timescale**: the hours across the top, the phone's width sunrise to sunset across the week (the home course's sun, from the calendar's answer, `sun`), scrolling right to midnight for evening events; seven day rows under it, the day's name sticky on the left, each thing at its time in its label's colour, a short one's card running past its end so its words read and the row growing a lane where two would touch; the dark either side of the day faintly shaded, a line at now on today. **(3) The open tee sheet is no event of its own**: not on the month's marks, the week or the day — only the member's own casual time shows, as "Your tee time" at its time; a tap on a free time in the week or the day goes to the open tee sheet's booking that day, and where booking cannot be done the day says why | `CalendarScreen.tsx` (`shown`, `bookable`, `WeekView`), `calendarParts.tsx` (`SunTimes`), `app/api/club/teeTimes.ts` (`calendar` answers `sun`; a booked open item is the member's time), `test:clubs` |
| D290 | **See all by the week** (Ross, 23 Nov 2026). Comps' See all (`/club/[slug]/comps`) heads each week — This week, Next week, then Week of Mon 7 Dec, a thing with no date under Date to be set — and the Calendar carries a list icon beside its title going to it | `weekHeading`, `byWeek` in `lib/clubCalendar.ts`; `SeasonList` in `ClubView.tsx`; `IconList`; `CalendarScreen.tsx`; `test:clubs` |
| D291 | **The footer on See all, and the error flash** (Ross, 23 Nov 2026). See all (`/club/[slug]/comps`) wears the club footer with Comps lit. The brief "Could not load this page" before most page changes was the club footer breaking React's rules of hooks: it returned early on a page with no footer (See all, Your page) before some of its hooks, so a tap between such a page and one with a footer rendered a different number of hooks and React threw; the site's error screen showed until the new page landed. Every hook now comes before the return, and `npm test` runs the rules-of-hooks lint over the whole site (`test:hooks`) | `ClubTabBar.tsx`, `barOf` in `lib/clubBar.ts`, `comps/page.tsx`, `SeasonList`, `scripts/eslint-hooks.config.mjs`, `test:hooks` |
| D292 | **The label colour through the members app** (Ross, 23 Nov 2026: "the colour motif should persist sitewide"). Every list row and card for a competition, a club event or a match play carries its label's colour down its left edge — Comps' featured and Live now cards and every row in Upcoming, My entries, Matches and Results; See all; Home's Live now, Your bookings and next match; Other events — through one `accent` on `ListRow` and one `labelEdge` for cards. The server sends each club event its colour (`membersNotes`, `ClubNote.colour`), and a club event's sheet wears the same soft wash at its head as a competition's pages. **Fixed the same day**: competitions on Comps showed no colour because the members home's fast first read (`clubHome` in `app/api/club/store.ts`) never set one — it now reads the competitions' entry rules and the club's labels with its other reads, and leaves out an unlinked event (D285) as the slower read always did | `ListRow accent` in `app/components/ui.tsx`, `labelEdge`, `EventRow`, `NoteListRow`, `MatchList` in `ClubView.tsx`, `NoteSheet` in `ClubNotes.tsx`, `membersNotes` in `app/api/club/club.ts`, `test:clubs` |
| D293 | **The feed lives on Home** (Ross, 23 Nov 2026; M1) — the club home under Your bookings (D286), `/home` under Live now and Coming up (it has no Your bookings). No new tab; both footers unchanged | `app/components/feed/` on `ClubView.tsx` and `HomeScreen.tsx`; `test:feed` |
| D294 | **Streams** (M2, amended 24 Nov 2026): **Friends**; **Club** — only inside that club's area, in its skin; **Comp** — one stream with a picker of recent comps (D300); **Team** — an interclub panel, switched on once the Clubhouse lists interclub teams (a job of its own). No all-Green-Dot stream. Each stream's query returns only its own items, and nobody off a team gets anything from a Team stream | `inStream`, `pillsFor` in `lib/feed.ts`; `test:feed` |
| D295 | **Switching** (M3): a pill row at the top of the feed and a sideways swipe (the browser's own scroll snap, no library; instant under Reduce Motion). A live Comp first, then the member's streams in their order. The last stream looked at is remembered on the phone | `FeedStreams.tsx`; `pillsFor` |
| D296 | **Audience** (M4, amended 24 Nov 2026): **Friends and my clubs** (the default) or **Only me** — close friends is not built. It governs the feed only, never a leaderboard, scorecard or tee sheet. Only me in the settings always wins; otherwise a card's own choice at signing, else the setting. "My clubs" counts anybody sharing the place a card was played — its club, its event | `effectiveAudience`, `mayView` in `lib/feed.ts`; `feed_settings.audience` (102) |
| D297 | **Friends are mutual** (M5): request, then accept; either removes it, and it survives either leaving a club. Found **only** by searching the lists of the clubs the searcher is on — two characters at least, at most 20 results, only rows linked to a Green Dot account, name and club only, never browsable. Juniors never appear and can neither send nor receive a request. **Friends are a subset of the members** (Ross, 24 Nov 2026) | `searchTerm`, `friendState` in `lib/feed.ts`; `app/api/feed/friends.ts`; `friendships` (102) |
| D298 | **Close friends: not built yet** (Ross, 24 Nov 2026 — "No need for close friends yet, just friends"). M6 (a private one-way list) waits | — |
| D299 | **Status** (M8): optional, 140 characters, written on the sign/finalise step — the only free text besides comments. Never blocks signing; the step shows the audience with a per-card change; the owner edits or deletes it afterwards. No status without a card; no photos | `statusIssue`, `counter` in `lib/feed.ts`; `CardStatus.tsx` in `app/scoring/` |
| D300 | **Streams are the member's** (Ross, 24 Nov 2026): a **+** at the end of the pill row opens the streams page — add or remove Friends, Comp, each of their clubs (Team once interclub panels exist); the list is kept on the account, so it follows them to any phone. **Comp** opens on the most recent comp they played in; a sideways row of recent comps — theirs, ongoing or finished in the last 30 days, then their clubs' competitions — picks another, **kept until they play a newer one**. Ongoing events show their match play results and leaderboard moves | `readStreams`, `orderComps`, `shownComp` in `lib/feed.ts`; `feed_settings.streams` (102) |
| D301 | **Comments and the dot** (M9): a comment, and a one-tap dot, on a card. A viewer sees a comment (and the item announcing it) only if they may see the card. The card's owner deletes any comment on it; authors delete their own | `mayViewChild` in `lib/feed.ts`; `app/api/feed/social.ts`; `feed_dots` (102) |
| D302 | **Feed items** (M7): one per card when signed — in a club competition only once the marker co-signs; highlights worked out automatically (eagle or better, hole in one, personal best — the lowest gross over a complete 18 at that course with an earlier card to beat — handicap cut, won a competition); comments; match results; leaderboard moves in a comp (a signed card putting its player in the top three). Live players only in the **On the course** strip, never as items. No hole-by-hole items | `cardFacts`, `cardHighlights` in `lib/feed.ts`; `app/api/feed/write.ts` |
| D303 | **Report** (M11) any card, status or comment: a club card's to that club's Clubhouse (Alerts → Reports), anything else to Green Dot's `/admin`. A report hides nothing until somebody takes it down | `reportDestination` in `lib/feed.ts`; `feed_reports` (102) |
| D304 | **Out of the feed entirely** (M12): juniors (a D108 junior profile, or a membership the club marks Junior — migration 102), players with no account (names on a card only), runs | `mayView`; `juniorsByMembership` in `app/api/feed/store.ts`; `club_categories.junior` (102) |
| D305 | **One activity table, written and read by the server** (M13): `feed_items`, visibility decided on the server, never trusted to a phone. Club and Comp streams served from one shared copy each (`lib/sharedCopy.ts`, 30 seconds), paged newest first, asked after Home paints and never inside the club home's own answer. Items are kept 400 days | `app/api/feed/`; `FEED_COPY_SECONDS`, `FEED_KEEP_DAYS` in `lib/feed.ts` |
| D306 | **The sign step is part of scoring** (M14 — scoring changes last and least): the status sits after the last score only, on the step with Commit / Sign the cards; score entry itself is untouched and an empty status signs exactly as before | `app/scoring/LiveScoringFlow.tsx`, `CardStatus.tsx` |
| D307 | **A comment on your card puts a dot on Home** (M10) — beside the Feed heading and on the stream it is in, never on a footer (D293). No email | `commentsSince` in `app/api/feed/store.ts`; `feed_settings.comments_seen_at` (102) |
| D308 | **The test club** (Ross, 24 Nov 2026; M1): a club can be a **test club** (`clubs.is_test`, migration 103 — Pints Golf Club is the one), and **fictional accounts** are made on the server with the email confirmed, on the **`.invalid` domain** (`<username>@pints.greendot.invalid`, `test_accounts`). **Nothing is ever sent to such an address**: every Resend email goes through one sender that refuses it first, and the account screens never ask Supabase to send it a code — seeding sends no email and the Resend count does not move | Built (s0): `lib/emailGuard.ts` (`undeliverable`), `lib/sendEmail.ts` (the one sender), `lib/accountClient.ts`; `test:test-club` |
| D309 | **The characters live in `data/test-club/characters.json`** (M2): name, handicap, gender, membership, voice, who they needle and defer to, how often they comment. Fictional only — a test fails on any name in a deny-list Ross extends | Built (s1a): `data/test-club/characters.json`, `deny-list.txt`, `readCharacters`/`deniedName` in `lib/testClub.ts`; `test:test-club` |
| D310 | **One password for every fictional account** (M3), from `TEST_CLUB_PASSWORD` (Vercel, set by Ross), so Ross can sign in as any character. The reseed signs in as each character the same way (the account store's own `passwordSignIn`) and calls the club's own routes with that token, so every rule a real member meets, a character meets | Built (s1a): `app/admin/test-club/characterCalls.ts` |
| D311 | **Wipe and reseed** (M4): `/admin` → Test club takes out every row belonging to the test club — its events and competitions with everything on them, its own tables, its list, its fictional accounts — **except the keep-list** (Ross and his friends, by username, and their own rows of the list); the club itself (name, address, crest, art, colour, home course) stays. It counts first, asks for the club's name, and shows the rows outside the club before and after. A club's **owners** are always kept too (Ross, 24 Nov 2026). Then it seeds: the memberships (Full, Senior, 6 Day, Junior), three labels (Ladies, Seniors, Single figures), each character's account, place on the list, handicap, gender and date of birth, a membership for any keep-list member without one, and the coming week's casual tee times booked by the characters. **Real friends join as anybody would** — a Green Dot account with their own email, added to the list in the Clubhouse and sent the club's code — and go on the keep-list | Wipe (s0); seed (s1a): `app/admin/test-club/seed.ts`; the season (s1b): eight competitions over the last eight weeks (`seasonPlan` — six Saturdays, a ladies' Tuesday, a seniors' Wednesday, Jed's 4 on 18 in the President's Prize) **played through the real rules with the clock set to each competition's day** — made, booked, scored, signed, co-signed and certified (`app/admin/test-club/play.ts`) — and Golfer of the Year on the club's defaults; the match play mid-bracket is s1c |
| D312 | **Week files** (M5): `data/test-club/weeks/<YYYY-MM-DD>.json`, written by Claude Code when Ross asks to play a week — who plays what, form, set-piece holes, statuses and comments in character — loaded from `/admin` through the real booking, scoring, sign, co-sign and certify paths; loading twice changes nothing (`test_week_loads`, 103). **The card model** (Claude Code's call, `lib/testClubCards.ts`): strokes over nett par about 1.5 plus an eighth of the course handicap, spread widening with it, moved by a form word (hot, good, steady, poor, awful, wild — Jed's always) or a number, shared out weighted to the hard holes, at most four over nett par on a hole; seeded by competition and player, so the same file makes the same cards; a set piece overrides its hole | The engine built with s1b (`playCompetition`); the week file loader s2 |
| D313 | **Statuses, comments and dots in character** (M6 amended — the feed shipped first, D293–D307): posted through the feed's own route as the characters (`card.status` by the card's player, `comment` and `dot` by anybody who may see it), comments dated that afternoon, nothing posted twice. **Innuendo is fine** (Ross, 24 Nov 2026, setting aside the initial safeguards); no slurs and nothing explicit, since it shows on the live site under Green Dot's name. Old Tom never has the last word on a card. Dots follow each character's comment rate | Built for the reseeded season: `data/test-club/season-banter.json`, `banterIssue`/`dotPlan` in `lib/testClub.ts`, `postBanter` in `app/admin/test-club/banter.ts`; week files (s2) carry the same `statuses` and `comments` |
| D314 | **Real friends are never auto-played, co-signed for or wiped** (M7): a week file naming anybody but a character is refused; a keep-list account is never deleted, even if marked fictional by mistake | Wipe: `rowsToWipe`, `runWipe` (s0); loader s2 |
| D315 | **A "Demo" pill** beside a fictional member's name inside the test club, and a **Fictional** filter on the Clubhouse Members grid (M8), offered only where the club has characters | Built (s1a, s1b): `app/components/DemoPill.tsx` on the Members grid, both casual tee sheets and a competition's tee sheet; boards, Cards to sign and the feed still to come |
| D316 | **A test club's events feed no platform-wide figure** (M9): the admin's Trips counts leave them out (listed, marked Test), Golf Ireland never reads one; any platform figure added later asks the same | Built (s0): `testTripIds`, `isTestTrip` (`app/admin/test-club/store.ts`), `countsOnPlatform` in `lib/testClub.ts` |
| D317 | **No AI calls from the site** (M10, as D250): week files are written by Claude Code in a chat, committed and deployed; the site only loads them | Stage s2 |
| D94 exception | "…except a club's members-only competition, where the club's list is the door and every player needs their own Green Dot account. A member who forgets their phone is scored on another and approves their card on their own account later." | Approved and amended by Ross, 16 Nov 2026 |

**The club area to the Pints hand-off** (Ross, 15 Nov 2026) — built with stage (f): the art an image at the top (members home 540px at .62 by day and .50 at night, other pages 380px at .20/.18, cropped 50% 38%, faded from 42%), the frosted header (crest in its ring, name, "Members", the 48px account button), Home's greeting, Live now, Club calendar (52×56 date tiles), Your season (three tiles and the self-claimed line), Outside the club ("These open in green dot."), and Competitions (Upcoming / My entries / Results, a featured card, results' top score in gold-deep). Waiting: "Your next round" with booking (d), and Live now's mini board (it links to the event's board for now).
