/*
  # Create companions table

  1. New Tables
    - `guest_companions`
      - `id` (uuid, primary key)
      - `party_guest_id` (uuid, foreign key to party_guests)
      - `name` (text, companion's name)
      - `created_at` (timestamp)
  
  2. Security
    - Enable RLS on `guest_companions` table
    - Add policies for authenticated users to manage their companions
    - Party creators and organizers can view all companions
  
  3. Purpose
    - Allows guests to add multiple companions individually
    - Each companion can be removed independently
    - Simplifies headcount calculation
*/

-- Create guest_companions table
CREATE TABLE IF NOT EXISTS guest_companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_guest_id uuid NOT NULL REFERENCES party_guests(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE guest_companions ENABLE ROW LEVEL SECURITY;

-- Anyone can view companions for parties they're involved in
CREATE POLICY "Authenticated users can view companions"
  ON guest_companions FOR SELECT
  TO authenticated
  USING (true);

-- Guests can add their own companions
CREATE POLICY "Guests can add their own companions"
  ON guest_companions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM party_guests
      WHERE party_guests.id = guest_companions.party_guest_id
      AND party_guests.user_id = auth.uid()
    )
  );

-- Guests can delete their own companions
CREATE POLICY "Guests can delete their own companions"
  ON guest_companions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM party_guests
      WHERE party_guests.id = guest_companions.party_guest_id
      AND party_guests.user_id = auth.uid()
    )
  );

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_guest_companions_party_guest_id 
  ON guest_companions(party_guest_id);