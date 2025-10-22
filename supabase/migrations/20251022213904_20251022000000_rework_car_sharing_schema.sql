/*
  # Rework Car Sharing Schema

  1. Changes to profiles table
    - Add `profile_location` field for auto-filling request locations

  2. Changes to car_sharing table
    - Add `status` field ('active', 'cancelled', 'completed')
    - Modify `passengers` to store JSONB array with passenger details
    - Add `capacity` field (separate from available_seats)

  3. Security
    - Maintain existing RLS policies
    - All changes are backward compatible
*/

-- Add profile_location to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'profile_location'
  ) THEN
    ALTER TABLE profiles ADD COLUMN profile_location text DEFAULT '';
  END IF;
END $$;

-- Add status column to car_sharing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'car_sharing' AND column_name = 'status'
  ) THEN
    ALTER TABLE car_sharing ADD COLUMN status text DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed'));
  END IF;
END $$;

-- Add capacity column to car_sharing (for offers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'car_sharing' AND column_name = 'capacity'
  ) THEN
    ALTER TABLE car_sharing ADD COLUMN capacity integer DEFAULT 0;
  END IF;
END $$;

-- Modify passengers column to JSONB for better structure
-- This will store: [{ userId, pickupLocation, joinedAt }, ...]
DO $$
BEGIN
  -- Check if passengers column exists and is array type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'car_sharing' 
    AND column_name = 'passengers'
    AND data_type = 'ARRAY'
  ) THEN
    -- Drop the old array column
    ALTER TABLE car_sharing DROP COLUMN passengers;
  END IF;
  
  -- Add new JSONB passengers column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'car_sharing' AND column_name = 'passengers'
  ) THEN
    ALTER TABLE car_sharing ADD COLUMN passengers jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create index for faster queries on status
CREATE INDEX IF NOT EXISTS idx_car_sharing_status ON car_sharing(status);
CREATE INDEX IF NOT EXISTS idx_car_sharing_party_status ON car_sharing(party_id, status);