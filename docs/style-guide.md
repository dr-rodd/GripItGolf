# Style guide — Green Dot

The rules for how Green Dot looks, moves and talks. One line a rule, the reason
in a clause, and a pointer to [`design-history.md`](design-history.md) where
there is a story behind it. `app/globals.css` is the code; `npm run
test:branding` is the enforcement (§9 says which section holds what).

Where this file and any other disagree, this file wins. Where this file and the
code disagree, one of them is a bug: fix it, don't explain it.

---

## 1. Principles

- **A phone, outdoors, in one hand.** Daylight, glare, reading glasses in the
  car. Big type, high contrast, 48px targets, nothing that needs two hands.
- **Clean, snappy, textured.** A cream page with a faint grain; white cards
  lifted off it; motion quick off the face with a long settle. A refresh of
  the Donegal Masters fork, not its look (D2 in `refresh-plan.md`).
- **Scores in serif, everything else in sans.** Names and numbers on boards,
  cards and standings are Bespoke Serif, asked for by name. Every other word is
  Archivo. Titles are Schibsted Grotesk.
- **One emerald action per screen.** Emerald means the dot, live, and the one
  thing to press. A page with three emerald buttons has none. **Under par
  is green, a win gold, over par brown — never red** (`lib/resultTone.ts`) — except in match play, where
  the sides are red and blue (`lib/matchSides.ts`).
- **A number being read never moves.** A live score flashes its colour; it
  never slides, scales or counts while someone might be reading it.
- **Facts, not explanations.** A board says "Stableford · Running total", a
  hint says one thing in one line.

---

## 2. Tokens

### Colour

Eight properties (`--gd-*` on `:root`), re-pointed under `html.dark`. Every
`--color-*` token is a `var(--gd-*)` reference, never a literal — a literal
gets baked into every opacity utility at build time and no theme can reach it.

| Token | Light | Dark | Job |
|---|---|---|---|
| `cream` | `#F6F4F0` | `#1B1510` | The page. Warm, never grey or black |
| `surface` | `#FFFFFF` | `#272019` | Cards, the tab bar, anything raised |
| `ink` | `#2B2118` | `#F2EBE2` | Text: 100 primary, 80 secondary, 65 muted, 50 large-only |
| `bark` | `#4A3728` | `#D9C6B2` | Every neutral, at an opacity. No grey hex, no `gray-*` |
| `accent` | `#0A9D56` | `#22B573` | Emerald: the dot, live, the primary action, a chosen answer. **Never a result** |
| `accent-deep` | `#0A6B3C` | `#0E9151` | The primary button's fill; emerald text under 24px |
| `rust` | `#B5533C` | `#D9765B` | Loss, and only loss |
| `rust-deep` | `#8A3E2C` | `#E0937D` | Error text |
| `gold` | `#D4A02A` | `#E3B341` | Winning: a won pill, the champion's tile, a gained bar |
| `gold-deep` | `#755610` | `#E9C46A` | Gold text — the leader's place, the winner's total |
| `on-gold` | `#2B2118` | `#2B2118` | The ink on a gold fill, the same in both themes |
| `side-a` | `#C62F3A` | `#F07373` | Match play: the top of the draw, the card's left — red |
| `side-b` | `#2563B8` | `#6EA5F0` | Match play: the bottom of the draw, the card's right — blue |
| `on-side` | `#FFFFFF` | `#1B1510` | The ink on either side's fill |

- **Results are trips' green and gold (Ross, 25 Oct 2026, reverting the
  21 Oct gold "up")**, and `lib/resultTone.ts` is the one copy: **gold for
  winning only; emerald for better than level and a gain; the brown, bark,
  for worse (`bark-tint`) and solid bark for lost — never red, because
  over par is most golfers.** Emerald stays live too.
  A board's place 1 and its better-than-level scores, the podium and a
  stat's gain come through it.
