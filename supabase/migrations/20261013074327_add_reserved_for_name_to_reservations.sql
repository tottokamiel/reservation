/*
# Add reservation recipient name for offline teachers

1. Purpose
- Allow coordinators to create reservations for teachers who do not yet have accounts.
- Keep the authenticated coordinator as `reservations.user_id` so existing access rules and audit behavior remain intact.

2. Modified Tables
- `reservations`
- Add `reserved_for_name` (text, nullable): the teacher name entered by a coordinator when the reservation is made on someone else's behalf.

3. Security
- No new tables or policies are created.
- Existing reservation policies continue to protect the row through `user_id`.

4. Compatibility
- Existing reservations remain unchanged and continue using their linked profile name.
- The new field is optional for teacher-created reservations and existing data.
*/

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS reserved_for_name text;
