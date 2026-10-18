# Green Dot refresh: instructions for Claude Code

Version 3 · 18 October 2026 (title font: Schibsted Grotesk) · written in a Claude.ai design session with Ross

**To Claude Code:** save this file as `docs/refresh-plan.md` and follow it one phase at a time. After each phase, deploy, stop, and tell Ross what to check on his phone (each phase lists it). Don't start the next phase until he says go. Where this plan changes a rule that `test:branding` enforces, change the test on purpose in the same commit, and name the rule in the commit message. Mockups: the "Green Dot refresh mockups" canvas Ross has (390px phone frames, light and dark, with a working wizard).

---

## 1. The brief in five lines

- **Feel:** clean, snappy, textured. Slight depth, cards you can feel under your thumb, forms that slide forward like Runna.
- **Size of change:** a refresh. The palette, the wordmark and its dot, the cream page, the score entry layout and the leaderboard layout all stay.
- **What's wrong today:** text is hard to read, small, wordy, and reads like AI. Screens look plain, static and inconsistent. Title sizes are wrong on Trip setup. The form back button is broken.
- **What Ross likes:** the colours, the drawn page-title lettering (`leaderboard.`, `settings.`), and the serif names and numbers on the leaderboard.
- **Off limits:** emerald dot and wordmark, cream background, score entry screen layout, leaderboard layout (except team names; see 4.6).

## 2. What's actually wrong, found in the code

Read these first. Most of what Ross dislikes comes from 2.1 to 2.3.

### 2.1 Two of the three fonts have never shown on the live site

`app/layout.tsx` puts `${archivo.variable}` on `<body>`. In `globals.css`, `--font-ui` and `--font-display` are declared on `:root` and both refer to `var(--font-archivo)`. A custom property works out its `var()` on the element where it is declared. At `:root`, `--font-archivo` doesn't exist yet, so both properties come out invalid there and are inherited that way. So every `font-family: var(--font-ui)` and `var(--font-display)` falls back to the inherited body font, Bespoke Serif.

Checked on greendot.live with a headless browser: `.t-cap`, `.t-label`, `h1` and buttons all compute to `"Bespoke Serif", Georgia…`, and `--font-ui` is empty on both `html` and `body`. Every title, label, button, field and tab label has been in the serif. Clash Display and Archivo have never rendered. `test:branding` checks that the stylesheet *mentions* the fonts, never that they *resolve*. That gap is why this went unnoticed.

### 2.2 Spaced-out capitals everywhere

There are 317 `uppercase` and about 330 letter-spacing utilities across ten different values (`tracking-[0.1em]` up to `tracking-[0.25em]`, plus `wider` and `widest`). Combined with 2.1, every label became widely spaced serif capitals: "CHALLENGE NAME", "STEP 1 OF 4 — CHALLENGE", "CONTINUE", "NOT YOU?". That texture is most of the "AI quality".

### 2.3 Hand-rolled styles, so screens drift

- 211 hand-written `border border-bark/12` cards, against 5 uses of `<Card>`.
- 78 hand-written emerald buttons, against 29 uses of the shared `Button`.
- `LABEL` and `INPUT` constants are copy-pasted into four wizards: `CreateTripForm`, `CreateLeagueForm`, `CreateKnockoutForm` and `CreateRunForm`.
- The wizard header (progress bar, back button, step label) is copy-pasted into the same four files.

Changing the look in one place is impossible until these go through shared parts.

### 2.4 The back button bug

`BackButton` is a 44×44 bordered box (`h-11 w-11`). In `CreateRunForm.tsx` (and the same pattern in the other wizards) it sits absolutely positioned in a header row that is only about 34px tall (`py-2` plus 13px text). It hangs out of the row by about 5px at the top, into the progress bar, and at the bottom, across the row's border. It is also under the 48px touch target.

### 2.5 Trip setup hierarchy is upside down

In `TripSetupClient.tsx`, the "Leaderboards" section heading is a 15px emerald uppercase label (`t-label … uppercase tracking-[0.18em]`). Each board inside it is `t-h2`, 23px (`LeaderboardSetup.tsx` around line 1478). The child is bigger than its parent. The board cards are nested inside a section card, and the gear and × buttons are 36×36 (`w-9 h-9`), which squeezes the description into a narrow column.

### 2.6 Where the wordiness comes from

- `boardRules()` in `lib/leaderboards.ts` writes every board as a paragraph of sentences.
- `SCORINGS` carries a joke as a system hint: "Stableford points. Man's greatest achievement."
- The hub carries "Tap a course card for current weather and course details."
- Wizard intros run two or three sentences, with em-dashes.

### 2.7 Small text that slipped through

