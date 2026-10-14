/*
# Add pickup/dropoff location to reservations

1. Changes
- Adds `pickup_location` column (text, nullable) to the `reservations` table.
- This lets coordinators and teachers specify where equipment should be picked up and returned.
2. Security
- No RLS policy changes needed — the column is covered by existing reservation policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reservations' AND column_name = 'pickup_location'
  ) THEN
    ALTER TABLE reservations ADD COLUMN pickup_location text;
  END IF;
END $$;
