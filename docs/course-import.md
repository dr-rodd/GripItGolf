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

That is a **survey, not a check**: it prints what is staged in both directories and whether
each file is ready, then every platform course with its slug, flagging any that have no
card yet. It writes nothing and — unlike the gate — never fails on a broken file, because
the point is to see the state including what is still wrong.

### How this run is being done

**One handover of the whole hundred, as a patch.** Research everything, then export a
single `.patch` for Claude Code to validate and turn into migrations. That is the shape
that has been chosen, and it has one consequence worth taking seriously:

**There is no wave to catch a systematic mistake.** If the method is wrong — the tee par
taken from the wrong column, the ladies card reconstructed, the stroke index pulled from an
aggregator instead of the club — it will be wrong on all hundred before anybody sees a
course in the app, and the whole run has to be done again.

So do not save the checking until the end:

- **Run `npm test` after the first two or three files.** A method error found on file 3
  costs an hour. Found on file 100 it costs the run.
- **Run it again every ten**, and fix a failing batch before starting the next.
- The gate is fast — under a second at a hundred courses — so there is no reason to skip it.

The pipeline has been rehearsed at this volume: a hundred courses validate and generate in
well under a second, batching into four migration files of twenty-five plus one for the tee
refreshes. It will not fall over. The only thing that can waste the effort is the data.

**The ~25 courses already on the platform are not part of the hundred.** Do not re-add
them — a repeated slug is refused, and a name that merely *reads* the same is refused too.
If their tee ratings can be improved, that is a `data/course-tees/` file. Everything else
about them stays as it is.

Do not research a course that is already on the list. If you find better tee ratings for
one, that is a `data/course-tees/` file, not a second course.

**Duplicates are the main thing that can go wrong at this scale**, and the reason is worth
knowing: two rows for one club cannot be merged afterwards. `tees` is `ON DELETE RESTRICT`
from `round_handicaps`, so once anybody has played off the second row it cannot be
deleted, and it collects its own scores forever. The gate refuses a repeated slug, and it
also refuses a *name* that reads as one already here once punctuation and the words The,
Golf, Club, Links and Course are set aside — so `Portstewart Golf Club — Strand Course`
will not slip past `Portstewart Golf Club -- The Strand Course`.

**Nine-hole and short courses are out of scope.** The contract is eighteen holes or none,
and the scorecard check requires exactly eighteen, so a nine-holer has nowhere to go.

### Four shapes a course can take

| | When | What happens |
|---|---|---|
| **Full card** | The club publishes a scorecard with men's and ladies' par and stroke index | Everything works from day one |
| **Men's card only** | No ladies card published | Imports fine. Women play the men's pars and, if there is no ladies tee either, the men's tees — `teesForPlayer` handles it |
| **No ratings** | The club publishes a card but no course rating and slope — **the common case in Ireland, where cards print SSS** | `tees: []` and `teesConfidence: "NONE"`. The card is stored and correct; nobody can be given a tee, so `canStart` gates the round. Badged "Awaiting ratings", because a photograph is not what it is short of — the ratings arrive through `data/course-tees/` |
| **No card at all** | No findable scorecard or stroke index anywhere | `holes: []` and `holesConfidence: "NONE"`. The course is searchable, files under its county, carries its weather, and is badged "No scorecard". Scoring is gated until somebody photographs the card, which then creates the eighteen holes |

**The last two are independent** — a course can be missing either, or both, and a
course missing both is still worth having. Each is a **declared** absence: `holes: []`
if and only if `holesConfidence` is `NONE`, `tees: []` if and only if `teesConfidence`
is `NONE`, checked in both directions. A list that vanished in an edit looks exactly
like a club that publishes none, so the gate never infers it.

**Prefer an incomplete import to omitting a course.** A course nobody can find is worse
than one waiting on a photograph. But it is `NONE` only when the thing genuinely is not
published — never as a shortcut past a card that was hard to read, or a rating that
would have taken another click.

**The 24 courses the first run dropped are written up in `docs/course-discards.md`**,
with what each still needs. Seventeen of them need nothing but a latitude and longitude.

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

### Four things that look like mistakes and are not

The rules above are shapes the data can take that no test catches. These are the
opposite: shapes in **good** data that look wrong. The gate cannot tell them from errors —
a permutation is still a permutation, a total still adds up — so the only thing that
protects them is not "fixing" them. Correcting one replaces a right number with a wrong
one, by hand, which is the exact failure this pipeline exists to prevent.

