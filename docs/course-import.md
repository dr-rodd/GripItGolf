# Adding platform courses in bulk

The picker's platform courses (`courses.trip_id IS NULL`) were each hand-written into a
migration — `20260101000004/5_platform_courses_a|b.sql`, tees in `_008`. That does not
scale past a couple of dozen.

This is the pipeline that replaces it. Research lands as one JSON file per course; a gate
in `npm test` refuses anything that would corrupt a card or fail a migration; a generator
turns what survives into a migration in the same shape as `_004`.

**Nothing here reaches the database on its own.** The output is a `.sql` file somebody
applies by hand.

```
data/courses/<slug>.json  ─┐
                           ├→ npm test → npm run courses:migration → Supabase SQL editor
data/course-tees/<slug>.json ┘   (gate)      (the generator)              (you)
```

Two inputs, because there are two jobs. **`data/courses/` adds a course that is not here
yet. `data/course-tees/` improves the ratings on one that is.** A slug that has already
shipped is refused in the first; a slug that has not is refused in the second. Neither
guesses which you meant.

---

## The current job: the top 100

The list is
[top100golfcourses.com/golf-courses/britain-ireland/ireland](https://www.top100golfcourses.com/golf-courses/britain-ireland/ireland?view=alphabetical),
plus **secondary courses on those same properties** — Ballybunion's Cashen beside its Old,
Castlerock's Bann beside its Mussenden, and so on.

**Roughly a quarter of that list is already on the platform. Start by finding out which:**

```
npm run courses:migration -- --list
```

That prints every platform course with its slug, and flags any that have no card yet. Do
not research a course that is on it. If you find better tee ratings for one, that is a
`data/course-tees/` file, not a second course.

**Duplicates are the main thing that can go wrong at this scale**, and the reason is worth
knowing: two rows for one club cannot be merged afterwards. `tees` is `ON DELETE RESTRICT`
from `round_handicaps`, so once anybody has played off the second row it cannot be
deleted, and it collects its own scores forever. The gate refuses a repeated slug, and it
also refuses a *name* that reads as one already here once punctuation and the words The,
Golf, Club, Links and Course are set aside — so `Portstewart Golf Club — Strand Course`
will not slip past `Portstewart Golf Club -- The Strand Course`.

**Nine-hole and short courses are out of scope.** The contract is eighteen holes or none,
and the scorecard check requires exactly eighteen, so a nine-holer has nowhere to go.

### Three shapes a course can take

| | When | What happens |
|---|---|---|
| **Full card** | The club publishes a scorecard with men's and ladies' par and stroke index | Everything works from day one |
| **Men's card only** | No ladies card published | Imports fine. Women play the men's pars and, if there is no ladies tee either, the men's tees — `teesForPlayer` handles it |
| **No card at all** | No findable scorecard or stroke index anywhere | `holes: []` and `holesConfidence: "NONE"`. The course is searchable, files under its county, carries its weather, and is badged "Awaiting scorecard". Scoring is gated until somebody photographs the card, which then creates the eighteen holes |

**Prefer a cardless import to omitting a course.** A course nobody can find is worse than
one waiting on a photograph. But it is `NONE` only when the card genuinely is not
published — never as a shortcut past a card that was hard to read.

---

## Where the research happens

Claude Code's remote container **cannot reach ncrdb.usga.org or any club website** — the
environment's network policy blocks outbound HTTPS, so `WebFetch` returns `EGRESS_BLOCKED`.
The sourcing half runs in **Cowork on the Mac**, which has an ordinary network and can also
read a folder of scorecard PDFs or photos.

That split is why this document exists: Claude Code owns the contract and the gate, Cowork
owns the research, and the gate is what makes the handover safe.

---

## The worked example

This exact block is parsed out of this document and validated by
`scripts/test-course-import.ts`, so it cannot rot into a lie. **The course is fictional** —
it is here to show the shape, not to be imported.

```json
{
  "name": "Example Golf Links",
  "slug": "example-golf-links",
  "county": "Down",
  "location": "Ballyexample, Down, Northern Ireland",
  "website": "https://example.com/",
  "latitude": 54.2603,
  "longitude": -5.6072,
  "holesConfidence": "HIGH",
  "teesConfidence": "HIGH",
  "note": "Ladies play the 4th, 7th and 13th as par 5s.",
  "sources": {
    "holes": ["https://example.com/course/scorecard/"],
    "tees": ["https://ncrdb.usga.org/courseTeeInfo?CourseID=12345"],
    "coordinates": "https://www.google.com/maps/place/54.2603,-5.6072"
  },
  "holes": [
    { "hole_number":  1, "par": 4, "stroke_index":  5, "par_ladies": 4, "stroke_index_ladies":  7 },
    { "hole_number":  2, "par": 4, "stroke_index":  9, "par_ladies": 4, "stroke_index_ladies":  5 },
    { "hole_number":  3, "par": 3, "stroke_index": 17, "par_ladies": 3, "stroke_index_ladies": 17 },
    { "hole_number":  4, "par": 4, "stroke_index":  1, "par_ladies": 5, "stroke_index_ladies":  1 },
    { "hole_number":  5, "par": 4, "stroke_index": 11, "par_ladies": 4, "stroke_index_ladies": 11 },
    { "hole_number":  6, "par": 5, "stroke_index":  7, "par_ladies": 5, "stroke_index_ladies":  3 },
    { "hole_number":  7, "par": 4, "stroke_index":  3, "par_ladies": 5, "stroke_index_ladies":  9 },
    { "hole_number":  8, "par": 3, "stroke_index": 15, "par_ladies": 3, "stroke_index_ladies": 15 },
    { "hole_number":  9, "par": 4, "stroke_index": 13, "par_ladies": 4, "stroke_index_ladies": 13 },
    { "hole_number": 10, "par": 4, "stroke_index":  6, "par_ladies": 4, "stroke_index_ladies":  6 },
    { "hole_number": 11, "par": 3, "stroke_index": 18, "par_ladies": 3, "stroke_index_ladies": 18 },
    { "hole_number": 12, "par": 4, "stroke_index": 10, "par_ladies": 4, "stroke_index_ladies": 12 },
    { "hole_number": 13, "par": 4, "stroke_index":  2, "par_ladies": 5, "stroke_index_ladies":  2 },
    { "hole_number": 14, "par": 5, "stroke_index":  8, "par_ladies": 5, "stroke_index_ladies":  4 },
    { "hole_number": 15, "par": 4, "stroke_index": 12, "par_ladies": 4, "stroke_index_ladies": 10 },
    { "hole_number": 16, "par": 3, "stroke_index": 16, "par_ladies": 3, "stroke_index_ladies": 16 },
    { "hole_number": 17, "par": 4, "stroke_index":  4, "par_ladies": 4, "stroke_index_ladies":  8 },
    { "hole_number": 18, "par": 4, "stroke_index": 14, "par_ladies": 4, "stroke_index_ladies": 14 }
  ],
  "tees": [
    { "name": "Blue",  "gender": "M", "par": 70, "course_rating": 71.5, "slope": 128 },
    { "name": "White", "gender": "M", "par": 70, "course_rating": 70.1, "slope": 124 },
    { "name": "Red",   "gender": "F", "par": 73, "course_rating": 72.6, "slope": 128 }
  ]
}
```

### Field by field

| Field | Required | |
|---|---|---|
| `name` | yes | ≤80 chars. A sub-course is `Club Name -- Course Name`, two hyphens: `Ballybunion Golf Club -- Old Course` |
| `slug` | yes | **Short and human** — `lahinch-old`, not `slugify(name)`. The filename must be `<slug>.json` |
| `county` | yes | Canonical: no `Co.`/`County` prefix, **Derry not Londonderry** |
| `location` | yes | `Town, County, Country`, ≤120 chars |
| `website` | yes | Already normalised — usually with a trailing slash |
| `latitude` / `longitude` | yes, both | The course, not the town. Four decimal places at most |
| `holesConfidence` | yes | `HIGH` or `MEDIUM` only — or `NONE` when the club publishes no card |
| `teesConfidence` | yes | Any of `HIGH` `MEDIUM` `LOW` `EST` |
| `note` | yes, may be `null` | One line. Becomes a `-- Note:` comment in the migration. **Required, non-null, when `holesConfidence` is `NONE`** — it is the only record of what was looked at |
| `sources.holes` | yes, ≥1 URL | Must be **exactly `[]`** when `holesConfidence` is `NONE` — a source for holes that do not exist means one was found after all |
| `sources.tees` | yes if `tees` non-empty | |
| `sources.coordinates` | optional | Becomes the maps-link comment |
| `holes` | yes, exactly 18 | Or **exactly `[]`**, and then `holesConfidence` must be `NONE`. Never anything in between: a card that vanished in an edit looks just like a club that publishes none, so emptiness has to be declared |
| `tees` | yes, ≥1 with `"gender": "M"` | An `F` tee is a warning if missing, not an error |

`holes[]` entries are exactly the `NewHoleRow` type and `tees[]` entries exactly
`NewTeeRow`, both from `lib/cardCheck.ts` — **database column names, no camelCase**. That is
deliberate: it lets the gate call `validateNewHoleRows` and `validNewTee` straight on the
parsed file with no translation layer in between, and a translation layer is the thing that
drifts.

A consequence worth knowing: `validateNewHoleRows` enforces a strict column whitelist, so
**a hole cannot carry a provenance field**. Provenance is per course.

**Not in the contract, on purpose:**

- `card_verified` — the generator always writes `false`. Researched is not photographed.
- `ladies_data_verified` / `ladies_data_note` — derived from whether all 18 `par_ladies`
  are present, matching `app/api/courses/route.ts`. A flag that is a function of data
  already in the file is a second copy waiting to disagree with the first.
- **Yardages.** `yardage_black` … `yardage_claret` are permitted and range-checked, but do
  not go looking for them. Those eight columns have never held a value and nothing on any
  screen reads them; half-filling them is worse than leaving them empty.

---

## The research rules

These are not style preferences. Each one is a way the data can be wrong that no test can
catch afterwards.

- **If the stroke index column is not a clean 1–18 permutation, omit the course.** Do not
  repair it, do not infer the missing one from the other seventeen, do not take one card's
  indices and another card's pars. A wrong index mis-hands shots on every round of that
  course, for every trip, forever, and nothing on screen ever says so.
- **Men's and ladies' both, or ladies' not at all.** All 18 `par_ladies` and all 18
  `stroke_index_ladies`, or `null` on all 18 of each. Twelve holes of ladies par is a
  misread, not a partial truth — `lib/courseCard.ts` would render half of one card and half
  of the other.
- **Par is 3, 4 or 5.** Postgres CHECKs `holes.par between 3 and 5` even though the card
  check allows 6. If a hole is genuinely a par 6, omit the course and say so — do not
  quietly downgrade it to a 5. (`supabase/migrations/20260101000033_hole_par_six.sql`
  closes that divergence and is written but not applied; once it is, this rule relaxes to
  3–6 and `DB_HOLE_PAR` goes with it. `docs/gotchas-and-debt.md` has the detail.)
- **The tee par must equal that gender's hole total.** Men's tee par = Σ men's par; ladies'
  tee par = Σ ladies' par (or the men's total when there is no ladies card). If a published
  tee par disagrees with the scorecard, **the holes win** — the playing-handicap formula
  reads `tees.par`, so a mismatch scores every round off the wrong number.
