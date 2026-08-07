# Testing and data

## Test suites

Every suite is a plain `tsx` script under `scripts/`, run by `npm test`. No framework: they print named checks and set a non-zero exit code. Logic lives in pure `lib/*.ts` modules so it can be driven without a database, and components are rendered with `renderToStaticMarkup`.

| Suite | Covers |
|---|---|
| `test:formats` | The format model and all three generations of stored settings |
| `test:leaderboards` | The leaderboard model — slots, team sheets, storage round-trip |
| `test:handicap` | Shots received per hole, plus handicaps included, and that the Postgres trigger agrees with the app on every one |
| `test:handicap-allowance` | Playing off a percentage of the course handicap — the rounding, the recommended figures, storage, the cycle a scorecard walks, and every board scored both at full and reduced |
| `test:setup-flow` | Team size limits and pairs blocking, read off the boards |
| `test:weather` | The forecast module and its route: parsing, the hour a tee time falls in, the arrow's 180°, the symbol grouping over every published MET code, the coordinates shipped in migration 026, and that the route never answers with an empty body |
| `test:team-sets` | Team sheets in isolation — naming, membership, the finalise gate per sheet |
| `test:matchplay` | Bracket generation and seeding |
| `test:entrants` | Player/pairing naming, and the real column-mapping functions |
| `test:custom-points` | The prize table and discard rules |
| `test:bracket-layout` | Column geometry and connectors |
| `test:bracket-render` | The bracket component at every size, singles and pairs |
| `test:progress` | Recording and correcting winners, and the cascade |
| `test:itinerary` | The running order — golf, stay and travel items, the rounds they generate, and diffing an edit back into writes |
| `test:trip-form` | Trip creation |
| `test:leaderboard` | Every board, live vs finalised, score ownership, per-board rules, two team boards on two sheets, the per-player live dot, the over/under colour rule, and old trips read through the shim |
| `test:recognition` | The per-trip cookie, the personal summary, the greeting |
| `test:admin` | Optional email, derived trip status, admin session signing |
| `test:support` | The donation link, and that it vanishes when unconfigured |
| `test:live-scores` | Reconciling a part-entered card with what was saved, so a partial one cannot erase a full one |
| `test:scorecard-void` | Voiding a card erases its scores from both tables, in an order that cannot silently no-op, and no screen does it by hand |
| `test:scorecard` | Every score shape, the nett/no-return arithmetic, and that a card survives being left and reopened |
| `test:branding` | The green dot, the wordmark, back controls, contrast, type size, and the footer/tab-bar carrier list |

Order above follows `npm test`'s own chain in `package.json`, which is worth keeping in step: it is the fastest way to tell whether a new suite was wired in or just left as a standalone script.

**Mutation testing is the standard for logic, not for everything.** Break the code deliberately, confirm a test fails, restore. It has repeatedly found suites that passed while testing nothing — most recently a pair-size assertion written against the constant it was meant to pin, so changing `PAIR_SIZE` to 3 left every check green.

Worth it for scoring, money, state and anything that decides what a number says. **Not worth it for a small change** — a colour, a label, a spacing tweak, a class swap. Run `npm test`, and move on.

## How much checking a change is worth

`npm test`, a typecheck and a build are the floor — always, whatever the change. Above that, scale the effort to the risk:

| Change | What it gets |
|---|---|
| A colour, a label, spacing, a class swap | The floor. Ship it |
| A new component or a restyle | The floor. Render it only if the layout is genuinely new |
| Scoring, handicaps, money, state, a schema | Everything: a test that pins it, mutation-tested, and rendered or exercised if it has a surface |

**Rendering in a browser is for layouts that can fail silently** — a scroll container, a sticky offset, a fixed column, something that has to fit a phone. Not for a tint or a border. **Mutation testing is for logic that decides a number**, not for a class name.

Bias to shipping on small things. A screenshot of a border costs more than it finds.

## Data insertion order

1. `trips`
2. `teams`
3. `players`
4. `courses`
5. `holes`
6. `rounds`
7. `round_handicaps`
8. `scores`

## Background jobs

Abandoned scorecard cleanup: Vercel cron route. Requires `CRON_SECRET`. Implemented as Supabase SQL migration + Next.js API route.
