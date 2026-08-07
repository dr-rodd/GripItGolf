-- ============================================================
-- COURSE WEATHER
--
-- Coordinates for the platform courses, and somewhere to keep a forecast
-- so MET Norway is asked once an hour rather than once a reader.
--
-- Replay-safe throughout: every ALTER is IF NOT EXISTS, every UPDATE is
-- keyed on a slug that already exists, and nothing here deletes or
-- overwrites anything a person could have edited. Safe to run twice.
-- ============================================================


-- ============================================================
-- 1. WHERE A COURSE IS
-- ============================================================
--
-- `courses.location` is a town — 'Kinsale, Cork, Ireland' — and a town is
-- the wrong place to read the wind for a links course. Old Head is eleven
-- kilometres out on a headland; Tralee is at Barrow, eight from Ardfert;
-- Carne is four from Belmullet. Every one of those gaps runs in the same
-- direction, from exposed towards sheltered, which makes a town-centre
-- forecast worse than none: confidently wrong, always calm, and with
-- nothing on screen to say which reading was the bad one.
--
-- So these are the courses, looked up by name, not the towns they are
-- posted from.
--
-- numeric(7,4) is load-bearing rather than tidy. MET REFUSES a request
-- carrying more than four decimal places, so this makes the database
-- physically unable to hold a fifth — the rule lives here as well as in
-- `truncCoord`, where nobody can refactor it away.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS latitude    numeric(7,4);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS longitude   numeric(7,4);

-- Two jobs, deliberately. Set with `latitude` still null means WE LOOKED
-- AND FAILED, which is a different state from never having looked, and the
-- screen says the same thing for both while the row does not.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

-- Ireland and Britain, with room to spare. A transposed pair or a stray
-- minus lands outside this and is refused at the door rather than sending
-- somebody the weather for the South Atlantic.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_coordinates_sane'
  ) THEN
    ALTER TABLE courses ADD CONSTRAINT courses_coordinates_sane CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR (latitude BETWEEN 49 AND 61 AND longitude BETWEEN -11 AND 2)
    );
  END IF;
END $$;


-- ── The 26 platform courses ─────────────────────────────────
--
-- Every line carries a maps link so it can be checked in one tap. The five
-- worth checking hardest are marked EXPOSED: those are the ones where the
-- stored town is kilometres inland of the course.
--
-- Truncated to four places, never rounded — rounding 51.99999 gives
-- 52.0000, which is a fifth digit's worth of movement in the value that was
-- being protected.

-- Adare, Limerick. Parkland on the estate, inland — the one course here
-- where a kilometre either way changes little.
UPDATE courses SET latitude = 52.5710, longitude = -8.7827, geocoded_at = now()
  WHERE slug = 'adare-manor' AND trip_id IS NULL;                    -- https://www.google.com/maps/?q=52.5710,-8.7827

UPDATE courses SET latitude = 52.5027, longitude = -9.6733, geocoded_at = now()
  WHERE slug = 'ballybunion-old' AND trip_id IS NULL;                -- https://www.google.com/maps/?q=52.5027,-9.6733

-- Glashedy and the Old Links share a clubhouse and one MET grid cell, so
-- identical numbers are correct here rather than lazy.
UPDATE courses SET latitude = 55.2924, longitude = -7.3731, geocoded_at = now()
  WHERE slug IN ('ballyliffin-glashedy-links', 'ballyliffin-old')
    AND trip_id IS NULL;                                             -- https://www.google.com/maps/?q=55.2924,-7.3731

-- EXPOSED — stored as 'Belmullet', the links is ~4km southwest in the dunes.
UPDATE courses SET latitude = 54.2237, longitude = -10.0338, geocoded_at = now()
  WHERE slug = 'carne-wild-atlantic-dunes' AND trip_id IS NULL;      -- https://www.google.com/maps/?q=54.2237,-10.0338

-- EXPOSED — stored as 'Drogheda', Baltray is ~7km northeast on the estuary.
UPDATE courses SET latitude = 53.7380, longitude = -6.2631, geocoded_at = now()
  WHERE slug = 'county-louth' AND trip_id IS NULL;                   -- https://www.google.com/maps/?q=53.7380,-6.2631

UPDATE courses SET latitude = 54.3047, longitude = -8.5640, geocoded_at = now()
  WHERE slug = 'county-sligo-colt-championship' AND trip_id IS NULL; -- https://www.google.com/maps/?q=54.3047,-8.5640

UPDATE courses SET latitude = 54.6130, longitude = -8.1597, geocoded_at = now()
  WHERE slug = 'donegal' AND trip_id IS NULL;                        -- https://www.google.com/maps/?q=54.6130,-8.1597

UPDATE courses SET latitude = 54.2136, longitude = -9.0908, geocoded_at = now()
  WHERE slug = 'enniscrone-dunes' AND trip_id IS NULL;               -- https://www.google.com/maps/?q=54.2136,-9.0908

UPDATE courses SET latitude = 52.9388, longitude = -9.3432, geocoded_at = now()
  WHERE slug = 'lahinch-old' AND trip_id IS NULL;                    -- https://www.google.com/maps/?q=52.9388,-9.3432

UPDATE courses SET latitude = 54.8386, longitude = -8.4467, geocoded_at = now()
  WHERE slug = 'narin-portnoo' AND trip_id IS NULL;                  -- https://www.google.com/maps/?q=54.8386,-8.4467

