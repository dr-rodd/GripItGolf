-- ============================================================
-- Migration 033 — a par 6 is a par 6
--
-- OPTIONAL. Nothing depends on this. Apply it to close a divergence, or
-- leave it and everything carries on as it does today.
--
-- `holes.par` has been CHECKed `between 3 and 5` since migration 000, but
-- every application-layer validator allows 3 to 6 — `validateCard`,
-- `validateNewHoleRows` and `HOLE_COLUMN_RANGE` in lib/cardCheck.ts, and the
-- extraction prompt itself. So the two disagree, and the application is the
-- more permissive of the pair.
--
-- That gap is not theoretical. A par-6 hole exists on real courses, and
-- today a photograph of one:
--
--   · passes validateCard, so the card is offered as trustworthy;
--   · passes validateNewHoleRows, so the apply route accepts it;
--   · is then rejected by Postgres, and `handleCreate` fails on the insert
--     after telling the person their card looked fine.
--
-- The bulk import routes around it — `DB_HOLE_PAR` in lib/courseImport.ts is
-- the only place in the codebase that knows the database is stricter, and it
-- refuses a par 6 before a migration can be written. That keeps a generated
-- migration safe, but it does not help the photo path.
--
-- Widening the CHECK makes the database agree with the four places that
-- already say 3 to 6. After applying this, `DB_HOLE_PAR` becomes [3, 6] and
-- the special case in lib/courseImport.ts can go.
--
-- Replay-safe: the old constraint is found and dropped by what it does
-- rather than by what it is called, the new one is dropped IF EXISTS before
-- being added, and the new range is strictly wider, so no existing row can
-- fail it.
-- ============================================================

-- The 3-to-5 CHECK was written inline in migration 000, so Postgres named it,
-- and the name is not guaranteed. Dropping a name that does not exist would
-- be a silent no-op and the old rule would survive the ADD below — so it is
-- found by its definition instead.
DO $$
DECLARE
  victim text;
BEGIN
  FOR victim IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'holes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%par%'
      AND pg_get_constraintdef(oid) LIKE '%<= 5%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%par_ladies%'
  LOOP
    EXECUTE format('ALTER TABLE holes DROP CONSTRAINT %I', victim);
  END LOOP;
END $$;

ALTER TABLE holes DROP CONSTRAINT IF EXISTS holes_par_check;

ALTER TABLE holes ADD CONSTRAINT holes_par_check CHECK (par BETWEEN 3 AND 6);

-- The ladies column has never carried a CHECK at all, which is its own small
-- gap: `validateNewHoleRows` polices it, and nothing else does. Same range as
-- the men's, so the two columns cannot drift apart.
ALTER TABLE holes DROP CONSTRAINT IF EXISTS holes_par_ladies_check;

ALTER TABLE holes ADD CONSTRAINT holes_par_ladies_check
  CHECK (par_ladies IS NULL OR par_ladies BETWEEN 3 AND 6);
