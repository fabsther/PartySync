/*
  # Fix infinite recursion in party_guests UPDATE policy

  The "Party creators and organizers can update guest status" policy caused
  a 42P17 infinite recursion error:
    - party_guests UPDATE policy → queries parties (SELECT)
    - parties SELECT policy → queries party_guests (SELECT)

  Fix: use a SECURITY DEFINER function to check party ownership without
  triggering RLS on the queried tables.
*/

CREATE OR REPLACE FUNCTION public.is_party_creator_or_organizer(p_party_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parties
    WHERE id = p_party_id
    AND (
      created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM party_organizers po
        WHERE po.party_id = p_party_id
        AND po.user_id = auth.uid()
      )
    )
  );
$$;

DROP POLICY IF EXISTS "Party creators and organizers can update guest status" ON party_guests;

CREATE POLICY "Party creators and organizers can update guest status"
  ON party_guests FOR UPDATE
  TO authenticated
  USING (public.is_party_creator_or_organizer(party_guests.party_id))
  WITH CHECK (public.is_party_creator_or_organizer(party_guests.party_id));
