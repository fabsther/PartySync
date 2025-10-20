/*
  # Allow organizers to update guest status

  1. Changes
    - Add new policy allowing party creators and organizers to update guest status
    - This enables party owners to overwrite confirmed/declined status
  
  2. Security
    - Policy checks party ownership or organizer status
    - Users can still update their own status via existing policy
*/

-- Add policy for organizers to update guest status
CREATE POLICY "Party creators and organizers can update guest status"
  ON party_guests FOR UPDATE
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
  )
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
    )
  );