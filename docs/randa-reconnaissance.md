# randa.org reconnaissance — what the R&A rating lookup exposes per club

*The first job in `docs/course-import.md`, done from Cowork (which, unlike Claude
Code's container, can reach the open web).*

## Headline

**The hypothesis in the brief holds.** The R&A / USGA course-rating lookup exposes
**tee sets only** — never hole-by-hole par or stroke index. So the pipeline's split
stands: **tees come from the rating database, the hole card (par + stroke index) must
come from the club's own scorecard.** Holes do **not** get promoted to `HIGH` on the
strength of randa.org; they still rest on the club card.

## Where the data actually lives

The `https://www.randa.org/course-rating-lookup` URL in the brief now **404s**. The R&A
does not host its own public per-club search any more; the live, authoritative resource
is the **USGA National Course Rating Database at `ncrdb.usga.org`**, which is exactly the
"extract of the USGA CRS database" the brief describes. The R&A's handicapping pages
(`randa.org/.../appendix-g`) explain the rating *system* but carry no club data. Treat
**`ncrdb.usga.org` as the tee source** and cite it as such.

Practical note for future sessions: the NCRDB **search form is JavaScript** and cannot be
fetched directly, but an individual course page **is** fetchable once you have its id —
`https://ncrdb.usga.org/courseTeeInfo?CourseID=<n>`. Find the id via a normal web search
for the club, or by driving the search in a real browser.

## What a club page exposes, field by field

Verbatim column headers from a course page:

> Tee Name · Gender · Par · Course Rating™ · Bogey Rating™ · Slope Rating® · RatingF9 ·
> RatingB9 · Front (9) · Back (9) · Bogey Rating (F9) · Bogey Rating (B9) · Slope (F9) ·
> Slope (B9) · TeeID · Length

Per **tee set** you get: name, gender, par, Course Rating, Bogey Rating, Slope, the front/
back-nine rating and slope splits, a TeeID and the length in yards. Identity fields are
club/course name, city and state/country.

**No per-hole data of any kind** — no per-hole par, no per-hole stroke index, no per-hole
handicap. Everything is aggregated to the full course or to a nine. This is the whole
reason the brief separates `sources.tees` from `sources.holes`: stroke index is set by the
club and printed on its own card, and it is simply not in this database.

## Consequence for the contract (unchanged, now confirmed)

- `tees[]` (name, gender, par, course_rating, slope) → **ncrdb.usga.org**, `sources.tees`.
- `holes[]` (par, stroke_index, and the ladies pair) → **the club's own scorecard**,
  `sources.holes`, corroborated by an independent card. A lone aggregator is `LOW` → omit.
- Because the rating DB never carries stroke index, **holes stay `HIGH`/`MEDIUM` on the
  club card alone**; randa.org can only ever raise confidence in the *tees*.

One gotcha worth flagging: NBC properties (GolfPass / GolfAdvisor / GolfNow) share one
backend and their ratings sometimes **disagree** with the official NCRDB figures. When they
differ, the NCRDB value wins — that is the rated one the handicap formula should see.
