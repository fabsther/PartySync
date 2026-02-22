-- Banner image, icon image, and group chat link on parties.
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS icon_url   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS chat_url   TEXT DEFAULT NULL;
