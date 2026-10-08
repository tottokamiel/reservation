/*
# Add location column to equipment table

## Changes
- Adds a `location` text column to the `equipment` table, defaulting to ''.
  This field stores where the equipment is physically stored (e.g. "Cabinet A",
  "Storage Room 2"). It is visible only to coordinators in the UI.

## Security
- No RLS policy changes. The column inherits existing equipment policies.
*/

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
