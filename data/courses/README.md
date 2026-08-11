One JSON file per platform course, named `<slug>.json`. These are courses that are **not
on the platform yet** — a slug that has already shipped is refused here.

To improve the tee ratings on a course that *is* here, use `data/course-tees/` instead.

The contract and the research rules are in `docs/course-import.md`. Start with
`npm run courses:migration -- --list` to see what is already on the platform.

Nothing here reaches the database until `npm run courses:migration` turns it into a
migration and somebody applies it. `npm test` refuses anything that would corrupt a card.
