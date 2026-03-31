/*
  # Fix infinite recursion in party_guests INSERT policy

  The "Party creators and organizers can invite guests" INSERT policy caused
  a 42P17 infinite recursion error when used in combination with upsert:
    - party_guests INSERT policy → queries parties (SELECT)
    - parties SELECT policy → queries party_guests (SELECT)

  Fix: reuse the existing SECURITY DEFINER function is_party_creator_or_organizer
  to check party ownership without triggering RLS on the queried tables.
*/

DROP POLICY IF EXISTS "Party creators and organizers can invite guests" ON party_guests;

CREATE POLICY "Party creators and organizers can invite guests"
  ON party_guests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_party_creator_or_organizer(party_guests.party_id)
    OR (auth.uid() = user_id)
  );
