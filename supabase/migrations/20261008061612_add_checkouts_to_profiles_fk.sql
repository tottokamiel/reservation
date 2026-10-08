/*
# Add FKs from checkouts to profiles

## Problem
The reservation detail query joins `profiles!checked_out_by` and
`profiles!checked_in_by` on the checkouts table, but there are no
foreign keys from checkouts.checked_out_by / checked_in_by to
profiles.id — only to auth.users(id). PostgREST cannot resolve the
join and the query fails, showing "Could not load reservation details."

## Fix
Add FK constraints from checkouts.checked_out_by and checkouts.checked_in_by
to profiles(id). Since profiles.id is itself a FK to auth.users(id) with
ON DELETE CASCADE, this is safe.

## Security
No RLS changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'checkouts_checked_out_by_profiles_fkey'
      AND conrelid = 'checkouts'::regclass
  ) THEN
    ALTER TABLE checkouts
      ADD CONSTRAINT checkouts_checked_out_by_profiles_fkey
      FOREIGN KEY (checked_out_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'checkouts_checked_in_by_profiles_fkey'
      AND conrelid = 'checkouts'::regclass
  ) THEN
    ALTER TABLE checkouts
      ADD CONSTRAINT checkouts_checked_in_by_profiles_fkey
      FOREIGN KEY (checked_in_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
