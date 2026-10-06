/*
# Remove pending reservation status — auto-approve all reservations

## Changes
1. Updates all existing reservations with status 'pending' to 'approved'.
2. No schema changes — the 'pending' status remains in the enum but will no longer be used by the app.

## Rationale
The approval workflow has been removed. All new reservations are created directly
with 'approved' status. This migration brings any existing pending reservations
in line with the new behavior.
*/

UPDATE reservations SET status = 'approved' WHERE status = 'pending';