- Tab labels are `fontSize: 11` in `TabBar.tsx`, and the test explicitly allows 11.
- `app/scoring/LiveScoringFlow.tsx` has `text-[10px]` "pts" and "putts" units (lines ~1678, 2269, 2343, 2487).
- `uiFiles()` in the test doesn't walk `app/scoring`, so the 13px floor never checked it.

### 2.8 Smaller things

- `CLAUDE.md` and `design-system.md` call `STYLE_GUIDE.md` the source of truth. That file doesn't exist.
- Course names are stored as "Carne Golf Links -- Wild Atlantic Dunes", and the raw `--` prints on screen and truncates.
- The default team colours in `lib/teamColors.ts` are saturated Tailwind reds and blues, and include the brand emerald `#0A9D56`. A team coloured emerald collides with what emerald means: live, win, the one action.

---

## 3. The new rules (tokens)

### 3.1 Type: three families, three jobs

| Job | Family | Loaded how |
|---|---|---|
| Titles: page, section and card titles | **Schibsted Grotesk** 700 (replaces Clash Display) | `next/font/google`, self-hosted |
| Every other word: body, labels, buttons, fields, tabs | **Archivo**, variable, with the width axis | `next/font/google`, `axes: ['wdth']` |
| Names and numbers on boards, scorecards and standings | **Bespoke Serif** 400/700 | `next/font/local`, woff2 in `app/fonts/` with its licence file |

- **Fontshare is no longer loaded at all.** Remove the `<link>` and both preconnects. Bespoke Serif is free under Fontshare's licence, which allows self-hosting. If Claude Code can't download the woff2 files, ask Ross to download Bespoke Serif from fontshare.com and drop the 400 and 700 woff2 files in `app/fonts/`.
- Schibsted Grotesk is on Google Fonts (checked) as a variable font, weights 400 to 900. Titles use 700 everywhere: 800 and up turns shouty, 600 goes soft in sunlight. Ross chose it for a mature, classy, editorial feel over Bricolage Grotesque and Instrument Sans. If `next/font/google` in this Next version doesn't list it, self-host its woff2 through `next/font/local` instead. Either way, no CDN at runtime.
- **All three `.variable` classes go on `<html>`, never `<body>`.** This is the fix for 2.1, and it gets a test (section 7).
- `body { font-family: var(--font-ui) }`. **Sans is the default now. The serif is opt-in.**

| Class | Family | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `t-h1` | Schibsted Grotesk | 32 / 1.1 | 700 | -0.02em | Screen title, step question, hub name |
| `t-h2` | Schibsted Grotesk | 23 / 1.2 | 700 | -0.01em | Section heading |
| `t-card` | Schibsted Grotesk | 18 / 1.25 | 700 | 0 | Card or row title |
| `t-body` | Archivo | 17 / 1.5 | 400 | 0 | Paragraphs, field text |
| `t-label` | Archivo | 15 / 1.3 | 600 | 0 | Field labels, list labels, button text uses 16 to 17 |
| `t-cap` | Archivo | 15 / 1.4 | 400 | 0 | Hints, secondary lines, metadata |
| `t-eyebrow` (new) | Archivo | 13 / 1.3 | 600 | 0.04em, uppercase | **Only** table column headings (NAME · 1 · 2 · TOT) |
| `t-data` | Bespoke Serif | 16 / 1.4 | 400 or 700 | 0, tabular | Board and scorecard names and numbers |
| Tab label | Archivo | 13 | 600, active 700 | `font-stretch: 87.5%` | Bottom bar only |