- **Tees from `ncrdb.usga.org`, holes from the club's own scorecard**, and record the two
  source URLs **separately**. They are not the same page and usually not the same site.
- **Where a rating disagrees, the USGA database wins.** The NBC properties — GolfPass,
  GolfAdvisor, GolfNow — share one backend, and their figures sometimes differ from the
  official ones. NCRDB carries the *rated* number, which is the one the playing-handicap
  formula should be reading.
- **Holes must be `HIGH` or `MEDIUM`.** A single aggregator with no club corroboration is
  `LOW` — omit the course. Tees may be lower; say so honestly rather than rounding up.
- **Coordinates are the course, not the town.** Migration 026 explains why: Old Head is
  eleven kilometres out on a headland, and a town-centre forecast is confidently wrong and
  always calm.
- **Work in batches of about ten and run `npm test` after each.** Fix a failing batch
  before starting the next.

### Two things not to worry about

**Men's and ladies' stroke index diverging wildly is normal.** A ladies card is rated for
a different player off different tees; a hole that is a driver-wedge for a man can be the
hardest on the course for a shorter hitter. Calibrated across the 28 shipped courses:
Enniscrone and Rosapenna Sandy Hills each have four holes where the two differ by more
than eight with no par change, and Adare Manor, Ballybunion Old, Royal County Down and
Royal Portrush all have at least one. Six courses are identical on all eighteen; County
Sligo agrees on only six. **Do not "correct" a card to make the two columns look alike**,
and do not flag it — only a *par* change is evidence of anything, and the gate already
checks the case where that matters.

