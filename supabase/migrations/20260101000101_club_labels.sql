-- 101 — a club's labels (D288, Ross, 22 Nov 2026): a named colour of who
-- belongs — groups of memberships, gender, an age band, a handicap band —
-- made in the Clubhouse (Events → Labels). On a competition a label decides
-- who may enter; on anything its colour travels with it through the site.
-- lib/clubLabels.ts is the only copy of the rules.
--
-- PASTE AFTER THE DEPLOY. The code reads every part fail-soft: before it the
-- Labels module says "not set up yet", every event wears its type's built-in
-- colour, and a competition's entry is as it always was.
--
-- (1) club_labels — one row a label: its name, colour, groups (jsonb), and
--     for a type's default label the type it colours (one a type a club).
--     Server only.
-- (2) club_events.label_id — the label a club event carries; none is its
--     type's default. A competition keeps its label inside its entry rules
--     (trip_private.entry_rules → label, 094), so needs no column; a preset
--     the same (club_presets' entry). Deleting a label sets this to null.

-- (1)
CREATE TABLE IF NOT EXISTS club_labels (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  colour      text        NOT NULL CHECK (colour ~ '^#[0-9A-F]{6}$'),
  groups      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  event_type  text        NULL CHECK (event_type IS NULL OR event_type IN ('COMP', 'GOLF', 'SOCIAL', 'BUSINESS', 'SPORT', 'COURSE', 'MISC')),
  position    smallint    NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_labels_name ON club_labels(club_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_labels_type ON club_labels(club_id, event_type) WHERE event_type IS NOT NULL;
ALTER TABLE club_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_labels FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_labels TO service_role;

-- (2)
ALTER TABLE club_events ADD COLUMN IF NOT EXISTS label_id uuid NULL REFERENCES club_labels(id) ON DELETE SET NULL;

-- Did it land?
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'club_labels') AS labels,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_events' AND column_name = 'label_id') AS event_label;

-- UNDO (every event back to its type's built-in colour; competitions keep the
-- label copy in their entry rules until next saved — strip it with
-- UPDATE trip_private SET entry_rules = entry_rules - 'label' WHERE entry_rules ? 'label';):
--   ALTER TABLE club_events DROP COLUMN IF EXISTS label_id;
--   DROP TABLE IF EXISTS club_labels;