- **No other uppercase and no other letter-spacing.** The one exception is the event or challenge code field and the code display: Archivo 600, `tracking-[0.12em]`, uppercase.
- Labels are sentence case: "Challenge name", not "CHALLENGE NAME".
- Archivo at 87.5% width fits "Leaderboard" in 69px at 13px (it's 77px at normal width), so it clears a 64px column on a 320px phone with room to spare. Measured.

### 3.2 Colour: same palette, a few named mixes

The eight `--gd-*` tokens and their dark values don't change. Add these as named utilities or tokens, so nobody retypes the opacities:

| Name | Light | Dark | Use |
|---|---|---|---|
| `line` | bark 10% | bark 10% | Card hairlines, dividers |
| `line-strong` | bark 18% | bark 20% | Field borders, chip borders |
| `tint` | bark 6% | bark 7% | Flat surfaces, segmented track, icon tiles |
| `disabled-bg` | bark 10% | bark 12% | Disabled button fill |
| `disabled-fg` | ink 45% | ink 45% | Disabled button text (contrast-exempt, `disabled:` only) |
| `accent-tint` | accent 14% | accent 16% | Status pills, selected wash |

- **Active tab and emerald text links use `accent-deep` in light mode** (6.6:1). Emerald `accent` on white is 3.5:1, which is too low for text under 24px.
- **Disabled primary buttons stop being washed-out green** (today: `disabled:opacity-40` on emerald). They become `disabled-bg` with `disabled-fg`. A pale green button reads as broken, not as "not yet".
- Optional, Phase 4: new default team colours, muted to sit on cream, told apart by lightness as well as hue, with no emerald and no gold: brick `#C8453A`, cobalt `#3D6FB6`, plum `#8A5BA8`, ochre-free orange `#D9731E`, slate `#4F6B7A`, rose `#C24D7C`, olive `#6B7A2E`, navy `#22375E`. Existing teams keep their stored colours. Ask Ross before doing this one.

### 3.3 Depth and texture: paper and card

The cream page is paper, with a faint grain. Cards are smooth white, lifted slightly off it. That contrast is the "textured, slight 3D" feel.

| Level | Light | Dark | Used for |
|---|---|---|---|
| **Flat** | `tint` fill, no border, no shadow | same | Empty states, the segmented control track, a round with nothing scored |
| **Raised** (`shadow-raised`) | white, 1px `line` border, `0 1px 2px rgba(74,55,40,.06), 0 8px 20px -10px rgba(74,55,40,.20)` | surface, 1px `line` border, `inset 0 1px 0 rgba(242,235,226,.05), 0 10px 24px -12px rgba(0,0,0,.70)` | Every card, list group, secondary button, unselected chip, selected segment |
| **Floating** (`shadow-floating`) | `0 2px 6px rgba(74,55,40,.08), 0 20px 40px -16px rgba(74,55,40,.30)` | `inset 0 1px 0 rgba(242,235,226,.06), 0 24px 48px -16px rgba(0,0,0,.80)` | Sheets, a card being dragged, the tab bar's upward edge (`0 -10px 24px -16px`) |
| **Primary button** (`shadow-cta`) | `0 1px 2px rgba(10,107,60,.20), 0 10px 20px -10px rgba(10,107,60,.60)` | `inset 0 1px 0 rgba(255,255,255,.12), 0 10px 20px -10px rgba(0,0,0,.70)` | The one emerald button |

- **Keep the hairline border on raised cards.** Shadows almost vanish in direct sunlight, and the border is what still separates card from page outdoors.
- **Pressed:** a raised card or button drops to no shadow (the primary to `0 1px 2px`) and scales to 0.97. That is the "it went down under my thumb" feeling.
- **Grain:** a tiled SVG noise (`feTurbulence`, fractal noise, about 160px tile) as a data URI on `body` only. Bark-coloured at about 5% in light, tan at about 7% in dark. Never on cards. Never `background-attachment: fixed`, which is slow on iPhones. Off in print. It's a texture, not a gradient, so the gradient ban stays as it is.
- **Radius:** cards 20px · buttons 16px · fields 14px · small tiles and icon tiles 12px · chips, pills and toggles fully round · sheets 24px top corners.
- **Still banned:** gradients, glows, and any shadow that isn't one of the four named levels. The live round tile keeps its one glow. The scroll shades and the intro stay as documented exceptions.

### 3.4 Spacing

- Page gutter 16px. Section gap 28px. Card padding 16px. Label to field 8px. Field to field 20px.
- List rows at least 56px tall, rich rows 64 to 72px. Touch targets 48px; 44px is the floor for icon buttons inside a row.
- Dense screens (leaderboard, scorecards, bracket) keep their own 4 to 16px spacing, unchanged.

### 3.5 Motion

| Token | Value |
|---|---|
| `--gd-ease` | `cubic-bezier(0.16, 1, 0.3, 1)`, the putt curve. **Promoted from the intro to the whole app.** It is quick off the face with a long settle: snappy, no overshoot. |
| Fades and colour changes | `ease-out`, as today |
| Press | 120ms |
| Small changes (toggle, chip, segment) | 160ms |
| Wizard step slide | 340ms |
| Sheet in / out | 320ms / 240ms |
| Page fade | 200ms (unchanged) |

- The 400ms ceiling for anything answering a touch stays.
- No springs, no bounce.
- A number being read on a live board still never moves.
- Every motion has a Reduce Motion version (section 4.3 says what each one becomes).

### 3.6 Copy rules

These go into the style book. Rules 2, 8 and 9 are proposed answers to X-06, X-08 and X-09 in `docs/copy-review.md`. Ross confirms them there.

1. **One line of help, at most.** A hint is one sentence of 12 words or fewer. A screen that needs a paragraph is a design problem, not a copy problem.
2. **No em-dashes in interface text.** Use a full stop, or a middle dot between facts.
3. **No jokes in system copy.** "Man's greatest achievement" and "rather than an ultramarathon" go. Players can be funny in their own trip names and descriptions.
4. **Labels are nouns, buttons are verbs.** Both sentence case: "Challenge name", "Create challenge". Title Case only for things people named themselves (X-04).
5. **Facts, not explanations.** "Stableford · Running total · Worst round dropped · 90% handicap", not a paragraph.
6. **Say it once.** Don't repeat the heading in the hint under it.
7. Numerals for numbers. Dates as "14–16 Aug 2026". Times as "08:10".
8. British spelling.
9. Register: plain, warm, direct, second person, no exclamation marks.

---

## 4. The phases

Each phase is one deploy. Run `npm test` before each.

### Phase 1: Fix what's broken (small, ship first)

1. **Fonts resolve, and the title font becomes Schibsted Grotesk, in one deploy.** Doing both together means Clash Display never appears on the live site.
   - In `app/layout.tsx`, move `${archivo.variable}` from `<body>` to `<html>`.
   - Add `Schibsted_Grotesk` from `next/font/google` (`subsets: ['latin']`, `variable: '--font-schibsted'`, `display: 'swap'`), and put its `.variable` on `<html>` as well.
   - In `globals.css`, point `--font-display` at `var(--font-schibsted), ui-sans-serif, system-ui, sans-serif`. Set `t-h1`, `t-h2` and `t-card` to weight 700 and the sizes and letter-spacing in 3.1.
   - Remove `clash-display` from the Fontshare URL. Bespoke Serif stays on Fontshare until Phase 2.
   - Add the regression test in section 7.1, and update the "Three fonts" check in 7.2 for Schibsted Grotesk.
   - Don't flip `body` to sans yet; that is Phase 2. Archivo will appear for the first time in labels, buttons and fields, and that is expected.
2. **Back button.** `BackButton` becomes a borderless 48×48 control: chevron 24px, `ink/80`, no box, no shadow. In each wizard header, the step row becomes `grid-cols-[48px_1fr_48px] min-h-12 items-center`, with the button in the flow instead of absolutely positioned. Apply this in `CreateRunForm`, `CreateTripForm`, `CreateLeagueForm` and `CreateKnockoutForm`, and wherever else `BackButton` sits in a header row (it has 42 call sites; check each against its row height).
3. **Tab labels** go to 13px Archivo at `font-stretch: 87.5%`, with `axes: ['wdth']` on the Archivo import. Remove the weight list so the variable font loads whole. Raise the test floor from 11 to 13.

**Ross checks:** open greendot.live on his phone. Titles are now Schibsted Grotesk, and labels, buttons and fields are Archivo. Create → Running → fill step 1 → Continue: the back arrow sits cleanly in its row and doesn't touch the progress bar. Tab labels are bigger.

### Phase 2: Foundations

1. Self-host Bespoke Serif and drop Fontshare entirely (3.1).
2. **Before** flipping `body` to sans, make the serif explicit wherever the serif is the point:
   - leaderboard names and numbers (`TripLeaderboardClient.tsx`)
   - `LiveLeaderboardPanel.tsx`
   - `ScoreShape.tsx` numerals
   - the three scorecards (`scorecardStyle.ts`)
   - the run leaderboard
   - the hub standing number
   - stats figures

   Then flip `body` to `var(--font-ui)`. Screenshot the leaderboard before and after. The names and numbers must be identical.
3. Rebuild the type scale classes (3.1). Add `t-eyebrow`.
4. Add the colour mixes (3.2), elevation utilities (3.3), radius scale, grain and `--gd-ease` to `globals.css`.
5. Update `test:branding` for every rule changed (section 7).

**Ross checks:** body text, hints and paragraphs are now Archivo instead of the serif. The leaderboard and scorecard names and numbers look exactly as before. The page has a faint grain if he looks closely.

### Phase 3: Shared parts, then move everything onto them

Build or rebuild these in `app/components/ui.tsx`, or a file each where they're large. The "Parts kit" artboards on the canvas show every one, in light and dark.

| Part | Spec |
|---|---|
| `Card` | `variant: 'raised' \| 'flat' \| 'floating'`. Radius 20. `pressable` adds the press (shadow off, scale 0.97, 120ms), on a real `<button>` or `<a>` |
| `Button` | primary: `accent-deep`, white 17px/600, height 56 full-width or 48 inline, radius 16, `shadow-cta`. secondary: raised surface. quiet: text only, `accent-deep`. danger: unchanged. disabled: `disabled-bg`/`disabled-fg`, no shadow. **No uppercase, no tracking** |
| `Field` | label (`t-label`, `ink/80`) · input 56px tall, 17px, radius 14, 1.5px `line-strong` · hint (`t-cap`, `ink/65`) · error (2.5px `rust` border, message in `rust-deep`, 15px, right under the field). Focus: 2.5px `accent` border, no glow |
| `Chip` | 44px tall, fully round. Selected: `accent-deep` fill, white text. Unselected: raised surface |
| `Segmented` | `tint` track with 4px padding, radius 16. Selected segment: raised surface with `ink` text. Others: `ink/65`. Replaces the emerald pill pairs used as board switchers, because those spent the screen's one emerald |
| `Toggle` | 52×32. On: `accent-deep`. Off: bark 20% |
| `Pill` (was `Badge`) | 13px/600, **sentence case, no tracking**. Win: `accent-tint` with `accent-deep` text. Loss: rust 14% with `rust-deep`. Neutral: bark 9% with `ink/80`. `live` adds the breathing dot |
| `SectionHeader` | `t-h2` with an optional `t-cap` hint and an optional right-hand action (secondary button, 44px) |
| `ListGroup` / `ListRow` | One raised card holding rows separated by `line` dividers. Row: label 17/500, value `t-cap`, chevron. **No cards inside cards** |
| `IconButton` | 48×48 (44 inside dense rows), icon 20 to 24, `ink/50`, with an `aria-label` |
| `WizardShell` | See 4.3 |

Then migrate:

- Every hand-rolled card goes onto `Card`. Every hand-rolled emerald button goes onto `Button`.
- The four `LABEL`/`INPUT` copies go onto `Field`.
- `Eyebrow` and all `uppercase tracking-*` usages are removed, except table column headings (`t-eyebrow`) and the code field.

Do this screen by screen, and commit per screen.

**Ross checks:** screens look like one app: the same cards, the same buttons, the same labels. Pressing any card or button visibly sinks it.

### Phase 4: Screens

#### 4.1 Trip home and run home: one hero

Left-aligned on every hub (golf trip, event, run challenge):

- `t-h1` name with the green full stop
- dates in 17/600 `ink/80`
- the lead player's line in 17/400 `ink/80`
- an action row (secondary Share, quiet QR code)

Drop the "GREEN DOT RUN" eyebrow. Status card as a `ListGroup`:

- name row with "Not you?" as a quiet 15px link
- state row with icon tile, "Trip complete" and "All rounds in. Standings are final."
- standing row with "2nd" in Bespoke Serif 700 30px, "of 6", and a "Leaderboard →" link

Itinerary: section header "Itinerary" with "10 of 10 done". Day labels sentence case ("Friday 14 Aug"). Delete "Tap a course card for current weather and course details."

The run code card shows the code in Archivo 600 at 40px, tracking 0.12em, in `ink`, not emerald.

#### 4.2 Trip setup

- "Trip settings" row as a raised card: icon tile, `t-card` title, a one-line hint "Name, dates, itinerary, stats", and a chevron.
- `SectionHeader` "Leaderboards", hint "Add as many as you like.", and an "Add" secondary button on the right.
- All boards in **one** `ListGroup`. Each row: `t-card` title, a "Primary" pill on the first, the facts line (4.5), then edit (pencil) and remove (×) `IconButton`s at 44px.
- Then a "People" group with Players and Teams rows.

Apply the same to `organiser/` screens and the run organiser area.

#### 4.3 Wizards: `WizardShell`, with the slide

One component used by all five wizards (trip, tournament league, knockout, run, bracket setup):

- **Header:** progress segments (4px tall, 6px gap, fill `accent`, track bark 10%, colour change 340ms `--gd-ease`). Below that, a 52px row: back `IconButton` on the left (hidden on step 1, `opacity 0` plus `pointer-events: none` so the layout doesn't jump), "Step 2 of 4" centred in 15/600 `ink/65`, and an empty 48px cell on the right.
- **Each step:** opens with a `t-h1` question ("Name your challenge", "Pick the teams", "How runs score", "Ready to go") and at most one 17px `ink/65` line under it.
- **Continue bar:** `position: sticky; bottom: 0`, cream, top `line`, padding 12/16/28 plus the safe area. Primary `Button` at 56px. Sticky rather than fixed, so it behaves when the iOS keyboard is open.
- **The slide** (`StepSlider`, no library). On Continue, the outgoing step moves 0 → −30% with opacity 1 → 0, and the incoming step moves +100% → 0, together, over 340ms with `--gd-ease`. Back runs it mirrored.
  - Keep the previous step mounted only for the 340ms.
  - Set `inert` on the outgoing step.
  - After the slide, move focus to the new step's `h1` (`tabIndex={-1}`) for screen readers.
  - **Reduce Motion:** no movement. The steps swap with a 150ms opacity crossfade.
- The step titles above replace "STEP 1 OF 4 — CHALLENGE".

#### 4.4 Leaderboard (layout untouched, except below)

- The board switcher becomes `Segmented`.
- The board info card shows its title, the "In play" pill, and the facts line instead of the paragraph.
- Expanded-row round tiles and the scoring round picker use one tile with three states:
  - **empty:** flat, `ink/65` "No scores yet"
  - **played:** raised with a chevron
  - **live:** 2px `accent` border with the existing single glow

  This replaces the heavy `border-2 border-bark/45` "played" frame. Update `lib/roundState.ts`, which stays the one home of the glow.

#### 4.5 Board facts instead of board prose

- Add `boardFacts(lb): string[]` in `lib/leaderboards.ts`, next to `boardRules`, with the same inputs.
- Short facts: "Stableford", "Running total", "Worst round dropped", "90% handicap", "Best ball", "All count on 16–18", "Countback", "Points by position".
- Show them joined by " · " wherever a board is described on screen. Keep `boardRules` only where prose is genuinely needed (export, email), or delete it if nothing needs it.
- Change the `SCORINGS` Stableford hint to a factual line, and remove the joke.

#### 4.6 Team names on boards: stack, don't glide (Ross asked for this)

In `TripLeaderboardClient.tsx`, a team row whose name is made from its members shows them stacked:

- one first name per line, in Bespoke Serif 700 at 17px, line height 1.2
- up to two lines; a third or more members becomes "Dave / Mark +1"
- names come from `lib/displayNames.ts`, so clash handling still applies

These rows don't use `ScrollingName`, and grow to at least 64px tall. A team with a real name ("Europe") shows the name on line 1 and the members' first names on line 2 in `t-cap` `ink/65`, truncated. Columns, pinned Name and Total, and the synced scrollers don't change.

#### 4.7 Course names

Add `splitCourseName(name) → { club, course }` in `lib/courseDirectory.ts`, splitting on `" -- "`. Tiles show the club on line 1 and the course on line 2. Never print a raw `--`.

#### 4.8 Landing and front door

- Disabled "Join event" uses the disabled style (3.2), not pale green.
- The event code field uses the code style (3.1).
- Buttons are sentence case.
- Flag to Ross: the closing quote ("Right now that dot is both green and not green…") is long for a front door. His call, via `copy-review.md`.

#### 4.9 Run screens

- Add tab, signed out: left-aligned `t-h1` "Log a run", one line, primary button.
- Run leaderboard: same treatment as 4.4.

**Ross checks, Phase 4:** compare each screen to its canvas artboard, in both themes. Run the full create flow for a run challenge: each Continue slides the next step in from the right, and Back slides it back. Turn on Reduce Motion (iPhone Settings → Accessibility → Motion): steps should swap with a soft fade and no sliding.

### Phase 5: Copy pass

Apply 3.6 across every string on the screens touched so far. Use `docs/copy-review.md` as the list: fill the "New:" lines yourself where a rule decides them, and leave anything that needs Ross's judgement blank, marked "Ross".

### Phase 6: Scoring screens, last and least

- `LiveScoringFlow.tsx`: the 10px "pts" and "putts" units go to 13px.
- The rest of the scoring screens only pick up the fonts and tokens automatically.
- **No layout change.**
- Add `app/scoring` to `uiFiles()` in `test:branding`, so the floor covers it from now on.

### Phase 7: Rewrite the style book

- Replace `docs/design-system.md` with **`docs/style-guide.md`**: rules first, short, in the structure in section 6.
- Move the history and incident write-ups, which are most of today's file, to **`docs/design-history.md`**, unchanged in substance.
- Update `docs/design-brief.md`: the type facts, the decisions list from section 8, and the remaining open decisions.
- Update `CLAUDE.md`: the reference docs table points to `style-guide.md` and `design-history.md`, and every mention of the non-existent `STYLE_GUIDE.md` goes.

### Phase 8: Alive extras (only after Ross has lived with Phases 1 to 7)

- **Count-up:** only on your total after logging a run, and on the round summary total after signing a card. 400ms, `--gd-ease`, tabular numerals so the width doesn't jump. Never on a live board. Reduce Motion: the final number, at once.
- **One celebration:** the emerald dot blooms and settles (about 600ms) when a card is signed and when a run is logged. Never during score entry, never on a board, once per action. Reduce Motion: a static tick. This is a new named exception to the 400ms ceiling.

---

## 5. Hand-off blocks

```
Screen / component: Root layout (fonts)
What changes: font variables move from <body> to <html> so the fonts actually render; Schibsted Grotesk replaces Clash Display in the same deploy
Before → after: "The font bug on the live site" artboard
Colours: none
Type: no scale change in Phase 1
Spacing / radius / shadow: none
Motion: none
Reduce Motion version: n/a
Dark mode notes: none
States covered: every screen
Rules this changes: adds "font variables are declared where the font stacks are"
How I'll check it on my phone: titles are Schibsted Grotesk and labels, buttons and fields are Archivo on every screen
```

```
Screen / component: Type system
What changes: Schibsted Grotesk titles, Archivo for every other word, Bespoke Serif only for names and numbers on boards and cards; no spaced capitals
Before → after: "Title font" artboard (option C), every refreshed screen
Colours: unchanged
Type: t-h1 32 · t-h2 23 · t-card 18 (Schibsted Grotesk 700) · t-body 17 · t-label 15/600 · t-cap 15 (Archivo) · t-eyebrow 13/600 caps 0.04em (table headings only) · t-data Bespoke Serif
Spacing / radius / shadow: n/a
Motion: n/a
Reduce Motion version: n/a
Dark mode notes: same sizes
States covered: long names wrap in titles (text-balance), truncate in rows
Rules this changes: Clash Display → Schibsted Grotesk; no Fontshare; body default sans; uppercase/tracking allowlist; tab label floor 13
How I'll check it on my phone: leaderboard numbers look exactly as before; everything else is clean sans
```

```
Screen / component: Depth and texture (Card, Button, page)
What changes: raised cards with a soft warm shadow plus hairline; grain on the page only; pressed things sink
Before → after: "Parts kit" artboards, "Depth" row
Colours: line, line-strong, tint (new named mixes)
Type: n/a
Spacing / radius / shadow: card radius 20; shadow-raised, shadow-floating, shadow-cta as in 3.3; grain ≈5% light / 7% dark
Motion: press → scale 0.97 and shadow off → 120ms → ease-out
Reduce Motion version: no scale; shadow still drops
Dark mode notes: dark shadows are black plus a 1px inner top highlight
States covered: pressed, disabled, focused
Rules this changes: shadows allowed as four named levels only; grain named as an exception to "no gradients"
How I'll check it on my phone: cards look slightly lifted indoors and still have edges in sunlight
```

```
Screen / component: WizardShell (all create wizards)
What changes: big question per step, 15px+ labels, sticky Continue, steps slide right to left
Before → after: "Create wizard" artboard (tap Continue and Back)
Colours: progress fill accent, track bark 10%; disabled button disabled-bg/fg
Type: step title t-h1 (30 to 32); hint 17 ink/65; labels t-label; fields 17
Spacing / radius / shadow: fields 56px tall, radius 14; Continue 56px, radius 16, shadow-cta
Motion: Continue → outgoing 0→−30% and fade, incoming 100%→0 → 340ms → cubic-bezier(0.16,1,0.3,1); Back mirrored; progress fill 340ms
Reduce Motion version: 150ms crossfade, no movement
Dark mode notes: see "Create wizard · dark"
States covered: step 1 disabled until required fields are filled; error under its field; keyboard open (sticky bar)
Rules this changes: --gd-ease promoted app-wide
How I'll check it on my phone: create a run challenge end to end; it feels like moving forward
```

```
Screen / component: BackButton
What changes: borderless 48×48 chevron, in the flow of a 48px row
Before → after: the screenshot of step 2 (box over the progress bar) → "Create wizard" artboard
Colours: ink/80
Type: n/a
Spacing / radius / shadow: none
Motion: opacity 200ms when it appears on step 2
Reduce Motion version: appears without fading
Dark mode notes: ink/80 of the dark ink
States covered: hidden on step 1 without shifting the label
Rules this changes: touch target 48
How I'll check it on my phone: the arrow never touches the bar or the line under it
```

```
Screen / component: Trip setup (and organiser areas)
What changes: section titles bigger than what's inside them; boards in one list; facts instead of paragraphs
Before → after: "Trip setup" artboard
Colours: Primary pill accent-tint/accent-deep
Type: section t-h2; board titles t-card; facts t-cap ink/65
Spacing / radius / shadow: one raised ListGroup, rows 14px vertical padding, icon buttons 44
Motion: press on rows
Reduce Motion version: no scale
Dark mode notes: "Trip setup · dark"
States covered: 1 board, 6 boards, a board with a long custom name (wraps to 2 lines)
Rules this changes: none
How I'll check it on my phone: "Leaderboards" reads as the heading and each board as an item
```

```
Screen / component: Leaderboard: team rows and board switcher
What changes: members stacked one per line instead of gliding; segmented switcher; round tiles in three states
Before → after: "Leaderboard, team names" artboard
Colours: segmented track tint; live tile accent border plus the existing glow
Type: names Bespoke Serif 700 17/1.2; scores unchanged
Spacing / radius / shadow: team rows min 64px
Motion: none added
Reduce Motion version: n/a (ScrollingName no longer used on these rows)
Dark mode notes: "Leaderboard · dark"
States covered: pairs, threes (+1), named teams, 1 vs 16 teams
Rules this changes: the name-scroll exception no longer covers team rows
How I'll check it on my phone: every team's members readable without waiting
```

```
Screen / component: Hubs (golf trip, event, run)
What changes: one left-aligned hero; status as a list card; shorter lines
Before → after: "Trip home" artboard
Colours: links accent-deep; dot accent
Type: name t-h1; dates 17/600; standing number Bespoke Serif 700 30
Spacing / radius / shadow: raised status card, rows ≥52px
Motion: press on rows
Reduce Motion version: no scale
Dark mode notes: "Trip home · dark"
States covered: before the trip, during (next round), after (final), not claimed
Rules this changes: none
How I'll check it on my phone: golf and run homes look like siblings
```

## 6. The new style book's shape (`docs/style-guide.md`)

A rules document: one line per rule, with the reason in one clause and a link to `design-history.md` where there's a story. Target under 500 lines.

1. **Principles:** phone, outdoors, one hand; clean, snappy, textured; scores in serif, everything else sans; one emerald action per screen; a number being read never moves.
2. **Tokens:** colour (light/dark table), named mixes, elevation, radius, spacing, grain, motion.
3. **Type:** families and jobs, the scale table, uppercase and tracking rules, minimum sizes.
4. **Parts:** one entry per shared component (when to use it, variants, what not to do), each with its file.
5. **Patterns:** hub hero, settings lists, wizards, leaderboards, empty, loading and error states.
6. **Motion:** one table of every motion in the app: trigger, duration, curve, Reduce Motion version.
7. **Copy rules** (3.6).
8. **Exceptions register:** live round glow, landing collapse, intro, name scroll, scroll shades, grain, celebrations (Phase 8).
9. **How it's enforced:** which `test:branding` section holds which rule.

## 7. Test changes (`scripts/test-branding.tsx`)

1. **New: the fonts resolve.**
   - `layout.tsx`'s `<html>` className includes every `next/font` `.variable`, and `<body>`'s includes none.
   - Every `--font-*` stack in `globals.css` that refers to a `next/font` variable has it set on `<html>`.
2. **"Three fonts, one job each":** Schibsted Grotesk headline, Archivo UI and body, Bespoke Serif data. No Fontshare and no preconnect. The fallback checks stay.
3. **"Type is big enough":** add `t-eyebrow` ≥ 13. Tab label ≥ 13 (was 11). Walk `app/scoring` from Phase 6.
4. **New: spaced capitals.** `uppercase` only together with `t-eyebrow` or in the named code-field allowlist. `tracking-[…]`, `tracking-wider` and `tracking-widest` banned outside that allowlist.
5. **"No glows":** unchanged. **New:** box shadows only through the named elevation utilities, plus the live round and the intro.
6. **"Motion":** `--gd-ease` is the putt curve and is allowed everywhere. The intro exception text is updated. The ceilings are unchanged.
7. **"Status badges":** sentence case, no tracking. `Pill` replaces `Badge` (or `Badge` keeps its name, with the new classes).
8. **"One primary action":** the primary is `accent-deep` (as now). The disabled state is `disabled-bg`/`disabled-fg` and is exempt from the contrast check.
9. **Touch targets:** `BackButton` and `IconButton` ≥ 48 (44 inside dense rows, by name).

## 8. Decisions list (after this session)

| # | Decision | Status |
|---|---|---|
| D1 | Feel: clean, snappy, textured | Decided (Ross) |
| D2 | Refresh, not redesign: palette, wordmark, cream, score entry layout, leaderboard layout stay | Decided (Ross) |
| D3 | Fix the font bug first, on its own | Decided |
| D4 | Title font: Schibsted Grotesk 700, for a mature, classy, editorial feel. Bricolage Grotesque and Instrument Sans were the runners-up; Gabarito was dropped as too round and Clash Display as too wide | Decided (Ross, 18 Oct) |
| D5 | Archivo for all words; Bespoke Serif only for names and numbers on boards, cards and standings | Decided |
| D6 | No spaced capitals except table column headings and code entry | Decided |
| D7 | Depth: flat, raised and floating, hairlines kept for sunlight, grain on the page only; gradients still out; one glow (live round) | Decided (open decision 3) |
| D8 | One curve for the app: the putt curve; touch responses ≤400ms; no springs or overshoot | Decided (open decisions 2 and 4) |
| D9 | Rows don't glide to new places on live boards, for now; revisit after an event on the new look | Decided (open decision 1) |
| D10 | Count-up only after logging a run and on a signed round's total; never on a live board | Decided, Phase 8 (open decision 5) |
| D11 | One celebration, the dot bloom, when a card is signed or a run logged; never in score entry or on boards | Decided, Phase 8 (open decision 6) |
| D12 | Refresh now; re-check the title font when the new logo lands | Decided (open decision 7) |
| D13 | Team names on boards stack, one per line, no gliding | Decided (Ross raised it) |
| D14 | Wizards slide right to left, 340ms, one question per step, sticky Continue | Decided (Ross asked) |
| D15 | All hubs share one left-aligned hero | Recommended; Ross to confirm on the canvas |
| D16 | Copy rules 3.6; rules 2, 8 and 9 answer X-06, X-08 and X-09 in copy review | **Ross to confirm in `copy-review.md`** |
| D17 | Style book becomes a short rules guide plus a separate history | Decided |

**Still open for Ross:**

- D15, the hub alignment.
- D16, the copy rules.
- New default team colours (3.2, optional).
- Whether the landing quote stays.
