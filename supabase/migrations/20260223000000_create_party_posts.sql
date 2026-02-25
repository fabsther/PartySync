-- Party wall posts
CREATE TABLE party_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  party_id uuid REFERENCES parties(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_party_posts_party_id ON party_posts(party_id);
CREATE INDEX idx_party_posts_created_at ON party_posts(created_at DESC);

ALTER TABLE party_posts ENABLE ROW LEVEL SECURITY;

-- Read: guests of the party (any status) or the party creator
CREATE POLICY "party_posts_select" ON party_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM party_guests
      WHERE party_guests.party_id = party_posts.party_id
        AND party_guests.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_posts.party_id
        AND parties.created_by = auth.uid()
    )
  );

-- Insert: guests of the party or creator, must be own post
CREATE POLICY "party_posts_insert" ON party_posts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (
        SELECT 1 FROM party_guests
        WHERE party_guests.party_id = party_posts.party_id
          AND party_guests.user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM parties
        WHERE parties.id = party_posts.party_id
          AND parties.created_by = auth.uid()
      )
    )
  );

-- Delete: post author or party creator
CREATE POLICY "party_posts_delete" ON party_posts
  FOR DELETE USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_posts.party_id
        AND parties.created_by = auth.uid()
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE party_posts;
