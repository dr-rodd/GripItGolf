# Adding platform courses in bulk

The picker's platform courses (`courses.trip_id IS NULL`) were each hand-written into a
migration — `20260101000004/5_platform_courses_a|b.sql`, tees in `_008`. That does not
scale past a couple of dozen.

This is the pipeline that replaces it. Research lands as one JSON file per course under
`data/courses/`; a gate in `npm test` refuses anything that would corrupt a card or fail a
migration; a generator turns what survives into a migration in the same shape as `_004`.

**Nothing here reaches the database on its own.** The output is a `.sql` file somebody
applies by hand.

```
data/courses/<slug>.json  →  npm test  →  npm run courses:migration  →  Supabase SQL editor
     (research)              (the gate)        (the generator)              (you)
```

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
| `holesConfidence` | yes | `HIGH` or `MEDIUM` only — see below |
| `teesConfidence` | yes | Any of `HIGH` `MEDIUM` `LOW` `EST` |
| `note` | yes, may be `null` | One line. Becomes a `-- Note:` comment in the migration |
| `sources.holes` | yes, ≥1 URL | |
| `sources.tees` | yes if `tees` non-empty | |
| `sources.coordinates` | optional | Becomes the maps-link comment |
| `holes` | yes, exactly 18 | |
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
- A course name that duplicates a shipped one, fold-insensitively

**Warnings — printed, import continues:** a county outside the thirty-two; no ladies tee; a
par total outside 68–74; `teesConfidence` of `LOW` or `EST`; two courses at identical
coordinates.

The list of already-shipped slugs is **parsed out of `supabase/migrations/*.sql`**, not kept
as a list here — the same reasoning `test:weather` applies to migration 026's coordinates.
It also means generated migrations are read on the next run, so a second batch cannot
collide with the first.

---

## Generating the migration

```
npm run courses:migration -- --dry-run    # what it would write, writes nothing
npm run courses:migration                 # writes supabase/migrations/*_platform_courses_*.sql
```

One fatal problem anywhere and it writes nothing at all. Warnings print and it proceeds.

Courses are batched twelve to a file, matching `_004` (12) and `_005` (14), and **each file
is complete per course** — courses, holes and tees for the same twelve, in the insertion
order `CLAUDE.md` gives. A course can never exist without its card.

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
