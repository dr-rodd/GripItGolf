ALTER TABLE players
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'M'
  CHECK (gender IN ('M', 'F'));

-- Mums are female; dads and sons default to male
UPDATE players SET gender = 'F' WHERE role = 'mum';
