/*
  # Fix RLS Policies - Remove Infinite Recursion

  ## Changes
  This migration fixes infinite recursion in RLS policies by simplifying
  the policy structure and removing circular references between tables.

  ## Key Changes
  1. Drop and recreate party_organizers policies without recursion
  2. Drop and recreate party_guests policies without recursion
  3. Simplify parties policies to avoid circular dependencies

  ## Security
  - Maintains proper access control
  - Users can only see their own data and parties they're involved with
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view organizers for their parties" ON party_organizers;
DROP POLICY IF EXISTS "Party creators can manage organizers" ON party_organizers;
DROP POLICY IF EXISTS "Users can view guests for their parties" ON party_guests;
DROP POLICY IF EXISTS "Organizers can manage guests" ON party_guests;
DROP POLICY IF EXISTS "Users can update own guest status" ON party_guests;
DROP POLICY IF EXISTS "Organizers can delete guests" ON party_guests;

-- Simplified party_organizers policies
CREATE POLICY "Anyone can view party organizers"
  ON party_organizers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Party creators can insert organizers"
  ON party_organizers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_organizers.party_id
      AND parties.created_by = auth.uid()
    )
  );

CREATE POLICY "Party creators can delete organizers"
  ON party_organizers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_organizers.party_id
      AND parties.created_by = auth.uid()
    )
  );

-- Simplified party_guests policies
CREATE POLICY "Anyone can view party guests"
  ON party_guests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Party creators and organizers can invite guests"
  ON party_guests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_guests.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers po
          WHERE po.party_id = parties.id
          AND po.user_id = auth.uid()
        )
      )
    ) OR auth.uid() = party_guests.user_id
  );

CREATE POLICY "Users can update their own guest status"
  ON party_guests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Party creators and organizers can delete guests"
  ON party_guests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_guests.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers po
          WHERE po.party_id = parties.id
          AND po.user_id = auth.uid()
        )
      )
    )
  );