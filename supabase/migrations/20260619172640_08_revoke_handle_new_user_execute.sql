-- Revoke direct API execution of handle_new_user().
-- It should only fire via the trigger, never called directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
