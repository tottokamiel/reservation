/*
# Stop sign-up from self-granting the coordinator role

1. Problem
   `handle_new_user()` copied `raw_user_meta_data->>'role'` straight into
   `profiles.role`. That metadata is supplied by the client on sign-up, so
   anyone — including an unauthenticated stranger posting directly to the
   sign-up endpoint — could create an account with the 'coordinator' role and
   gain full operator rights over all equipment and every teacher's bookings.

2. Changes
   - `handle_new_user()` now honours a requested role ONLY while no coordinator
     exists yet, so the very first account can still bootstrap the system.
     Once a coordinator exists, every new account is created as a 'teacher'
     regardless of what the client asked for. The value is also clamped to the
     two known roles so arbitrary strings cannot be stored.
   - New function `promote_to_coordinator(target_user_id uuid)`: the legitimate,
     server-enforced way to grant the coordinator role. It refuses unless the
     CALLER is already a coordinator.
   - New function `demote_to_teacher(target_user_id uuid)`: the matching
     revoke path, also coordinator-only, and refuses to remove the last
     coordinator so the system cannot be locked out.

3. Security changes
   - The role requested at sign-up is no longer trusted once the system is set up.
   - Role changes require an existing coordinator and run with a pinned search_path.
   - EXECUTE on the new functions is granted to `authenticated` only, never `anon`.

4. Notes
   1. Existing accounts and roles are not modified by this migration.
   2. Trigger firing is unaffected; only the value chosen for `role` changes.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text;
  resolved_role  text;
  coordinator_exists boolean;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');

  IF requested_role NOT IN ('teacher', 'coordinator') THEN
    requested_role := 'teacher';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'coordinator')
    INTO coordinator_exists;

  -- Only the very first account may bootstrap itself as coordinator.
  IF coordinator_exists THEN
    resolved_role := 'teacher';
  ELSE
    resolved_role := requested_role;
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    resolved_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_to_coordinator(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'coordinator'
  ) THEN
    RAISE EXCEPTION 'Only a coordinator can change roles';
  END IF;

  UPDATE public.profiles
     SET role = 'coordinator'
   WHERE id = target_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.demote_to_teacher(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'coordinator'
  ) THEN
    RAISE EXCEPTION 'Only a coordinator can change roles';
  END IF;

  IF (SELECT count(*) FROM public.profiles WHERE role = 'coordinator') <= 1
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND role = 'coordinator') THEN
    RAISE EXCEPTION 'Cannot remove the last coordinator';
  END IF;

  UPDATE public.profiles
     SET role = 'teacher'
   WHERE id = target_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_to_coordinator(uuid) FROM public;
REVOKE ALL ON FUNCTION public.promote_to_coordinator(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.promote_to_coordinator(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.demote_to_teacher(uuid) FROM public;
REVOKE ALL ON FUNCTION public.demote_to_teacher(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.demote_to_teacher(uuid) TO authenticated;
