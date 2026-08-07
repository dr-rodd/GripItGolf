-- ============================================================
-- GripItGolf: Activities on the itinerary
--
-- A trip is not only golf, beds and journeys. It is the table
-- booked for eight at seven, the boat trip, the walk out to the
-- lighthouse. Those had nowhere to go: an organiser either left
-- them off the running order entirely or wrote "dinner" into a
-- stay, which then claimed a bed for the night.
--
-- A fourth `kind` rather than a table of its own, for the same
-- reason the other three share one: everything reads this the
-- same way — give me this day, in order.
--
-- Two columns, and no more. A name and, optionally, a time. An
-- activity has no course, no bed and no destination, and giving
-- it a duration or a place would be inventing a form nobody
-- asked to fill in.
--
-- Replayable, like every migration here: the columns are added
-- IF NOT EXISTS and the two constraints are dropped before they
-- are recreated. Nothing is backfilled — there are no activities
-- to backfill, which is the whole point of adding them.
-- ============================================================

ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS activity_name TEXT,
  -- Local clock time, like `tee_time`. A trip does not cross zones.
  -- Nullable on purpose: "pub quiz" with no time is a real plan, and
  -- refusing it would push it back off the itinerary again.
  ADD COLUMN IF NOT EXISTS activity_time TIME;

-- ── The kind, widened ──
--
-- A CHECK constraint cannot be altered, only replaced. Dropping first
-- rather than adding a second: two overlapping constraints on the same
-- column is how a row comes to be refused for a reason neither of them
-- appears to give.
ALTER TABLE itinerary_items
  DROP CONSTRAINT IF EXISTS itinerary_items_kind_check;

ALTER TABLE itinerary_items
  ADD CONSTRAINT itinerary_items_kind_check
    CHECK (kind IN ('golf', 'stay', 'travel', 'activity'));

-- ── Each kind carries its own detail, and none of anyone else's ──
--
-- The original constraint had three branches. A CASE with no ELSE
-- returns NULL for an unmatched value, and a CHECK passes on NULL — so
-- left alone, an 'activity' row would have been exempt from the shape
-- rule entirely and could have claimed a course and a tee time. The
-- kind CHECK above is what makes that unreachable today; this is what
-- makes it wrong rather than merely unreachable.
--
-- The three existing branches each gain the two new columns, so a
-- half-edited row cannot claim to be a drive with a dinner reservation
-- attached.
ALTER TABLE itinerary_items
  DROP CONSTRAINT IF EXISTS ck_itinerary_shape;

ALTER TABLE itinerary_items
  ADD CONSTRAINT ck_itinerary_shape CHECK (
    CASE kind
      WHEN 'golf'     THEN stay_name IS NULL AND travel_mode IS NULL
                       AND from_place IS NULL AND to_place IS NULL AND duration_mins IS NULL
                       AND activity_name IS NULL AND activity_time IS NULL
      WHEN 'stay'     THEN course_id IS NULL AND tee_time IS NULL AND tee_count IS NULL
                       AND travel_mode IS NULL AND from_place IS NULL AND to_place IS NULL
                       AND duration_mins IS NULL
                       AND activity_name IS NULL AND activity_time IS NULL
      WHEN 'travel'   THEN course_id IS NULL AND tee_time IS NULL AND tee_count IS NULL
                       AND stay_name IS NULL
                       AND activity_name IS NULL AND activity_time IS NULL
      -- An activity is a name and a time. `activity_name` is NOT NULL
      -- here rather than a column-level constraint: the column is empty
      -- for every other kind, so the requirement belongs to the kind.
      WHEN 'activity' THEN course_id IS NULL AND tee_time IS NULL AND tee_count IS NULL
                       AND stay_name IS NULL AND travel_mode IS NULL
                       AND from_place IS NULL AND to_place IS NULL AND duration_mins IS NULL
                       AND activity_name IS NOT NULL
    END
  );

COMMENT ON COLUMN itinerary_items.activity_name IS
  'What the activity is — free text. "Dinner at Sandbanks", "Boat trip". Required for kind = activity, empty for every other kind.';
COMMENT ON COLUMN itinerary_items.activity_time IS
  'When it starts, local clock time. Optional — a plan without a time is still a plan.';

COMMENT ON TABLE itinerary_items IS
  'The running order of a trip: golf, stays, journeys and activities, per day. Golf items are what create rounds.';
