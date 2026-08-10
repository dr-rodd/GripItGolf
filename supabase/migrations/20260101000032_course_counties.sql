-- ═══════════════════════════════════════════════════════════════
-- Migration 032 — every course files under a county
-- ═══════════════════════════════════════════════════════════════
--
-- The course picker's filter chips used to be parsed out of the free-text
-- location on every read — "Town, County, Country", county second from the
-- end — which worked until a location did not fit the shape: the platform
-- Old Tom Morris said 'Rosapenna Resort, Co. Donegal' and filed under a
-- chip called "Rosapenna Resort". The county is now its own column, asked
-- for by the add-course form, and the parse survives in lib/courseDirectory
-- only as a fallback for rows added before this ran.
--
-- Also here, two data corrections:
--   · The platform Old Tom Morris joins its resort — named and located
--     like the other two Rosapenna courses.
--   · Derry, not Londonderry — the county and any location that says it.
--
-- Replay-safe: the column add is IF NOT EXISTS, the backfill only fills
-- NULLs, and every correction is idempotent.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS county TEXT;

-- ── 1. Old Tom Morris is a Rosapenna course ────────────────────
--
-- Platform row only (trip_id IS NULL). The Donegal Masters archive keeps
-- its own frozen copies under the trip, named as that trip named them.

UPDATE courses SET
  name     = 'Rosapenna Golf Resort -- Old Tom Morris',
  location = 'Downings, Donegal, Ireland'
WHERE slug = 'old-tom-morris' AND trip_id IS NULL;

-- ── 2. Derry, not Londonderry ──────────────────────────────────

UPDATE courses SET location = replace(location, 'Londonderry', 'Derry')
WHERE location LIKE '%Londonderry%';

-- ── 3. The counties ────────────────────────────────────────────
--
-- The archive rows say 'Rosapenna Resort, Co. Donegal', which the generic
-- parse below would read backwards — named first, so the backfill finds
-- them already answered.

UPDATE courses SET county = 'Donegal'
WHERE county IS NULL AND location LIKE '%Rosapenna%';

-- Everything else: the second-to-last comma segment of the location — the
-- same rule the picker has always applied on read. Only fills NULLs, so a
-- county set by hand (or by the form, from now on) is never overwritten.
UPDATE courses c SET county = sub.county
FROM (
  SELECT id,
    btrim(CASE WHEN cardinality(p) >= 2 THEN p[cardinality(p) - 1] ELSE p[1] END) AS county
  FROM (
    SELECT id, string_to_array(location, ',') AS p
    FROM courses
    WHERE location IS NOT NULL AND btrim(location) <> ''
  ) t
) sub
WHERE c.id = sub.id AND c.county IS NULL AND sub.county <> '';

-- Tidy what the parse produced: 'Co. Donegal' and 'County Down' styles
-- lose the prefix, and any Londonderry that arrived by an older spelling
-- becomes Derry.
UPDATE courses SET county = regexp_replace(county, '^Co\.?\s+', '')
WHERE county ~ '^Co\.?\s';
UPDATE courses SET county = regexp_replace(county, '^County\s+', '')
WHERE county ~ '^County\s';
UPDATE courses SET county = 'Derry' WHERE county = 'Londonderry';

COMMENT ON COLUMN courses.county IS
  'The county the course files under in the picker — the only filter. Free text; lib/courseDirectory.ts canonicalises Derry.';
