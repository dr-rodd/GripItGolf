# The courses that did not make it, and what each one needs

The top-100 research run attempted 24 courses it could not import. Cowork wrote them
up rather than dropping them, which was the right call — the research is most of the
work, and every one of them was one small field short.

This file is both halves: **the record** of what was found, and **the brief** for the
short pass that finishes them. It is deliberately not `docs/course-import.md` — that
document is the contract and the method, and outlives any one batch. This one is a
work list and should be deleted when it is empty.

---

## What changed to let them in

The gate refused all 24 on a single rule: **at least one men's tee was fatal**, and
`validNewTee` needs par, course rating and slope together. Irish clubs publish
**SSS**, which is a CONGU scratch score, not a USGA slope. So a club could publish a
flawless scorecard and still have nothing a tee row could be written from.

That rule was stricter than the app it feeds. `app/api/courses/route.ts` accepts
`tees: []` from the add-course form without complaint, and has an explicit path that
ships a course whose tee insert *failed* — a teeless course has been a normal state in
production the whole time. Nothing can be mis-scored by allowing it either:
`canStart` requires a tee for every selected player, so no tees gates a round exactly
as no holes does.

So `teesConfidence` now takes `NONE`, the same way `holesConfidence` does, and under
the same biconditional — `tees: []` if and only if `teesConfidence` is `NONE`, checked
in both directions, because a tee list deleted in an edit looks identical to a club
that publishes no ratings.

**A fourth card state came with it.** `cardState` used to read hole count and the
verified flag. A course with a card and no ratings would have badged *Awaiting photo*,
and a photo is not what it is short of — Irish cards do not print slope, so
photographing one changes nothing. It now badges **Awaiting ratings**, and the badge
names the blocker rather than the paperwork.

---

## Landed (migration 038)

Four had everything the gate needs. Two carry a full card and no ratings; two carry
neither and are pure directory entries until somebody photographs a card.

| Course | County | State |
|---|---|---|
| Esker Hills | Offaly | 18 holes, no tees — **Awaiting ratings** |
| Luttrellstown Castle | Dublin | 18 holes + ladies SI, no tees — **Awaiting ratings** |
| The Castle | Dublin | no card, no tees — **No scorecard** |
| Bunclody | Wexford | no card, no tees — **No scorecard** |

Every transcribed column was re-checked before it was written: par totals correct,
every stroke index a clean permutation of 1–18.

---

## The work list — 19 courses

**For 17 of them the only missing field is a latitude and longitude.** Coordinates are
fatal in the gate and always have been: without them a course has no weather, and the
other 69 all have it. Cowork recorded coords for only five courses, and Claude Code's
container cannot reach a map or a club site to fill the rest in.

So this is a short pass, not a research run. The identity, the sources and in seven
cases the whole card are already below.

### 1 · Card already captured — coordinates only

Three courses whose par and stroke index are transcribed in this file and verified
clean. Add coordinates and they land exactly as Esker Hills did.

| Course | County | Website |
|---|---|---|
| Mount Wolseley | Carlow | mountwolseley.ie |
| Tramore (Old) | Waterford | tramoregolfclub.com |
| Portumna | Galway | portumnagolfclub.ie |

**Mount Wolseley** · par 72
- par `4,4,4,4,5,3,5,4,3 / 5,3,5,4,4,4,3,4,4`
- SI `5,3,1,11,13,9,15,7,17 / 14,4,18,8,16,2,10,12,6`
- Ladies card also published (par 74) — not transcribed. SSS Blue 75 / White 73 / Yellow 71 / Red 73.
- Source: `/wp-content/uploads/pdf/golf-score-cards.pdf`

**Tramore (Old)** · par 72 men, 75 ladies — both cards clean
- men par `4,5,3,4,4,3,4,4,5 / 3,4,4,4,4,3,5,4,5`
- men SI `8,10,12,6,14,16,4,2,18 / 9,7,13,3,1,17,11,5,15`
- ladies par `4,5,3,4,4,3,5,5,5 / 3,4,4,4,5,3,5,4,5`
- ladies SI `10,2,18,4,8,16,14,12,6 / 15,5,13,1,11,17,9,3,7`
- Source: club scorecard, WP page 8453 + image

**Portumna** · par 72
- par `4,3,4,4,3,5,4,5,4 / 3,4,5,4,4,4,4,5,3`
- SI `7,17,1,5,9,11,3,15,13 / 6,12,18,10,4,16,8,2,14`
- Source: `/wp-content/uploads/2025/06/Portumna-Scorecard-1.pdf`

### 2 · Card published and reachable — transcribe it

