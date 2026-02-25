-- When a party post is deleted, cascade-delete all notifications linked to it
-- (matched by metadata->>'postId')
CREATE OR REPLACE FUNCTION cleanup_post_notifications()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM notifications
  WHERE metadata->>'postId' = OLD.id::text;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cleanup_post_notifications ON party_posts;
CREATE TRIGGER trg_cleanup_post_notifications
  AFTER DELETE ON party_posts
  FOR EACH ROW EXECUTE FUNCTION cleanup_post_notifications();
