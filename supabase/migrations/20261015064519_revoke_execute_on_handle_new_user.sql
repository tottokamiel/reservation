/*
# Remove direct remote access to the account-creation trigger

1. Problem
   `handle_new_user()` is a SECURITY DEFINER function living in the API-exposed
   `public` schema with the default PUBLIC execute grant, so it was reachable at
   /rest/v1/rpc/handle_new_user by the anon and authenticated roles. It is a
   trigger function and runs with its owner's rights, bypassing row level
   security on `profiles`.

2. Security changes
   - Revoke EXECUTE on `handle_new_user()` from PUBLIC, `anon` and `authenticated`.

3. Notes
   1. Trigger execution is unaffected: a trigger runs as the table owner and
      does not need an EXECUTE grant for the calling role.
   2. Sign-up continues to create profiles exactly as before.
*/

REVOKE ALL ON FUNCTION public.handle_new_user() FROM public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
