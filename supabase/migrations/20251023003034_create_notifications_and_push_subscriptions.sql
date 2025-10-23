/*
  # Create Notifications and Push Subscriptions Tables

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key) - Unique notification identifier
      - `user_id` (uuid, foreign key) - References profiles table
      - `title` (text) - Notification title
      - `message` (text) - Notification message content
      - `metadata` (jsonb) - Additional notification data
      - `read` (boolean) - Whether notification has been read
      - `created_at` (timestamptz) - When notification was created
      - `created_by` (uuid) - User who created the notification
    
    - `push_subscriptions`
      - `id` (uuid, primary key) - Unique subscription identifier
      - `user_id` (uuid, foreign key) - References profiles table
      - `endpoint` (text, unique) - Push service endpoint URL
      - `p256dh` (text) - Public key for encryption
      - `auth` (text) - Authentication secret
      - `ua` (text) - User agent information
      - `created_at` (timestamptz) - When subscription was created

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to:
      - Read their own notifications
      - Mark their own notifications as read
      - Insert notifications for other users (for party organizers)
      - Manage their own push subscriptions
*/

-- Table for persistent notifications (Realtime + history)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid()
);

-- Table for Web Push subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  ua text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Notifications Policies
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can create notifications for others"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Push Subscriptions Policies
CREATE POLICY "Users can read own subscriptions"
  ON push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own subscriptions"
  ON push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
  ON push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
