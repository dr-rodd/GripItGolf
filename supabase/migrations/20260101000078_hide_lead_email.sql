-- ============================================================
-- 078 — row-level security, stage 5: the lead player's email, hidden
-- ============================================================
--
-- `trips.lead_email` was the one secret any member of an event could still
-- read (the PIN hashes went with 071's column grants). It moves to
-- `trip_private`, a table no phone can reach — RLS on, no policy, granted to
-- the server alone — and the old column is emptied and closed (D62; Ross,
-- 11 Nov 2026).
--
-- Read and written only through lib/leadEmail.ts on the service role:
-- creation, the confirmation email, Forgot PIN and the admin trips list.
-- **Paste after the stage 5 deploy** — that code reads the new table first
-- and the old column as a fallback, and writes the old column only while
-- this table does not exist, so either order works; after is tidier.

CREATE TABLE IF NOT EXISTS trip_private (
  trip_id     uuid        PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  lead_email  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trip_private ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_private TO service_role;

-- Every address across, then off the row every member reads.
INSERT INTO trip_private (trip_id, lead_email)
SELECT id, lead_email FROM public.trips WHERE lead_email IS NOT NULL AND lead_email <> ''
ON CONFLICT (trip_id) DO UPDATE SET lead_email = EXCLUDED.lead_email, updated_at = now();

UPDATE public.trips SET lead_email = NULL WHERE lead_email IS NOT NULL;

-- 071 granted phones `trips` column by column; this takes the address off.
REVOKE SELECT (lead_email), UPDATE (lead_email) ON public.trips FROM authenticated;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- (n, 0, false): addresses kept apart, none left on trips, closed to phones:
--
-- SELECT (SELECT count(*) FROM trip_private WHERE lead_email IS NOT NULL) AS kept,
--        (SELECT count(*) FROM trips WHERE lead_email IS NOT NULL)        AS left_on_trips,
--        has_column_privilege('authenticated', 'public.trips', 'lead_email', 'SELECT') AS phones_read;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Puts the addresses back on trips (the code reads either):
--
-- UPDATE public.trips t SET lead_email = p.lead_email FROM trip_private p WHERE p.trip_id = t.id;
-- GRANT SELECT (lead_email), UPDATE (lead_email) ON public.trips TO authenticated;
-- DROP TABLE trip_private;
