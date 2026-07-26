-- ============================================================
-- GripItGolf: Trip lifecycle (draft → live)
--
-- A trip starts in 'draft' (setup mode): details, teams, players
-- and format are all editable. Finalising sets it 'live' and
-- unlocks scoring. A live trip can be unlocked back to 'draft'
-- for further editing — scores are never touched by the switch.
--
-- edit_permission controls who may edit during draft:
--   'everyone' — any player in the trip
--   'owner'    — only the trip creator (device-based, no auth yet)
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS setup_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (setup_status IN ('draft', 'live')),
  ADD COLUMN IF NOT EXISTS edit_permission TEXT NOT NULL DEFAULT 'everyone'
    CHECK (edit_permission IN ('owner', 'everyone')),
  ADD COLUMN IF NOT EXISTS finalised_at TIMESTAMPTZ;

-- Trips created before this feature existed are already in play:
-- mark them live so nothing changes for them.
UPDATE trips
SET setup_status = 'live',
    finalised_at = COALESCE(finalised_at, now())
WHERE setup_status = 'draft';
