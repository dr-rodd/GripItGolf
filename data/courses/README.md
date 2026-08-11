One JSON file per platform course, named `<slug>.json`.

The contract and the research rules are in `docs/course-import.md`.

Nothing here reaches the database until `npm run courses:migration` turns it into a
migration and somebody applies it. `npm test` refuses anything that would corrupt a card.
