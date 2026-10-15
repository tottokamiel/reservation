/*
# Prevent users from changing their own role

1. Problem
   The `profiles_update_own` policy lets a signed-in user update their own
   profile row. Because row level security is row-level and `authenticated`
   held UPDATE on every column, a teacher could set their own `role` column
   to 'coordinator' and gain full operator privileges. Every privileged
   policy in this database trusts `profiles.role`.

2. Security changes
   - Revoke table-wide UPDATE on `public.profiles` from `authenticated` and `anon`.
   - Re-grant UPDATE on only the `full_name` column to `authenticated`.
   - The existing `profiles_update_own` row policy is left untouched, so a user
     may still correct their own display name and nobody else's.

3. Notes
   1. SELECT is deliberately not touched here, so no existing query breaks.
   2. The `role` column is now only writable by privileged server-side code.
*/

REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;

GRANT UPDATE (full_name) ON public.profiles TO authenticated;
