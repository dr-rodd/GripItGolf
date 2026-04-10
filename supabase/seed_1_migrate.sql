-- ============================================================
-- DONEGAL MASTERS - PART 1: SCHEMA ADJUSTMENTS
-- Run this first, before seed_2_data.sql
-- ============================================================

-- Allow players to exist without a team assignment
ALTER TABLE players ALTER COLUMN team_id DROP NOT NULL;

-- Add 'son' to the player_role enum
ALTER TYPE player_role ADD VALUE 'son';
