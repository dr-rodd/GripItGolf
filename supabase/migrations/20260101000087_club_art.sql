-- 087 — a club's crest and art (stage (e1); D118, D123–D126, D155, D156;
-- Ross, 15 Nov 2026).
--
-- PASTE THIS BEFORE THE DEPLOY. Nothing changes by pasting it: no club has
-- art until one of its admins uploads some, and every page reads the new
-- columns fail-soft. Nobody ever needs an account, or a club, to join, play,
-- score or watch (D94).
--
-- (1) The `club-assets` storage bucket — public to read (a club page's crest
--     and art are shown to anybody who opens it), written only by the server
--     on the service role, which resizes every upload to WebP first (art
--     1600 wide, crest 512 — D156). No policy on storage.objects is added,
--     so no phone can write to it or list it.
-- (2) clubs.art_path — the club's one art image (D155). Dark mode derives
--     its version in CSS (brightness .62, saturate .75, sepia .15).
--     clubs.art_dark_path — an optional dark version that overrides it; most
--     clubs will never set one. (clubs.crest_path is 086's. 086's
--     header_path is left unused: the art is the header — D155.)

-- ─── (1) The bucket ───────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club-assets', 'club-assets', true, 2097152, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ─── (2) The art ──────────────────────────────────────────────

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS art_path text NULL;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS art_dark_path text NULL;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'club-assets' AND public)                                   AS bucket_public,
--     (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'club-assets') = ARRAY['image/webp']              AS webp_only,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'art_path')      AS art_column,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'art_dark_path') AS dark_column,
--     NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
--                 AND (qual LIKE '%club-assets%' OR with_check LIKE '%club-assets%'))                              AS no_phone_policy;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time: every club page falls back to its name and colour.
-- First empty the bucket in the dashboard (Storage → club-assets → select
-- all → Delete): Supabase refuses to delete stored files by SQL. Then:
--
--   DELETE FROM storage.buckets WHERE id = 'club-assets';
--   ALTER TABLE clubs DROP COLUMN IF EXISTS art_dark_path;
--   ALTER TABLE clubs DROP COLUMN IF EXISTS art_path;
