/*
  # Party Organization App - Complete Database Schema

  ## Overview
  This migration creates the complete database schema for a collaborative party organization app
  with support for user management, party creation, car sharing, equipment tracking, and food/beverage sharing.

  ## New Tables

  ### 1. profiles
  Extended user profile information linked to auth.users
  - `id` (uuid, FK to auth.users) - User identifier
  - `email` (text) - User email
  - `full_name` (text) - User's full name
  - `avatar_url` (text) - Profile picture URL
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. subscribers
  Manages follower/subscriber relationships between users
  - `id` (uuid, PK) - Subscription identifier
  - `user_id` (uuid, FK) - The user being followed
  - `subscriber_id` (uuid, FK) - The user who is following
  - `created_at` (timestamptz) - Subscription timestamp

  ### 3. invite_codes
  Shareable invite links for user acquisition
  - `id` (uuid, PK) - Invite code identifier
  - `code` (text) - Unique invite code
  - `created_by` (uuid, FK) - User who created the invite
  - `used_by` (uuid[], array) - Array of users who used this code
  - `created_at` (timestamptz) - Code creation timestamp

  ### 4. parties
  Main party information and settings
  - `id` (uuid, PK) - Party identifier
  - `title` (text) - Party name/title
  - `description` (text) - Party description
  - `schedule` (text) - Event schedule details
  - `address` (text) - Party location address
  - `entry_instructions` (text) - How to enter/access the venue
  - `is_date_fixed` (boolean) - Whether date is confirmed or being voted on
  - `fixed_date` (timestamptz) - Confirmed party date
  - `images` (text[], array) - URLs to party images
  - `created_by` (uuid, FK) - Party creator
  - `is_vlp` (boolean) - Very Limited Party flag
  - `vlp_payment_link` (text) - Third-party payment link for VLP topping
  - `created_at` (timestamptz) - Party creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 5. party_date_options
  Date/timeframe voting options for parties with unfixed dates

  ### 6. party_organizers
  Co-organizers who can manage party settings

  ### 7. party_guests
  Users attending or invited to a party

  ### 8. car_sharing
  Car sharing requests and offers

  ### 9. equipment
  Equipment and items needed or available for parties

  ### 10. equipment_contributors
  Tracks who is bringing which equipment

  ### 11. food_items
  Food and beverage items for parties

  ### 12. food_contributions
  Tracks who is bringing which food/beverage items

  ## Security
  - RLS enabled on all tables
  - Policies restrict access based on authentication and party membership
  - Users can only view/edit their own data and parties they're involved with
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create subscribers table
CREATE TABLE IF NOT EXISTS subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, subscriber_id)
);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their subscriptions"
  ON subscribers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = subscriber_id);

CREATE POLICY "Users can create subscriptions"
  ON subscribers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = subscriber_id);

CREATE POLICY "Users can delete own subscriptions"
  ON subscribers FOR DELETE
  TO authenticated
  USING (auth.uid() = subscriber_id);

-- Create invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_by uuid[] DEFAULT ARRAY[]::uuid[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invite codes"
  ON invite_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create invite codes"
  ON invite_codes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own invite codes"
  ON invite_codes FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Create parties table
CREATE TABLE IF NOT EXISTS parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  schedule text DEFAULT '',
  address text DEFAULT '',
  entry_instructions text DEFAULT '',
  is_date_fixed boolean DEFAULT false,
  fixed_date timestamptz,
  images text[] DEFAULT ARRAY[]::text[],
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_vlp boolean DEFAULT false,
  vlp_payment_link text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create party_organizers table (needed before party policies)
CREATE TABLE IF NOT EXISTS party_organizers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(party_id, user_id)
);

-- Create party_guests table (needed before party policies)
CREATE TABLE IF NOT EXISTS party_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed', 'declined')),
  notified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(party_id, user_id)
);

-- Now add RLS policies for parties
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view parties they're involved with"
  ON parties FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM party_organizers
      WHERE party_organizers.party_id = parties.id
      AND party_organizers.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM party_guests
      WHERE party_guests.party_id = parties.id
      AND party_guests.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create parties"
  ON parties FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Organizers can update parties"
  ON parties FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM party_organizers
      WHERE party_organizers.party_id = parties.id
      AND party_organizers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM party_organizers
      WHERE party_organizers.party_id = parties.id
      AND party_organizers.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can delete parties"
  ON parties FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Create party_date_options table
CREATE TABLE IF NOT EXISTS party_date_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  date_option timestamptz NOT NULL,
  timeframe text DEFAULT '',
  votes integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE party_date_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view date options for their parties"
  ON party_date_options FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_date_options.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM party_guests
          WHERE party_guests.party_id = parties.id
          AND party_guests.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Organizers can manage date options"
  ON party_date_options FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_date_options.party_id
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
      WHERE parties.id = party_date_options.party_id
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

-- Add RLS policies for party_organizers
ALTER TABLE party_organizers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view organizers for their parties"
  ON party_organizers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_organizers.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers po2
          WHERE po2.party_id = parties.id
          AND po2.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM party_guests
          WHERE party_guests.party_id = parties.id
          AND party_guests.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Party creators can manage organizers"
  ON party_organizers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_organizers.party_id
      AND parties.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_organizers.party_id
      AND parties.created_by = auth.uid()
    )
  );

-- Add RLS policies for party_guests
ALTER TABLE party_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view guests for their parties"
  ON party_guests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_guests.party_id
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

CREATE POLICY "Organizers can manage guests"
  ON party_guests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_guests.party_id
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

CREATE POLICY "Users can update own guest status"
  ON party_guests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Organizers can delete guests"
  ON party_guests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = party_guests.party_id
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

-- Create car_sharing table
CREATE TABLE IF NOT EXISTS car_sharing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('offer', 'request')),
  departure_location text DEFAULT '',
  available_seats integer DEFAULT 0,
  passengers uuid[] DEFAULT ARRAY[]::uuid[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE car_sharing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view car sharing for their parties"
  ON car_sharing FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = car_sharing.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM party_guests
          WHERE party_guests.party_id = parties.id
          AND party_guests.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create car sharing entries"
  ON car_sharing FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM party_guests
      WHERE party_guests.party_id = car_sharing.party_id
      AND party_guests.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own car sharing entries"
  ON car_sharing FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own car sharing entries"
  ON car_sharing FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text DEFAULT 'general',
  is_required boolean DEFAULT true,
  is_available boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment for their parties"
  ON equipment FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = equipment.party_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM party_guests
          WHERE party_guests.party_id = parties.id
          AND party_guests.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Organizers can manage equipment"
  ON equipment FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parties
      WHERE parties.id = equipment.party_id
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
      WHERE parties.id = equipment.party_id
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

-- Create equipment_contributors table
CREATE TABLE IF NOT EXISTS equipment_contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(equipment_id, user_id)
);

ALTER TABLE equipment_contributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment contributors"
  ON equipment_contributors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM equipment
      JOIN parties ON parties.id = equipment.party_id
      WHERE equipment.id = equipment_contributors.equipment_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM party_guests
          WHERE party_guests.party_id = parties.id
          AND party_guests.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can add themselves as contributors"
  ON equipment_contributors FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove themselves as contributors"
  ON equipment_contributors FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create food_items table
CREATE TABLE IF NOT EXISTS food_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text DEFAULT 'general',
  base_quantity text DEFAULT '',
  estimated_cost numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view food items for their parties"
  ON food_items FOR SELECT
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
        ) OR
        EXISTS (
          SELECT 1 FROM party_guests
          WHERE party_guests.party_id = parties.id
          AND party_guests.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Organizers can manage food items"
  ON food_items FOR ALL
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

-- Create food_contributions table
CREATE TABLE IF NOT EXISTS food_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_item_id uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quantity text DEFAULT '',
  is_extra boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE food_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view food contributions"
  ON food_contributions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM food_items
      JOIN parties ON parties.id = food_items.party_id
      WHERE food_items.id = food_contributions.food_item_id
      AND (
        parties.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM party_organizers
          WHERE party_organizers.party_id = parties.id
          AND party_organizers.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM party_guests
          WHERE party_guests.party_id = parties.id
          AND party_guests.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can add their food contributions"
  ON food_contributions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own food contributions"
  ON food_contributions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own food contributions"
  ON food_contributions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscribers_user_id ON subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_subscriber_id ON subscribers(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_parties_created_by ON parties(created_by);
CREATE INDEX IF NOT EXISTS idx_party_organizers_party_id ON party_organizers(party_id);
CREATE INDEX IF NOT EXISTS idx_party_organizers_user_id ON party_organizers(user_id);
CREATE INDEX IF NOT EXISTS idx_party_guests_party_id ON party_guests(party_id);
CREATE INDEX IF NOT EXISTS idx_party_guests_user_id ON party_guests(user_id);
CREATE INDEX IF NOT EXISTS idx_car_sharing_party_id ON car_sharing(party_id);
CREATE INDEX IF NOT EXISTS idx_equipment_party_id ON equipment(party_id);
CREATE INDEX IF NOT EXISTS idx_food_items_party_id ON food_items(party_id);