**A stroke index that runs odd on one nine and even on the other is the card, not an
artefact.** It is the standard UK and Ireland allocation: the eighteen indices are laid out
so odd numbers fall on one nine and even on the other, which keeps SI 1 and SI 2 off the
same nine and spreads a handicap's shots evenly across the two halves. It reads as
manufactured. Checked across every shipped card, **26 of 28 courses do exactly this** —
only Carne and County Sligo are mixed — and both batch-C courses do it too (The Heath even
out / odd in, Castlerock odd out / even in). **When one source shows this tidy split and
another shows a scrambled order, the tidy one is almost always the club's own card.** Do
not tug it toward the messier source to make it look more random: an aggregator's ordering
for The Heath disagreed with the club card on four holes, and the club card was right.

**Men's and ladies' stroke index diverging wildly is normal, and so is their agreeing
exactly.** A ladies card is rated for a different player off different tees; a hole that is
a driver-wedge for a man can be the hardest on the course for a shorter hitter. Across the
28: Enniscrone and Rosapenna Sandy Hills each have four holes where the two differ by more
than eight with no par change, and Adare Manor, Ballybunion Old, Royal County Down and
Royal Portrush all have at least one. Six courses are identical on all eighteen, because
some clubs print one stroke-index column for both. County Sligo agrees on only six holes.
None of that is something to reconcile — only a *par* change is evidence of anything, and
the gate already checks the case where that matters.

**A rated ladies tee is not a ladies card.** The R&A may rate a ladies tee — Castlerock's
is par 75 — while the club publishes no hole-by-hole ladies card at all. A rated total is
not eighteen numbers. **Do not reconstruct eighteen ladies pars and indices to make that 75
add up**: that is inventing a stroke index, the one number this document says never to
guess, and it would look like diligence right up until somebody played off it. Leave
`par_ladies` and `stroke_index_ladies` null on all eighteen — the rule is already both
genders or ladies not at all — let `ladies_data_verified` fall to false on its own, and the
men's numbers carry everyone.

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
npm run courses:migration -- --list      # the survey: what is staged, what has shipped
npm run courses:migration -- --dry-run   # what it would write, writes nothing
npm run courses:migration                # writes supabase/migrations/*_*.sql
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

**This is the step the whole thing fails at.** Generating a migration changes no data.
Committing it changes no data. *Pushing* it changes no data — a deploy ships the app, not
the courses. There is no ledger, so nothing anywhere will tell you a file is still waiting.
A course sits in the repo looking finished until somebody pastes it.

Paste each file into the Supabase SQL editor, **in numeric order**, one file at a time.
`docs/testing-and-data.md` prefers the editor over `scripts/migrate.ts` for a single
migration, and each generated file is one transaction, so a failure leaves nothing behind.

**The paste checks itself.** Every generated file ends, after its `COMMIT`, with a live
`SELECT` naming its own courses, so the last thing on screen is a row per course with its
hole and tee counts. **A generated file should never finish on "Success. No rows
returned."** — if it does, either the paste stopped early or the file is not one of these.
Re-pasting a file already applied is safe and prints the same answer: the writes skip or
rewrite the same values, and only the `SELECT` has anything left to say.

That block was commented out until it mislead somebody: a file of nothing but inserts ends
with "no rows returned", which is precisely what a migration that did nothing says, and an
instruction to uncomment a query first does not survive the moment you actually want the
answer.

**`/admin/courses`** answers the same question for the platform as a whole — every course
with its card state, counted in the subtitle: `Verified` for a photographed card,
`Awaiting photo` for a researched one, `No scorecard` for a course with no holes that
cannot yet be scored.

### A research patch's own migrations are discarded

A Cowork patch usually arrives carrying `*_platform_courses_*.sql` of its own. **Take the
JSON and regenerate; do not commit their SQL.** Their generator may be a different vintage
(a different batch size, so different files), and it numbers from what it can see — which
is not what has landed on `master` since. That has already collided once: their
`_035_platform_courses_d.sql` against the `_035_tee_par_follows_holes.sql` already applied
here, two different migrations at one number, on a number half-run.

The consequence to expect: **batch letters in a Cowork commit message will not match this
repo's.** The repo's mapping is whatever each file's own `-- Platform courses batch X` line
says, and `npm run courses:migration -- --list` is the authority on which courses exist at
all. A patch's "batch C" going missing is normally this, not a lost course.

In the app itself the courses then appear in the picker under the right county chip, badged
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
