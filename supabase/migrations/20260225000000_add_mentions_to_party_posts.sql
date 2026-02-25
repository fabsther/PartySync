ALTER TABLE party_posts
  ADD COLUMN IF NOT EXISTS mentions uuid[] DEFAULT '{}';
