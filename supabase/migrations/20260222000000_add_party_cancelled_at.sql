-- Soft-delete support for parties with confirmed guests.
-- When a creator cancels a party that has confirmed guests, we set cancelled_at
-- instead of deleting the row. The party remains visible (with a cancelled banner)
-- until its fixed_date passes, then disappears from the list automatically (client-side filter).
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;