The page was found and not read. Do not mark either of these `NONE`: the card exists,
and `NONE` means the club publishes none, never that reading it was awkward.

| Course | County | Needs | Where |
|---|---|---|---|
| Kilkenny | Kilkenny | coords + card | `/the-course/scorecard/` — men + full ladies card, SSS White 71 / Green 70 / Ladies 73 |
| Arklow | Wicklow | card only — coords ≈ 52.7866, -6.1475 | `/wp-content/uploads/sites/7570/2020/12/scorecard.jpg` — men (par 70) + ladies (par 72), both clean |

### 3 · Stroke index irreconcilable — land them cardless

Par is solid on all four; the stroke index columns genuinely disagree between sources,
so no card meets "two independent agreeing sources". **That is what `holesConfidence:
"NONE"` is for** — a course nobody can find is worse than one waiting on a photograph,
and the first scorecard photo settles the argument on the first tee.

Add coordinates, write the conflict into the `note`, and carry no holes and no tees.
Do **not** try to pick a winner between the sources.

| Course | County | The conflict |
|---|---|---|
| Dooks | Kerry | Club site and the aggregator feed disagree on most holes; not in NCRDB |
| Kirkistown Castle | Down | Two whole cards — par 69 vs 70, hole 10 a par 4 or 5, and the tee ratings conflict too |
| Galgorm Castle | Antrim | Two different SI allocations (Hole19 vs 18birdies). Uncorroborated tee ratings exist; leave them out rather than grade them LOW |
| Belvoir Park | Down | 14 of 18 agree; holes 11 and 18 are dead 2–2 ties. Only the club card breaks them |

### 4 · No card reached at all — land them cardless

Identity is solid, the card is not published or the site blocks bots. Coordinates,
a note, nothing else.

| Course | County | Site |
|---|---|---|
| Royal County Down — Annesley Links | Down | royalcountydown.org (robots-blocked) |
| Galway Golf Club | Galway | galwaygolf.com (403) |
| Galway Bay Resort | Galway | galwaybaygolfresort.com |
| Heritage Killenard | Laois | theheritage.com |
| Palmerstown House Estate | Kildare | palmerstownhouse.ie |
| Moyvalley | Kildare | moyvalley.com |
| Farnham Estate | Cavan | farnhamestate.ie |
| New Forest | Westmeath | newforestgolf.com |
| Hog's Head | Kerry | hogsheadgolfclub.com — pars and yardages published, **no stroke index**, so cardless |

### 5 · A judgement call

**Dun Laoghaire** is a 27-hole facility — Upper, Middle and Lower, each par 36 — and no
combined eighteen is canonically published. Upper plus Middle would combine to a clean
card, but that is an inference, and inventing which eighteen a club plays is worse than
leaving it out. **Recommendation: land it cardless with the note saying exactly this**,
and let a photograph of whatever card they hand out at the desk settle it.

### Not eligible

**Mulranny (Mayo)** — nine holes. The contract is eighteen or none and the card check
requires exactly eighteen, so there is nowhere for it to go. It stays out.

---

## How to deliver this

Ordinary `data/courses/<slug>.json` files, same contract as always —
`docs/course-import.md` has the shape and the worked example. Two things specific to
this pass:

- **A cardless course carries `"holesConfidence": "NONE"`, `"holes": []` and an empty
  `sources.holes`.** The `note` is required and is the only record of why; say what was
  looked at and what was not there.
- **A course with no ratings carries `"teesConfidence": "NONE"` and `"tees": []`**, and
  its `note` is required for the same reason. Most of this list is both at once, which
  is fine — the two absences are independent.

### The ratings, when they surface

A course rating and slope for any of the carded courses is worth having, and there are
three places they hide even when the scorecard shows only SSS: the club's own
WHS/CONGU **handicap-table PDFs**, the USGA **NCRDB** (`ncrdb.usga.org`, tee sets only
— never a stroke index), and **Golf Ireland**'s course rating pages.

**Which door they come through depends on whether the course has shipped yet:**

- **Not yet shipped** (everything on this list) — put the tees straight into its
  `data/courses/` file. `teesConfidence` becomes a real grade and `tees` carries the rows.
- **Already shipped** — that is Esker Hills and Luttrellstown Castle, and it is a
  `data/course-tees/<slug>.json` file instead. `data/courses/` refuses a slug that is
  already on the platform, and the refresh path refuses a slug arriving in the same
  run, so the two can never be confused.

A refresh upserts and never deletes, and it takes `par` from the **stored holes**
rather than the file — so ratings landing on Esker Hills get the full tee-par
cross-check against the card that is already there.
