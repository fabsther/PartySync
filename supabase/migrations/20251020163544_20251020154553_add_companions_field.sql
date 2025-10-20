/*
  # Add companions field to party_guests

  1. Changes
    - Add `companions` text field to party_guests table
    - Field is nullable to allow guests without companions
  
  2. Purpose
    - Allows guests to specify who they're bringing (e.g., "My wife and 2 kids")
    - Helps organizers plan for total headcount
*/

-- Add companions field to party_guests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'party_guests' AND column_name = 'companions'
  ) THEN
    ALTER TABLE party_guests ADD COLUMN companions text;
  END IF;
END $$;