/*
  # Auto-cleanup old notifications via trigger

  Adds a trigger that automatically deletes notifications older than 30 days
  for a user whenever a new notification is inserted for that user.

  This avoids the need for pg_cron (not available on free tier) or any
  external scheduler.

  Retention policy: notifications older than 30 days are deleted on next INSERT.
*/

-- Function: delete notifications > 30 days for the affected user
CREATE OR REPLACE FUNCTION cleanup_old_notifications_for_user()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE user_id = NEW.user_id
    AND created_at < now() - interval '30 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fires after each INSERT on notifications
CREATE OR REPLACE TRIGGER trg_cleanup_old_notifications
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_old_notifications_for_user();
