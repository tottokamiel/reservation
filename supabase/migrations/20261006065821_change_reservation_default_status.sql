/*
# Change reservations default status from pending to approved

## Change
The reservations.status column currently defaults to 'pending'. Since the
approval workflow has been removed, new reservations should default to
'approved'.

## Security
No RLS changes.
*/

ALTER TABLE reservations
  ALTER COLUMN status SET DEFAULT 'approved';
