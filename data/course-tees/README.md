Better tee ratings for courses **already on the platform**, one JSON file per course,
named `<slug>.json`.

New courses go in `data/courses/` instead — a slug that has not shipped is refused here,
and a slug that has is refused there. The contract is in `docs/course-import.md`.

The generated migration upserts: it never deletes a tee, and `par` is derived from the
stored holes rather than from the file.
