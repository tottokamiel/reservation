/*
# Allow coordinators to create reservations for any teacher

## Changes
1. Updates the reservations INSERT policy so coordinators can create
   reservations on behalf of any teacher (not just themselves).
2. The existing INSERT policy only allowed auth.uid() = user_id. Now
   coordinators can insert with any user_id.
*/

-- Drop the old insert policy
DROP POLICY IF EXISTS "reservations_insert_own" ON reservations;

-- New insert policy: teachers insert their own, coordinators insert for anyone
CREATE POLICY "reservations_insert"
ON reservations FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);
