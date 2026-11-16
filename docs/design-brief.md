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

## Hand-off spec (end every session with this, one block per change)

```
Screen / component:
What changes (plain words):
Before → after (mockup or screenshot reference):
Colours: existing token names only (cream, surface, ink, bark, accent,
  accent-deep, rust) — or a proposed new token with light AND dark values
Type: scale names (t-h1, t-h2, t-card, t-body, t-data, t-label, t-cap)
Spacing / radius / shadow: exact values
Motion: trigger → what moves → duration (ms) → easing (named or cubic-bezier)
Reduce Motion version:
Dark mode notes:
States covered: loading / empty / error / long names / 1 vs 40 rows
Rules this changes (so Claude Code updates the tests):
How I'll check it on my phone:
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
| D145 | One club per account, for now | Agreed; enforced by D150 |
| D146 | Making a trip or event moves off the front page, onto the personal page and the club area | Built (g): Create gone from the front page; Make an event on `/home` |
| D147 | Front page by tier: signed out, the code box first, then a Green Dot members card (Sign in, Join, one line on what it gives), no Create; a quiet "Organise an event" goes to Join. Signed in, greendot.live opens the member's home, which carries the code box | Built (g): signed out the code box, the members card, Organise an event; signed in the head script goes on to `/home` |
| D148 | One home address, `/home` (club area or personal page); `/club/[slug]` the club's public page; `/home` signed out goes to sign in; old account addresses redirect | Built (g): `/home` the personal page; a Club member sent on to `/club/[slug]` until (h) |
| D149 | Personal tab bar Home · Events · Board · Stats · Me; Board opens the live event's board, else the latest, never empty. Club tab bar stays D127 | Built (g) |
| D150 | D145 enforced on the server only: a second club refused, naming the first; the tables can hold more | Proposed; plan (e1) |
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
| D193 | The club home is kept on the phone (the last /api/club answer, by account and club, versioned) and drawn at once from it, then refreshed in place without moving what is on screen; cleared on sign-out, delete and "not on this club's list" | Agreed; building |
| D194 | Never from the copy: Live now, Cards to sign, Your next round — they fade in (160ms, none under Reduce Motion) when the fresh answer lands. No copy yet: the club header, the tab bar and placeholder cards, never the public face | Agreed; building |
| D195 | Fewer steps on the server: /api/club home in three waves at most after the token check; /api/account home answers first and tidies after; the club home asked for by the head script on its way | Agreed; building |
| D197 | A phone that belongs to the club never sees the public face on the way in — the hand-off spec of 16 Nov (placeholders: greeting 32 high, two cards radius 20 at 96 high, three date rows 56 high; the existing skeleton's breath) — held by a test | Agreed; building |
| D198 | *Ross, 16 Nov 2026:* preload and then be snappy rather than lag each time. Inside a competition, Tee sheet · Scoring · Leaderboard switch at once with the animation; their data loads or refreshes behind | Agreed; building |
| D94 exception | "…except a club's members-only competition, where the club's list is the door and every player needs their own Green Dot account. A member who forgets their phone is scored on another and approves their card on their own account later." | Approved and amended by Ross, 16 Nov 2026 |

**The club area to the Pints hand-off** (Ross, 15 Nov 2026) — built with stage (f): the art an image at the top (members home 540px at .62 by day and .50 at night, other pages 380px at .20/.18, cropped 50% 38%, faded from 42%), the frosted header (crest in its ring, name, "Members", the 48px account button), Home's greeting, Live now, Club calendar (52×56 date tiles), Your season (three tiles and the self-claimed line), Outside the club ("These open in green dot."), and Competitions (Upcoming / My entries / Results, a featured card, results' top score in gold-deep). Waiting: "Your next round" with booking (d), and Live now's mini board (it links to the event's board for now).
