/*
# Scope the staff directory to the caller and coordinators

1. Problem
   The `profiles_select_all_authenticated` policy used `USING (true)`, so any
   signed-in teacher could read every account's id, name and role — a full
   staff directory that also identifies exactly who the coordinators are.
   The application only ever reads the caller's own profile, plus name lookups
   on screens that are already coordinator-only.

2. New function
   - `is_coordinator()`: SECURITY DEFINER helper returning whether the current
     caller holds the coordinator role. A policy ON `profiles` cannot query
     `profiles` directly without recursing, so the check is wrapped in a
     definer function with a pinned search_path.

3. Security changes
   - Replace `profiles_select_all_authenticated` with
     `profiles_select_own_or_coordinator`: a caller may read their own row, and
     coordinators may read all rows.

4. Notes
   1. Coordinator screens (all reservations, day search, equipment history,
      check-in/out) keep resolving teacher names, so nothing regresses there.
   2. Teachers continue to load their own profile, which is what drives the
      role-dependent navigation.
*/

CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'coordinator'
  );
$function$;

REVOKE ALL ON FUNCTION public.is_coordinator() FROM public;
REVOKE ALL ON FUNCTION public.is_coordinator() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_coordinator() TO authenticated;

DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_coordinator" ON public.profiles;

CREATE POLICY "profiles_select_own_or_coordinator"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR public.is_coordinator()
);
