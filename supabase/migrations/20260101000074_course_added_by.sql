-- 074 — Which courses the system added and which a user added (Ross, 11 Nov 2026).
--
-- PASTE THIS BEFORE THE DEPLOY, or after: either order is safe. The add-course
-- route names the column only once it exists (it retries without it before
-- this is in), and nothing reads it yet.
--
-- `courses.added_by` is 'system' (a migration put it there — the platform's
-- seeded and researched courses) or 'user' (somebody added it from a course
-- picker, /api/courses). Not who: Ross decided no person is logged. A user's
-- course is live for everyone at once, as before; a future review can confirm
-- it (docs/pending-concepts.md, "Checking courses and scorecards that players
-- add").
--
-- Every course already here is backfilled: the platform courses named in a
-- migration (004–042, the slugs listed below, 89 of them) and every trip's own
-- course are 'system'; any other platform course was added from a picker.
-- Phones still cannot write `courses` (migration 040) — the server sets it.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS added_by text NOT NULL DEFAULT 'system';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_courses_added_by'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT ck_courses_added_by CHECK (added_by IN ('system', 'user'));
  END IF;
END $$;

UPDATE courses SET added_by = 'user'
WHERE trip_id IS NULL
  AND added_by = 'system'
  AND slug NOT IN (
    'adare-manor'
    , 'ardglass'
    , 'arklow'
    , 'ballybunion-cashen'
    , 'ballybunion-old'
    , 'ballyliffin-glashedy-links'
    , 'ballyliffin-old'
    , 'belvoir-park'
    , 'bunclody'
    , 'carlow-deerpark'
    , 'carne-hackett'
    , 'carne-wild-atlantic-dunes'
    , 'carton-house-montgomerie'
    , 'carton-house-omeara'
    , 'castlerock-mussenden'
    , 'clandeboye-dufferin'
    , 'concra-wood'
    , 'connemara-championship'
    , 'corballis'
    , 'cork-golf-club'
    , 'county-louth'
    , 'county-sligo-colt-championship'
    , 'dingle-ceann-sibeal'
    , 'donegal'
    , 'dooks'
    , 'dromoland-castle'
    , 'druids-glen'
    , 'dun-laoghaire'
    , 'enniscrone-dunes'
    , 'esker-hills'
    , 'farnham-estate'
    , 'fota-island-deerpark'
    , 'galgorm-castle'
    , 'galway-bay'
    , 'galway-golf-club'
    , 'headfort-new'
    , 'heritage-killenard'
    , 'hermitage'
    , 'hogs-head'
    , 'k-club-palmer-north'
    , 'k-club-palmer-south'
    , 'kilkenny'
    , 'killarney-killeen'
    , 'killarney-mahonys-point'
    , 'kirkistown-castle'
    , 'lahinch-old'
    , 'laytown-bettystown'
    , 'lough-erne-faldo'
    , 'luttrellstown-castle'
    , 'malone'
    , 'mount-juliet'
    , 'mount-wolseley'
    , 'moyvalley'
    , 'mullingar'
    , 'narin-portnoo'
    , 'new-forest'
    , 'north-west'
    , 'old-head'
    , 'old-tom-morris'
    , 'palmerstown-house'
    , 'portmarnock-championship'
    , 'portmarnock-jameson'
    , 'portsalon'
    , 'portstewart-strand'
    , 'portumna'
    , 'powerscourt-east'
    , 'powerscourt-west'
    , 'rathsallagh'
    , 'rosapenna-sandy-hills'
    , 'rosapenna-st-patricks'
    , 'rosslare-old'
    , 'royal-belfast'
    , 'royal-county-down-annesley'
    , 'royal-county-down-championship'
    , 'royal-dublin'
    , 'royal-portrush-dunluce'
    , 'royal-portrush-valley'
    , 'seapoint'
    , 'slieve-russell'
    , 'strandhill'
    , 'the-castle'
    , 'the-heath'
    , 'the-island'
    , 'tralee'
    , 'tramore'
    , 'trump-international-doonbeg'
    , 'tulfarris'
    , 'tullamore'
    , 'waterville'
  );

-- ─── Did it land? ─────────────────────────────────────────────
--
-- How many of each — 'system' should be at least 89 plus the trips' own:
--
-- SELECT added_by, count(*) FROM courses GROUP BY added_by;
--
-- And the user-added ones by name, newest first:
--
-- SELECT name, county, created_at FROM courses WHERE added_by = 'user' ORDER BY created_at DESC;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time; the add-course route goes back to leaving it out.
--
-- ALTER TABLE courses DROP COLUMN IF EXISTS added_by;
