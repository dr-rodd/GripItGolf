-- ============================================================
-- GripItGolf: The itinerary
--
-- A trip is not only its rounds. It is a drive to the coast, a
-- tee time, another drive, a guesthouse — in that order, on a
-- given day. This table holds that running order.
--
-- One row per thing that happens. `kind` says which of the three
-- it is and therefore which columns carry its detail; the rest
-- are NULL. A wide table rather than three narrow ones because
-- everything reads it the same way: give me this day, in order.
--
-- Ordering is (day_index, position). Positions are renumbered on
-- every write rather than being kept sparse — the lists are a
-- handful of items long, and a gapless sequence is far easier to
-- reason about than a float-midpoint scheme.
--
-- Golf items are the source of truth for `rounds`. Adding a golf
-- item to a day is how a round comes to exist.
-- ============================================================

CREATE TABLE IF NOT EXISTS itinerary_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

  -- Which day of the trip, counting from 0. Day-of rather than a
  -- date so a trip whose dates move does not lose its running order.
  day_index     SMALLINT    NOT NULL CHECK (day_index >= 0),
  -- Where in that day. Gapless, renumbered on write.
  position      SMALLINT    NOT NULL CHECK (position >= 0),

  kind          TEXT        NOT NULL CHECK (kind IN ('golf', 'stay', 'travel')),

  -- ── golf ──
  course_id     UUID        REFERENCES courses(id) ON DELETE SET NULL,
  -- First group off. Local clock time; a trip does not cross zones.
  tee_time      TIME,
  -- How many groups. One tee time is the common case.
  tee_count     SMALLINT    CHECK (tee_count IS NULL OR tee_count BETWEEN 1 AND 12),

  -- ── stay ──
  -- Free text on purpose. An organiser knows what "the guesthouse
  -- in Ballina" means; a structured address would be a form to fill
  -- in for no gain.
  stay_name     TEXT,

  -- ── travel ──
  travel_mode   TEXT        CHECK (travel_mode IS NULL OR travel_mode IN ('car', 'flight', 'train')),
  from_place    TEXT,
  to_place      TEXT,
  duration_mins SMALLINT    CHECK (duration_mins IS NULL OR duration_mins BETWEEN 0 AND 2880),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One thing per slot in a day
  CONSTRAINT uq_itinerary_slot UNIQUE (trip_id, day_index, position)
    DEFERRABLE INITIALLY DEFERRED,

  -- Each kind carries its own detail and none of anyone else's. Without
  -- this a half-edited row can claim to be a drive with a tee time.
  CONSTRAINT ck_itinerary_shape CHECK (
    CASE kind
      WHEN 'golf'   THEN stay_name IS NULL AND travel_mode IS NULL
                     AND from_place IS NULL AND to_place IS NULL AND duration_mins IS NULL
      WHEN 'stay'   THEN course_id IS NULL AND tee_time IS NULL AND tee_count IS NULL
                     AND travel_mode IS NULL AND from_place IS NULL AND to_place IS NULL
                     AND duration_mins IS NULL
      WHEN 'travel' THEN course_id IS NULL AND tee_time IS NULL AND tee_count IS NULL
                     AND stay_name IS NULL
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_itinerary_trip
  ON itinerary_items(trip_id, day_index, position);

-- Golf items become rounds, so a round needs to know which item made it.
-- Nullable: rounds created before the itinerary existed have no item.
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS itinerary_item_id UUID
    REFERENCES itinerary_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rounds_itinerary
  ON rounds(itinerary_item_id);

COMMENT ON TABLE itinerary_items IS
  'The running order of a trip: golf, stays and journeys, per day. Golf items are what create rounds.';
