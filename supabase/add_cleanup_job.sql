-- ============================================================
-- STALE LIVE DATA CLEANUP FUNCTION
-- Called by the Next.js API route /api/cleanup (see app/api/cleanup/route.ts).
-- If pg_cron is ever enabled, uncomment the cron.schedule block below
-- to run it directly from the database instead.
--
-- Rules:
--   Closes active live_rounds where ALL of the following are true:
--     1. status = 'active'  (finalised rounds are never touched)
--     2. activated_at is older than 2 hours
--     3. Zero hole scores have been submitted by the players locked
--        into that round (checked via live_player_locks + live_scores)
--
--   In-progress rounds (any scores submitted) are never touched,
--   even if the last submission was hours ago.
--   Live_scores rows are not deleted — only empty rounds are closed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_live_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Close active live_rounds that are older than 2 hours and have
  -- zero scores submitted by the players locked into the round.
  -- Rounds with any scores (even 1 hole) are left untouched.
  -- Finalised rounds are excluded by the status = 'active' filter.
  UPDATE public.live_rounds
  SET    status    = 'closed',
         closed_at = now()
  WHERE  status       = 'active'
    AND  activated_at < now() - interval '2 hours'
    AND  NOT EXISTS (
           -- Any score from a player locked into this specific live_round
           SELECT 1
           FROM   public.live_player_locks lpl
           JOIN   public.live_scores ls
                  ON  ls.player_id = lpl.player_id
                  AND ls.round_id  = live_rounds.round_id
           WHERE  lpl.live_round_id = live_rounds.id
         );
END;
$$;

-- Uncomment if pg_cron is enabled (Database > Extensions in Supabase dashboard):
-- SELECT cron.schedule(
--   'cleanup-stale-live-data',
--   '0 * * * *',
--   'SELECT public.cleanup_stale_live_data()'
-- );
