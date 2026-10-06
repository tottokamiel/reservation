/*
# Add FK from reservations.user_id to profiles.id

## Problem
The reservations table has a FK from user_id to auth.users(id), but the app
queries join `profiles!user_id` to display the teacher's name. PostgREST
cannot resolve that join because there is no FK from reservations.user_id
to profiles.id. This causes the reservations list query to silently return
no data.

## Fix
Add a FK from reservations.user_id to profiles.id. Since profiles.id is
itself a FK to auth.users(id) with ON DELETE CASCADE, this is safe —
deleting a user cascades to both profiles and reservations.

## Security
No RLS changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_user_id_profiles_fkey'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
