/*
# Scope the equipment handoff log to the people entitled to see it

1. Problem
   The `checkouts_select_all` policy used `USING (true)` for every signed-in
   user. Reservations and reservation items are carefully scoped to their owner
   or a coordinator, but the handoff log was not: any teacher could read every
   checkout record in the school, revealing which item went to which booking,
   when, and which staff member handed it over or took it back.

2. Security changes
   - Replace `checkouts_select_all` with `checkouts_select_own_or_coordinator`,
     which allows a row only when the checkout belongs to a reservation the
     caller owns, or the caller is a coordinator.

3. Notes
   1. Coordinators keep full visibility, so the check-in/out calendar, the
      handoff log and the "active checkouts" figure are unaffected for them.
   2. Teachers continue to see the handoff history of their own bookings.
*/

DROP POLICY IF EXISTS "checkouts_select_all" ON public.checkouts;
DROP POLICY IF EXISTS "checkouts_select_own_or_coordinator" ON public.checkouts;

CREATE POLICY "checkouts_select_own_or_coordinator"
ON public.checkouts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = checkouts.reservation_id
      AND r.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'coordinator'
  )
);
