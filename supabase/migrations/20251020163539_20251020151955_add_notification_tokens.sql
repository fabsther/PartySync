/*
  # Add Notification Tokens Table

  1. New Tables
    - `notification_tokens`
      - `id` (uuid, primary key) - Unique identifier for each token
      - `user_id` (uuid, foreign key) - References auth.users
      - `token` (text) - Push notification token
      - `device_info` (text) - Information about the device (optional)
      - `created_at` (timestamptz) - When the token was registered
      - `updated_at` (timestamptz) - Last time the token was updated

  2. Security
    - Enable RLS on `notification_tokens` table
    - Add policy for authenticated users to manage their own tokens
    - Users can only read, insert, update, and delete their own tokens

  3. Indexes
    - Add index on user_id for faster lookups
    - Add unique constraint on (user_id, token) to prevent duplicates
*/

CREATE TABLE IF NOT EXISTS notification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token text NOT NULL,
  device_info text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_notification_tokens_user_id ON notification_tokens(user_id);

ALTER TABLE notification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification tokens"
  ON notification_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification tokens"
  ON notification_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification tokens"
  ON notification_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification tokens"
  ON notification_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_notification_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_tokens_updated_at
  BEFORE UPDATE ON notification_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_token_timestamp();