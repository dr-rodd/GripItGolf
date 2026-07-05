ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS group_style TEXT NOT NULL DEFAULT 'individual'
    CHECK (group_style IN ('individual', 'teams')),
  ADD COLUMN IF NOT EXISTS competition_style TEXT NOT NULL DEFAULT 'league'
    CHECK (competition_style IN ('league', 'matchplay'));