**A tee par that disagrees with the holes is not yours to reconcile by choosing.** The
holes win, always. The gate will tell you which tee and by how much.

### Where a course's numbers should come from

| | Source | Fallback |
|---|---|---|
| Holes — par, stroke index, both genders | The club's own scorecard or course page | A second independent card, to corroborate. One aggregator alone is `LOW`, which is refused |
| Tees — par, course rating, slope | `ncrdb.usga.org` | The club's own "course and slope rating" page |
| Coordinates | The course itself on a map | Never the town centre |

Where a rating disagrees between NCRDB and GolfPass/GolfAdvisor/GolfNow, **NCRDB wins** —
those three share a backend and it is not always the rated figure.

### Where the tees actually come from — settled

This used to say "open randa.org's search and report back". That has been done, and the
answer is in **`docs/randa-reconnaissance.md`**. In short:

- `randa.org/course-rating-lookup` **404s**. The R&A no longer hosts a public per-club
  search; the live resource is the **USGA National Course Rating Database** at
  `ncrdb.usga.org`, which is the CRS extract the brief always meant.
- It exposes **tee sets only** — name, gender, par, Course Rating, Bogey Rating, Slope,
  the nine-by-nine splits and the length. **No per-hole data of any kind**, so no stroke
  index. The tees/holes split above is confirmed rather than optional, and holes can never
  be promoted to `HIGH` on a rating database alone.
