-- 106 — Emoji reactions on the stream (D348; Ross, 26 Nov 2026: "Get rid of
-- dots. Is it possible for people to react with emojis same as WhatsApp?").
-- A reaction is a feed_dots row with its emoji: one a person a message, on an
-- item or a reply, choosing another replacing it. A dot given before this
-- reads as 👍. lib/feed.ts holds the six (REACTIONS) and the rules;
-- app/api/feed/social.ts `react` is the only writer. Server only, as 102 left it.
--
-- PASTE AFTER THE DEPLOY. Before it the stream offers 👍 alone and says the
-- rest are not set up yet; nothing else changes.

ALTER TABLE feed_dots ADD COLUMN IF NOT EXISTS emoji text NULL
  CHECK (emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 16);

-- Did it land?
--   SELECT EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_name = 'feed_dots' AND column_name = 'emoji') AS reactions;

-- UNDO (every reaction reads as 👍 again):
--   ALTER TABLE feed_dots DROP COLUMN IF EXISTS emoji;
