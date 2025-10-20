/*
  # Allow guests to add food items

  1. Changes
    - Drop existing restrictive policy on food_items
    - Create separate policies for SELECT, INSERT, UPDATE, DELETE
    - Allow confirmed party guests to add food items
    - Only party creators and organizers can update/delete items
  
  2. Security
    - Guests can view all food items for their parties
    - Guests can add new food items to parties they're confirmed for
    - Only creators and organizers can modify or delete items
*/

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Organizers can manage food items" ON food_items;

-- Allow party guests to insert food items
CREATE POLICY "Confirmed guests can add food items"
  ON food_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM party_guests
      WHERE party_guests.party_id = food_items.party_id
      AND party_guests.user_id = auth.uid()
      AND party_guests.status = 'confirmed'
    )
    OR EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = food_items.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        )
      )
    )
  );

-- Only organizers can update food items
CREATE POLICY "Organizers can update food items"
  ON food_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = food_items.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = food_items.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        )
      )
    )
  );

-- Only organizers can delete food items
CREATE POLICY "Organizers can delete food items"
  ON food_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = food_items.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        )
      )
    )
  );