- The NCRDB search form is JavaScript and cannot be fetched, but a course page is, once
  you have its id: `https://ncrdb.usga.org/courseTeeInfo?CourseID=<n>`. Find the id with an
  ordinary web search, or by driving the search in a real browser.

---

## What the gate refuses

`npm run test:course-import`, and it runs inside `npm test`. Rules come from
`lib/courseImport.ts`, which imports rather than restates: `validateNewHoleRows`,
`validNewTee` and `TEE_COLUMN_RANGE` from `lib/cardCheck.ts`; `courseNameError`,
`countyError`, `countyOf`, `websiteError`, `normalizeWebsite` and `slugify` from
`lib/courseDirectory.ts`; `truncCoord` from `lib/weather.ts`.

**Fatal — nothing is written:**

- Not 18 holes, hole numbers not 1–18, an unexpected column, a stroke index that is not a
  permutation, a half-read ladies card *(`validateNewHoleRows`)*
- **A par outside 3–5.** The one rule with no app-layer twin: `cardCheck.ts` allows 3–6 in
  four places, Postgres allows 3–5, so a par-6 hole passes every application validator and
  then fails the migration
- Coordinates missing, half-null, outside 49–61 N / −11–2 E, or with a fifth decimal
- `holesConfidence` of `LOW` or `EST`; a missing or non-URL source
- A blank or over-long name, a missing county, a non-canonical county, a bad website
- A tee that is not writable, no men's tee, the same tee name twice for one gender
- **A tee par that disagrees with the holes** — checked by handing the file to `diffCard`
  with the tee pars nulled, so the rule has one implementation, not two
- **A slug already used** by a shipped course or another file in the batch. This one is not
  a harmless skip: `INSERT INTO courses … ON CONFLICT DO NOTHING` drops the duplicate row,
  and the holes insert's `JOIN courses c ON c.slug = …` then hangs these eighteen holes off
  the *existing* course — a live card, silently replaced
- A course name that duplicates a shipped one, fold-insensitively — **or that reads as the
  same club** once punctuation and the words The, Golf, Club, Links and Course are set
  aside. A shorter name wholly inside a longer one is a *warning*, not a refusal
- `holes: []` without `holesConfidence: NONE`, or `NONE` with holes present — emptiness
  must be declared, never inferred
- On a cardless course: two different pars for the same gender across its tees, or tee
  confidence below MEDIUM. With no holes to check against, those are the only structural
  checks left

