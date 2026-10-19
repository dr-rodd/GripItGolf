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
glasses are in the car. Running is checked in short glances. Nobody signs in;
a six-character event code is the way in.

## The screens

- **Front door:** landing (type an event code, or Create), Create (pick a
  sport), Golf doorway, Join, the create wizards, Privacy, Terms.
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
  text under 24px), rust `#B5533C` for loss only. No gold, ever. **No
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