-- EXPOSED — stored as 'Kinsale'; the course is ~11km south, on a headland
-- two kilometres into the Atlantic. The single worst town to have used.
UPDATE courses SET latitude = 51.6047, longitude = -8.5336, geocoded_at = now()
  WHERE slug = 'old-head' AND trip_id IS NULL;                       -- https://www.google.com/maps/?q=51.6047,-8.5336

UPDATE courses SET latitude = 53.4070, longitude = -6.1240, geocoded_at = now()
  WHERE slug = 'portmarnock-championship' AND trip_id IS NULL;       -- https://www.google.com/maps/?q=53.4070,-6.1240

-- EXPOSED — stored as 'Fanad', which is an entire peninsula.
UPDATE courses SET latitude = 55.2082, longitude = -7.6203, geocoded_at = now()
  WHERE slug = 'portsalon' AND trip_id IS NULL;                      -- https://www.google.com/maps/?q=55.2082,-7.6203

UPDATE courses SET latitude = 55.1670, longitude = -6.7261, geocoded_at = now()
  WHERE slug = 'portstewart-strand' AND trip_id IS NULL;             -- https://www.google.com/maps/?q=55.1670,-6.7261

-- Sandy Hills, St Patricks and Old Tom Morris are one resort at Downings.
UPDATE courses SET latitude = 55.1970, longitude = -7.8124, geocoded_at = now()
  WHERE slug IN ('rosapenna-sandy-hills', 'rosapenna-st-patricks', 'old-tom-morris')
    AND trip_id IS NULL;                                             -- https://www.google.com/maps/?q=55.1970,-7.8124

UPDATE courses SET latitude = 54.2158, longitude = -5.8864, geocoded_at = now()
  WHERE slug = 'royal-county-down-championship' AND trip_id IS NULL; -- https://www.google.com/maps/?q=54.2158,-5.8864

UPDATE courses SET latitude = 53.3566, longitude = -6.1705, geocoded_at = now()
  WHERE slug = 'royal-dublin' AND trip_id IS NULL;                   -- https://www.google.com/maps/?q=53.3566,-6.1705

-- Dunluce and the Valley share a site.
UPDATE courses SET latitude = 55.2000, longitude = -6.6350, geocoded_at = now()
  WHERE slug IN ('royal-portrush-dunluce', 'royal-portrush-valley')
    AND trip_id IS NULL;                                             -- https://www.google.com/maps/?q=55.2000,-6.6350

UPDATE courses SET latitude = 53.4717, longitude = -6.1391, geocoded_at = now()
  WHERE slug = 'the-island' AND trip_id IS NULL;                     -- https://www.google.com/maps/?q=53.4717,-6.1391

-- EXPOSED — stored as 'Ardfert'; the course is at Barrow, ~8km northwest,
-- on the sea.
UPDATE courses SET latitude = 52.3013, longitude = -9.8578, geocoded_at = now()
  WHERE slug = 'tralee' AND trip_id IS NULL;                         -- https://www.google.com/maps/?q=52.3013,-9.8578

UPDATE courses SET latitude = 52.7460, longitude = -9.5025, geocoded_at = now()
  WHERE slug = 'trump-international-doonbeg' AND trip_id IS NULL;    -- https://www.google.com/maps/?q=52.7460,-9.5025

UPDATE courses SET latitude = 51.8391, longitude = -10.1953, geocoded_at = now()
  WHERE slug = 'waterville' AND trip_id IS NULL;                     -- https://www.google.com/maps/?q=51.8391,-10.1953


-- ============================================================
-- 2. THE FORECAST, KEPT
-- ============================================================
--
-- MET's terms require caching — respecting the Expires header, and not
-- asking again faster than the data changes. Twelve players opening the
-- hub before a round must be one request upstream, not twelve.
--
-- One row per course, and it carries the coordinates it was fetched for so
-- that correcting a wrong latitude invalidates the cache by mismatch. No
-- manual purge, no stale forecast for a place the course is not.
--
-- `hours` holds the DISTILLED timeseries — `parseForecast`'s output, not
-- MET's body. Ten days of the `complete` product is a large payload; the
-- distilled form is a few hundred rows of seven fields, and it means the
-- parse happens once per refresh rather than once per reader. Re-deriving
-- it differently later is just a cache miss.

CREATE TABLE IF NOT EXISTS weather_cache (
  course_id     uuid PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  latitude      numeric(7,4) NOT NULL,
  longitude     numeric(7,4) NOT NULL,
  hours         jsonb        NOT NULL,
  fetched_at    timestamptz  NOT NULL DEFAULT now(),
  -- From MET's own Expires header. Null means "we could not read one", and
  -- `isFresh` treats that as stale rather than inventing a lifetime.
  expires_at    timestamptz,
  -- For If-Modified-Since, so an unchanged forecast costs a 304 rather
  -- than a body.
  last_modified text,
  -- When MET last refused or failed, and why. Drives the backoff, and is
  -- the row somebody reads when the block has gone quiet.
  failed_at     timestamptz,
  failure       text
);

-- Server-only. The route reads and writes it with the service role; the
-- anon client has no business here, and RLS with no policies is how this
-- schema says so.
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