**Warnings — printed, import continues:** a county outside the thirty-two; no ladies tee
(a woman plays off the men's); a par total outside 68–74; `teesConfidence` of `LOW` or
`EST`; two courses at identical coordinates; a shorter name wholly contained in a longer
one; a cardless course, whose tee par has nothing to be checked against.

The list of already-shipped courses is **parsed out of `supabase/migrations/*.sql`**, not
kept as a list here — the same reasoning `test:weather` applies to migration 026's
coordinates, and a checked-in copy would go stale the moment a course landed. Generated
course migrations are skipped when working out what a *new* course may collide with,
because they are only a projection of `data/courses/` and every course would otherwise
collide with itself on the second run. They are read for everything else — where a course
already lives, and whether a tee refresh names a real one.

---

## Improving a course that is already here

`data/course-tees/<slug>.json`. New ratings for a course already on the platform — the
only way to correct one, because the new-course gate refuses a slug that has shipped.

```json
{
  "slug": "adare-manor",
  "name": "Adare Manor Golf Course",
  "teesConfidence": "HIGH",
  "note": "Replaces migration 008's estimated course ratings.",
  "sources": { "tees": ["https://ncrdb.usga.org/courseTeeInfo?CourseID=..."] },
  "tees": [
    { "name": "Black", "gender": "M", "par": 72, "course_rating": 74.9, "slope": 141 }
  ]
}
```

- The slug **must** already be a platform course, and `name` must match the shipped one —
  that is the guard that catches one club's ratings landing in another's file.
- **No `holes` key.** A course file dropped in this directory is refused rather than
  importing its ratings and silently losing its card.
- A **ladies-only refresh is fine**. Correcting one gender is the commonest case.
- Only the tees you list are touched. A stored tee you do not name is left exactly as it
  is — which is also the limitation: a *wrong* tee cannot be removed this way. That is a
  hand job in the SQL editor, and it will be refused outright if anybody has played off it.
- **`par` is not taken from your file.** The migration derives it from the stored holes,
  so a refresh can never revert a correction a scorecard photo has already made. Give the
  published figure anyway — the gate checks it against the stored card and will tell you
  if the two disagree, which usually means you are looking at the wrong course.

## Generating the migration

```
npm run courses:migration -- --dry-run    # what it would write, writes nothing
npm run courses:migration                 # writes supabase/migrations/*_platform_courses_*.sql
```

One fatal problem anywhere and it writes nothing at all. Warnings print and it proceeds.

Courses are batched twenty-five to a file, and **each file is complete per course** —
courses, holes and tees for the same twenty-five, in the insertion order `CLAUDE.md`
gives. A course can never exist without its card. Tee refreshes get their own
`_course_tees_*` files: they upsert where a course file inserts, and two opposite conflict
policies in one file would be unreadable to whoever is pasting it.

**A course stays in the file it first landed in.** The generator reads the slugs back out
of its own output to see where each one already lives, so adding a course early in the
alphabet touches one file rather than rewriting all of them — which is also what makes
"paste the files you have not pasted yet" a question with an answer. The run prints
`wrote`, `rewrote` or `unchanged` per file; only the first two need pasting.

**Editing a course that has already been applied does not take effect on re-paste.** The
inserts are `ON CONFLICT DO NOTHING`, so the row is already there and stays as it is.
Correcting a live course is the scorecard-photo path, or a tee refresh, or a hand fix —
not a re-run of this.

**Numbering is idempotent.** Every generated file carries `GENERATED by
scripts/build-course-migration.ts` as its second line; the generator reuses the numbers of
files carrying that marker and otherwise starts at `max + 1`. So re-running after editing
one course rewrites the same filenames and `git diff` shows only what changed. Without it a
second run would emit new numbers alongside the old and import every course twice.

**Two deliberate differences from migration 008**, both commented in the output:

1. **Nothing is deleted.** 008 cleared its tees first to be re-runnable. That is no longer
   safe — `round_handicaps.tee_id` is `REFERENCES tees(id) ON DELETE RESTRICT`, so once
   anybody has played off a tee it cannot be removed and the delete aborts. Replay-safety
   comes from `ON CONFLICT ON CONSTRAINT uq_tees_course_name_gender DO NOTHING` instead.
2. **Explicit `BEGIN;` / `COMMIT;`.** Redundant — the SQL editor and `scripts/migrate.ts`
   both run a multi-statement script as one implicit transaction — but the person pasting
   it does not know that, and the file should say what it guarantees.

## Applying it

Paste each file into the Supabase SQL editor, **in numeric order**, one file at a time.
`docs/testing-and-data.md` prefers the editor over `scripts/migrate.ts` for a single
migration, and each generated file is one transaction, so a failure leaves nothing behind.

Then, in the app: the courses appear in the picker under the right county chip, badged
**Awaiting scorecard**, with their tees on the round page.

## After it lands

An imported course is **playable but not photographed**. `hasCard` is `holes.length > 0`,
so scoring works; `card_verified` is false, so the badge is honest.

The correction path is already built. `handleCreate` in `app/api/card-check/apply/route.ts`
refuses a course that already has holes, so the first scorecard photo of an imported course
takes the **diff** path — it shows exactly which researched numbers disagree with the
printed card, and applying it fixes them and flips `card_verified` true. That is the
designed way a researched card becomes a confirmed one, and it needs no new code.

**Backing a course out is not a `DELETE`** once it has been played: `tees` is
`ON DELETE RESTRICT` from `round_handicaps`. Land a first batch, live with it, then
continue.