- **A match is red and blue, never gold and brown (Ross, 25 Oct 2026).**
  The top of the draw is red, the bottom blue — or the two sides' team
  colours where they have different ones — and every phone shows the same,
  whoever holds it: a hole on the card's strip, a standing on the live
  board, a winner in the bracket all wear the side's colour.
  **On an event without sides, a player's own colour is worn the same way**
  (picked on the Settings tab from the team palette — `lib/playerColours.ts`;
  Ross, 26 Oct 2026), and it is also the dot beside their name on the
  leaderboard and the scorecard. **Two sides too alike to tell apart are
  shaded apart** — the darker a touch darker, the lighter a touch lighter,
  only until they clear `MIN_SIDE_DISTANCE` — so a strip of purple against
  purple still reads as two players. `lib/matchSides.ts` is the one copy.
  Score shapes on the card (a birdie's circle) are not results and have
  not moved.
- **Not the old gold.** `#C9A84C` in any spelling still fails the build:
  the previous identity's gold was decoration; this gold is a result.
- **No gradients. No glows** — one exception, §8.
- **Ink below 65% only on large text.** 65% clears AA (4.8:1 on cream); 50% is
  3.1:1 and is for 24px and up. Nothing prints at 40% or below.
- **Emerald text under 24px is `accent-deep`.** Bright `accent` on white is
  3.5:1.
- **Team colours are data**, stored per team, shown as dots. New defaults
  without emerald are proposed (`refresh-plan.md` 3.2) and wait on Ross.

- **Open (Ross, 19 Oct): the title type and its colour don't yet sit
  with the wordmark.** Titles are Schibsted in ink; the mark is its own
  lettering in bark. As a stopgap the hub's name (trip and run) is set in
  `text-bark`, the logo's colour, in both themes. The proper answer —
  title colour and possibly face, sitewide — is a design-session question,
  and re-checking the title font against the new logo is already D12.

### Named mixes

Use the name; never retype the opacity (`test:branding`, "Titles come from the
scale, hairlines from the mixes").

| Utility | Light | Dark | For |
|---|---|---|---|
| `line` | bark 10% | bark 10% | Card hairlines, dividers |
| `line-strong` | bark 18% | bark 20% | Field and chip borders |
| `tint` | bark 6% | bark 7% | Flat surfaces, segmented track, icon tiles, bands |
| `disabled-bg` | bark 10% | bark 12% | A disabled button's fill |
| `disabled-fg` | ink 45% | ink 45% | A disabled button's words (contrast-exempt) |
| `accent-tint` | accent 14% | accent 16% | Status pills, the chosen wash |

### Elevation

| Level | Look | For |
|---|---|---|
| Flat | `tint`, no border, no shadow | Empty states, a round with nothing scored, the segmented track |
| Raised | `surface`, 1px `line`, `shadow-raised` | Every card, list group, secondary button, unselected chip |
| Floating | `surface`, 1px `line`, `shadow-floating` | Sheets, a card being dragged; `shadow-floating-up` for the tab bar's edge |
| Primary | `accent-deep`, `shadow-cta` | The one emerald button |
| Chosen | `accent-tint`, 1px `accent-deep`, no shadow | The picked card or option of several |

- **The hairline stays on raised cards** — a shadow vanishes in sunlight; the
  line is what still separates card from page outdoors.
- **Pressed** drops to no shadow (the primary to `shadow-cta-pressed`) and
  scales to 0.97.
- Shadows are warm (bark, not black) by day and black with a lit inner edge at
  night. No shadow outside these four names (`test:branding`, "Shadows are the
  four named levels").

### Radius

Card 20 · button 16 · field 14 · tile 12 · sheet 24 (top corners) · chips,
pills and toggles fully round. Tokens: `rounded-card`, `-button`, `-field`,
`-tile`, `-sheet`.

### Spacing

- Page gutter 16. Section gap 28. Card padding 16. Label to field 8. Field to
  field 20.
- List rows at least 56 tall; rich rows 64–72.
- Touch targets 48. 44 is the floor for an icon button inside a dense row.
- **Dense screens keep their own 4–16px**: the leaderboard, scorecards, the
  bracket, score entry. Generous spacing is for entry screens.

### Paper and grain

- The page is **paper**: `cream` with `--gd-grain`, a tiled 160px SVG fractal
  noise. `body` carries it; full-page wrappers, sticky bars and sheets that
  would otherwise paint flat cream over it use the `paper` utility.
- **A hint of tooth, not an imitation of paper.** Specks peak near 10% alpha
  by day and 6% at night (`.22R − .08` and `.12R − .04`); it shipped at twice
  that and read as a texture laid over the app. `test:branding` holds the
  ceiling.
- Never on a card. Never `background-attachment: fixed` (an iPhone repaints on
  every scroll). Off in print.

### Motion tokens

`--gd-ease` = `cubic-bezier(0.16, 1, 0.3, 1)`, the **putt curve**: quick off
the face, a long settle, no overshoot. `ease-out` for fades and colour. No
springs, no bounce, no elastic. Every timing is in §6.

---

## 3. Type

### Families and jobs

| Family | Job | Loaded |
|---|---|---|
| **Schibsted Grotesk** 700 | Titles: screen, section, card | `next/font/google`, 700 only |
| **Archivo** (variable, `wdth` axis) | Every other word: body, labels, buttons, fields, tabs | `next/font/google`, `axes: ["wdth"]` |
| **Bespoke Serif** 400/500/700 | Names and numbers on boards, scorecards, standings, stats | Fontshare CDN, Georgia behind it |

- **The `next/font` variable classes go on `<html>`, never `<body>`.** A custom
  property resolves its `var()` where it is declared; on `<body>` the stacks on
  `:root` were invalid and the whole site rendered in the serif for months.
  [History](design-history.md#type).
- **Sans is the default; the serif is opt-in** — `font-serif` or `t-data`,
  never inherited.
- Bespoke Serif should be self-hosted (`refresh-plan.md` 3.1). Fontshare is
  blocked from the build container; it stays on their CDN until the woff2
  files are dropped into `app/fonts/`.

### The scale

| Class | Family | Size / line | Weight | Use |
|---|---|---|---|---|
| `t-h1` | Schibsted | 32 / 1.1, −0.02em | 700 | Screen title, a wizard step's question, the hub's name |
| `t-h2` | Schibsted | 23 / 1.2, −0.01em | 700 | Section heading |
| `t-card` | Schibsted | 18 / 1.25 | 700 | Card or row title |
| `t-body` | Archivo | 17 / 1.5 | 400 | Paragraphs, field text |
| `t-label` | Archivo | 15 / 1.3 | 600 | Field labels, list labels |
| `t-cap` | Archivo | 15 / 1.4 | 400 | Hints, secondary lines, facts |
| `t-eyebrow` | Archivo | 13 / 1.3, 0.04em, upper | 600 | **Only** table column headings |
| `t-data` | Bespoke Serif | 16 / 1.4, tabular | 400/700 | Board and scorecard names and numbers |
| `t-code` | Archivo | inherits, 0.12em, upper, tabular | 600 | An event or challenge code on display |
| Tab label | Archivo | 13, `font-stretch: 87.5%` | 400, lit 600 | The bottom bar only |

- **Titles come from the scale.** No `font-[family-name:var(--font-display)]`
  at a hand-picked size; the two left are numerals (the hub countdown, a
  forecast's temperature).
- **Nothing under 13px**, anywhere — including hand-written `text-[Npx]`.
- **No other uppercase, no other letter-spacing.** The exceptions are
  `t-eyebrow`, the code (`t-code`, `.field-code`) and the terms page's
  disclaimer, which the law prints in capitals.
- **Sentence case** for labels, buttons that read as a sentence, card titles
  and pills. Title Case only for names people chose and the platform's named
  screens: Trip Setup, Trip Settings, Event Hub, Green Dot Run. Short Title
  Case buttons ("Start Round") are X-04 in `copy-review.md`, open with Ross.
- A title can close with the green dot (`.t-title-dot`), a drawn circle in the
  mark's proportions, not the font's full stop.

---

## 4. Parts

All in `app/components/ui.tsx` unless named. Use the part; never restyle one
from outside with a second background, border, display or padding — two
utilities for the same property resolve in whatever order the stylesheet holds.
That is why parts take parameters (`dense`, `compact`, `shape`, `variant`).

| Part | Use it for | Variants | Don't |
|---|---|---|---|
| `Card` / `cardClass` | Any grouped content | `raised` (default), `flat`, `floating`, `chosen`; `pressable` on a real button or link | Nest a card in a card; lay `border-accent` on one (use `chosen`) |
| `Button` / `ButtonLink` / `buttonClass` | Actions | `primary` (one a screen), `secondary` (raised), `quiet` (text), `danger`; `full`, `dense` | Uppercase or track a label; hand-roll an emerald fill |
| `IconButton` / `iconButtonClass` | An icon alone | 48, `dense` 44 | Leave out `label` (it is the `aria-label`) |
| `BackButton` (`BackButton.tsx`) | The way back | 48 borderless arrow; with `label` for a named back; `dense` only in the three scoring headers | Lay it absolutely over a row |
| `Field`, `FIELD`, `FIELD_LABEL` | Every input | `field-dense` (44, in a row), `field-code` (codes, PINs) | Set a display, height or size on it; `.field` centres its own line with padding (iOS top-aligns date and time values otherwise) |
| `chipClass` / `ChoiceChips` | A short answer: a word or two | `compact` for narrow cells; `equal` widths | Use for switching views (that's `Segmented`) |
| `optionClass` | An answer that needs a line under it | `card`, `row` (name with figures), `tile` (a strip of days) | Add `flex`/`block`/padding on top |
| `Segmented` | Switching what a screen shows | — | Spend emerald on it: the chosen segment is raised, not green |
| `Toggle` (`Toggle.tsx`) | On/off | 52×32, `accent-deep` on, bark 20% off | Use for a choice of two named things |
| `Pill` / `LiveDot` | Status | `win`, `loss`, `neutral`; `live` adds the breathing dot | Uppercase it |
| `SectionHeader` | A section's heading | `hint` (one line), `action` | Repeat the heading in the hint |
| `ListGroup` / `ListRow` | Settings and lists of places to go | `href`/`onClick`, `chevron`, `value`, `hint` | Cards inside it |
| `EmptyState` | Nothing here yet | One sentence and one action | Illustrations |
| `WizardShell` (`WizardShell.tsx`) | Every create flow: trip, league, knockout, run, bracket | `titles`, `intro`, `footer` | Draw a step row or progress bar of its own |
| `CourseName` (`CourseName.tsx`) | A course: club on line 1, course on line 2 | — | Print a raw `--` |
| `TabBar` (`TabBar.tsx`) | The bottom bar | A trip's five; an event's Home · Scoring · Leaderboard (or Bracket) · Tee times or Stats while one is on · Settings (`eventFourthTab`); a run's five | Render from a page — the trip layout draws it once |

---

## 5. Patterns

- **Hub hero** (trip home, run home): left-aligned `t-h1` name, a dates line,
  "Led by" / "Organised by", then the status card — the standing big in the
  serif, one link to the board. One card, not a stack of banners.
- **Settings screens** (Trip Setup, organiser areas): `SectionHeader` + a
  `ListGroup` of rows; the most-used thing first. A section is never smaller
  than what is in it.
- **Wizards**: `WizardShell`. One question per step as the `t-h1`, at most one
  line under it, the step's fields, a sticky Continue bar (sticky, not fixed,
  so it rides above the iOS keyboard). Back slides back; nothing is lost.
- **Leaderboards**: the layout is frozen (D2). `Segmented` to switch boards,
  the board's facts line under its title (`boardFacts` in `lib/leaderboards.ts`,
  `ruleFacts` for runs), serif names and numbers, `t-eyebrow` column heads,
  team members stacked one per line (D13), round tiles in three states
  (`lib/roundState.ts`).
- **Choosing one of several**: chips for a word, options for a line, chosen
  wears `accent-tint` with an `accent-deep` edge whatever its shape.
- **Empty**: `EmptyState`, flat — one sentence, one action.
- **Loading**: a `loading.tsx` per trip route that promises no shape it might
  not draw. [History](design-history.md#arriving).
- **Errors**: calm, in `rust-deep`, right under the thing that failed — "Could
  not save — try again". A refused tee-sheet write says so in its slot.

---

## 6. Motion

The 400ms ceiling holds for anything answering a touch. A repeat that answers
nothing (a breath, a pulse) sits between 900ms and 2s. Everything has a Reduce
Motion version: a blanket rule cuts every animation and transition to 0.01ms,
and the named rules below say what replaces each.

| Motion | Trigger | Duration | Curve | Reduce Motion |
|---|---|---|---|---|
| Press (`.press`) | Touching a card or button | 120ms | ease-out | No scale; the shadow still drops |
| Tab press | Touching a tab | 150ms | ease-out | No scale; still lights |
| Tab pending | A tab waiting for its page | 900ms repeat | ease-in-out | Still |
| Toggle knob | On / off | 160ms | putt | Instant |
| Segment, chip colour | A choice changes | 150ms | ease-out | Instant |
| Page arrive (`page-enter`) | A screen arrives | 200ms fade | ease-out | Instant |
| Wizard step | Continue / Back | 340ms slide (in from 100%, out to −30%) | putt | 150ms crossfade |
| Progress fill | A step completes | 340ms colour | putt | Instant |
| Sheet up (`sheet-up`) | A sheet opens | 280ms | ease-out | Instant |
| Scoring card slide | Next / previous player | 260ms | ease-out | Instant |
| Bracket swipe | Sideways swipe, arrows, dots | Follows the finger; settles in up to 340ms, one round a swipe, the point under the finger held still inside the bracket's box — the page never scrolled while it moves, only once at rest | ease-out | Settles instantly; the drag still follows the finger |
| Score flash | A live score changed | 400ms colour only | ease-out | Instant |
| Live dot (`dot-live`) | A card is open | 2s repeat | ease-in-out | Still |
| Skeleton | Loading | 1.4s repeat | ease-in-out | Still |
| Long name glide | A board name wider than its column | 11s, shared phase | ease-in-out | Drag strip instead |
| Landing collapse | Create / Join tapped | 340ms shake + 700ms travel | smoothed | Straight there |
| Site intro | First hub visit | 420–500ms slides; 1.5s birth | putt / slow-in-out | Appears in place |
| Count-up (`CountUp`) | Your run total after logging a run; your round total, first view after signing | 400ms | putt | The final number |
| Dot bloom (`DotBloom`) | A card signed; a run logged — once per action | 600ms | putt | The settled tinted disc and tick |

---

## 7. Copy

From `refresh-plan.md` 3.6. Item-by-item decisions live in
[`copy-review.md`](copy-review.md), which is also where wording is proposed.

1. **One line of help.** A hint is one sentence of 12 words or fewer.
2. **No em-dashes in interface text** — use a full stop or " · ". *Proposed
   (X-06), awaiting Ross*; applied so far only to lines rewritten for another
   rule. The error template "Could not X — try again" stands until he answers.
3. **No jokes in system copy.** Players can be funny in their own names.
4. **Labels are nouns, buttons are verbs**, sentence case (§3).
5. **Facts, not explanations.** "Stableford · Running total · 90% handicap".
6. **Say it once.** A hint never repeats its heading.
7. **Numerals.** Dates as "14–16 Aug 2026", times as "08:10".
8. **British spelling.** *Proposed (X-08).*
9. **Plain, warm, direct, second person, no exclamation marks.** *Proposed
   (X-09).*

Naming is settled (CLAUDE.md, "What things are called on screen"): a trip's
**lead player**, an event's **event organiser**, a challenge's **organiser**;
**Trip Setup** the screen, **Trip Settings** the drawer; a **leaderboard**;
calm errors.

---

## 8. Exceptions register

Each is pinned by name in `test:branding`, so it cannot become a precedent.

| Exception | To | Why | Where |
|---|---|---|---|
| The live round's glow | No glows | A round in play is the thing to spot on a phone face-up on a table | `lib/roundState.ts`, `live` only |
| Landing collapse (~1s) | 400ms ceiling | A page transition with a shake in front, not a control answering a touch | `app/Landing.tsx` |
| Site intro | 400ms ceiling, putt curve borrowed early | A guided tour; its timings live in its component | `app/components/SiteIntro.tsx` |
| Long name glide (11s) | Repeat ceiling | A journey at reading pace, only on a name that does not fit | `TripLeaderboardClient.tsx` |
| Scroll shades | No gradients | The edge of a scroller says there is more | `.scroll-shade-l` / `-r` in `globals.css` |
| Grain | No gradients, no texture on surfaces | A texture, not a gradient; the page only, capped faint | `--gd-grain` |
| Tee swatches | No grey; palette only | A blue tee is blue — data, not brand | `scorecardStyle.ts` |
| Terms disclaimer in capitals | No uppercase | The legal form | `app/terms/page.tsx` |
| The dot bloom (600ms) | 400ms ceiling | The one celebration, once per card signed or run logged; never in score entry or on a board | `app/components/DotBloom.tsx`, its own `<style>` |
| The style lab | Three fonts; the token values | Ross tries other faces and looks on his own phone. Behind `html[data-…]` attributes no player's phone carries, so the house rules hold for everyone else | `app/style-lab.css` (generated), `lib/styleLab.ts` |

---

## Style lab

`/admin/style` tries other fonts and looks on **one phone**. Six axes — title,
text and score font, depth, corners, paper grain — each house first. Colour is
not an axis: every combination would need its own contrast check in both
themes.

**How it is fenced in.**

- **No attribute means house, byte for byte.** Choosing a house option
  removes its `data-*` attribute rather than setting it.
- The setup lives in the `gg_style` cookie and is applied by the head script
  (`STYLE_BOOT_SCRIPT`, beside the theme's) before first paint. **Never read
  on the server** — `cookies()` in a layout makes every route dynamic.
- Every lab rule is in `app/style-lab.css`, generated from `lib/styleLab.ts`,
  imported after `globals.css`, and is either a `@font-face` or starts
  `html[data-` / `html.dark[data-`. Nothing lab-related is in `globals.css`
  or the layout's `next/font` imports, so "Three fonts" still holds.
- Lab fonts are plain `@font-face` from `public/fonts/lab/<id>/`, never
  `next/font`: a phone downloads one only when it draws text in it. A
  player's phone downloads none.
- The "Lab · N" pill sits in `TripHeader`'s own right-hand slot, so the
  header never changes height.
- Text that is measured re-measures when a font changes
  (`watchFontChanges`): the leaderboard's gliding name, its scroll shade, and
  the hub description's "more".

`test:branding` ("The style lab is fenced in") holds the fence;
`test:style-lab` reads every font file with fontkit — woff2, licence beside
it, the Irish accents and ’ – ·, tabular figures for a score face, the
weights its role needs — and checks the generated CSS is current.

**Adding a font.** For a Google Font, `npm pack @fontsource-variable/<name>`
and copy the Latin `wght` woff2 and its `LICENSE` into
`public/fonts/lab/<id>/` (never a dependency). Add a `LAB_FAMILIES` entry and
an option on the right axis in `lib/styleLab.ts`, then `npm run fonts:lab`
and `npm test`. To remove one, delete its folder and entries and regenerate.

**Promoting a setup** ("make this the house style: `title=… text=…`") is a
real change, never a switch: move the face to `next/font`, update the house
tokens and the "Three fonts" checks, run the fit checks ("Leaderboard" in the
tab bar at 320px, the leaderboard name column, wizard titles at 320px), and
update this guide.

**Known gaps** — parts the depth and corners choices do not reach, because
they are hand-built rather than on the tokens: anything with a literal radius
(`rounded-lg`, `rounded-md`, the skeleton's 6px, the bracket's tiles) and any
shadow outside the four named levels. `rounded-xl`, `rounded-2xl` and the
named radii follow, and `.field` is pointed at `--radius-field` by the lab.

---

## 9. How it's enforced

`npm run test:branding` (`scripts/test-branding.tsx`) — the sections that hold
this file:

| Rule | Section |
|---|---|
| Palette, no gold, no grey | "The palette is defined once", "The old identity is gone" |
| One emerald action | "Emerald is an accent, not a wash", "One primary action per screen" |
| Fonts load and resolve | "Three fonts, one job each", "The fonts resolve, not just appear in the stylesheet" |
| Serif by name | "Names and numbers on a board ask for the serif by name" |
| Mixes, elevation, radius, grain | "Depth, texture and the named mixes are tokens", "Shadows are the four named levels", "No glows" |
| Contrast | "Text is dark enough to read", "A label on a coloured fill is dark enough too", "Dark mode is the same tokens with night values" |
| Type scale, no hand-set titles or retyped hairlines | "Type is big enough to read", "Titles come from the scale, hairlines from the mixes" |
| No spaced capitals | "No spaced capitals" |
| Parts | "The parts kit", "Status pills follow the spec", "Empty states say what to do next" |
| Wizards | "The way back is a 48px arrow", "Every wizard is one frame", "A step slides" |
| Motion | "Motion is calm, and can be switched off" |
| Tab bar | "The bottom tab bar", "The tab bar is on every screen inside a trip" |
| Style lab | "The style lab is fenced in" (and `test:style-lab` for the fonts) |

Other suites hold their own corners: `test:scorecard` the scoring symbols and
bands, `test:leaderboard` the board's layout, `test:golden` every character the
board renders, `test:hub` the hub. Check the result, not just the stylesheet:
a rule that only reads the CSS is how the font bug lived for months.
