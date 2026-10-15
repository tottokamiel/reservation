/*
# Make reservation status server-controlled

1. Problem
   The `reservations_update` policy authorizes the row owner, and row level
   security is row-level: the owner could therefore write EVERY column of their
   own reservation, including `status`. A teacher holding borrowed equipment
   could set their booking to 'checked_in' with a direct request, making it
   disappear from the coordinator's return queue while still holding the gear.
   The real state of a handoff lives in the `checkouts` table, which only
   coordinators can write.

2. Changes
   - Revoke table-wide UPDATE on `public.reservations` from `authenticated`
     and `anon`, then re-grant UPDATE only on the booking-detail columns
     teachers and coordinators legitimately edit:
     title, purpose, reserved_for_name, start_time, end_time, pickup_location.
     `status` and `user_id` are no longer client-writable.
   - New function `cancel_reservation(reservation_id uuid)`: cancels a booking.
     Allowed for the booking's owner or any coordinator. Refuses to cancel a
     booking that is already cancelled or already fully returned.
   - New function `sync_reservation_status(reservation_id uuid)`: recomputes
     the status from the actual checkout rows. Coordinator-only. This replaces
     the client-side status arithmetic that used to be sent as a plain update.

3. Security changes
   - Reservation status can no longer be set to an arbitrary value by a client.
   - Ownership of a reservation can no longer be reassigned by a client.
   - Both new functions pin `search_path` and are granted to `authenticated` only.

4. Notes
   1. SELECT, INSERT and DELETE on reservations are unchanged, so creating and
      deleting bookings keeps working exactly as before.
   2. Cancelling a booking continues to work for both teachers and coordinators,
      now through `cancel_reservation` rather than a direct column write.
*/

REVOKE UPDATE ON public.reservations FROM authenticated;
REVOKE UPDATE ON public.reservations FROM anon;

GRANT UPDATE (title, purpose, reserved_for_name, start_time, end_time, pickup_location)
  ON public.reservations TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_reservation(reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_coordinator boolean;
  current_status text;
  owner_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'coordinator'
  ) INTO is_coordinator;

  SELECT r.status, r.user_id
    INTO current_status, owner_id
    FROM public.reservations r
   WHERE r.id = reservation_id;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF NOT is_coordinator AND owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not allowed to cancel this reservation';
  END IF;

  -- Re-check the gating state server-side at the moment of the change.
  IF current_status IN ('cancelled', 'checked_in') THEN
    RAISE EXCEPTION 'This reservation can no longer be cancelled';
  END IF;

  UPDATE public.reservations
     SET status = 'cancelled'
   WHERE id = reservation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_reservation_status(reservation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total_items      integer;
  total_checkouts  integer;
  total_checked_in integer;
  current_status   text;
  new_status       text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'coordinator'
  ) THEN
    RAISE EXCEPTION 'Only a coordinator can process handoffs';
  END IF;

  SELECT r.status INTO current_status
    FROM public.reservations r
   WHERE r.id = reservation_id;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  SELECT count(*) INTO total_items
    FROM public.reservation_items
   WHERE reservation_items.reservation_id = sync_reservation_status.reservation_id;

  SELECT count(*), count(*) FILTER (WHERE checked_in_at IS NOT NULL)
    INTO total_checkouts, total_checked_in
    FROM public.checkouts
   WHERE checkouts.reservation_id = sync_reservation_status.reservation_id;

  new_status := current_status;

  IF total_items > 0 AND total_checked_in = total_items THEN
    new_status := 'checked_in';
  ELSIF total_checkouts > 0 THEN
    new_status := 'checked_out';
  END IF;

  IF new_status <> current_status THEN
    UPDATE public.reservations
       SET status = new_status
     WHERE id = reservation_id;
  END IF;

  RETURN new_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_reservation(uuid) FROM public;
REVOKE ALL ON FUNCTION public.cancel_reservation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_reservation_status(uuid) FROM public;
REVOKE ALL ON FUNCTION public.sync_reservation_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_reservation_status(uuid) TO authenticated;
