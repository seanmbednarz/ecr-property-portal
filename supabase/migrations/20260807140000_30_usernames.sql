-- Username logins for client accounts.
--
-- profiles.username was added in migration 28 (it doubles as the note author
-- label). This exposes it to the Team page so an admin can set one, and adds
-- the validation that keeps usernames usable as logins.
--
-- Usernames are ADDITIVE: the account keeps its email and email sign-in keeps
-- working. The username is just a second way in, aimed at client teams who
-- share one login.

-- Shape rules: 3-32 chars, letters/digits/dot/dash/underscore, and never
-- something that could be mistaken for an email (the login form routes an
-- input containing "@" down the email path).
DO $$
BEGIN
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_username_format
    CHECK (username IS NULL OR username ~ '^[A-Za-z0-9._-]{3,32}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- admin_list_users gains the username column. Return type changes, so the old
-- one has to go first.
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  username text,
  role text,
  broker_id uuid,
  client_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can list users';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, p.username, p.role, p.broker_id, p.client_id, u.created_at
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    ORDER BY
      CASE p.role WHEN 'admin' THEN 0 WHEN 'broker' THEN 1 ELSE 2 END,
      u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Set or clear a username. Admin only; blank clears it.
CREATE OR REPLACE FUNCTION public.admin_set_username(target_id uuid, new_username text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cleaned text;
BEGIN
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can set usernames';
  END IF;

  cleaned := NULLIF(btrim(coalesce(new_username, '')), '');

  IF cleaned IS NOT NULL THEN
    IF cleaned !~ '^[A-Za-z0-9._-]{3,32}$' THEN
      RAISE EXCEPTION 'Username must be 3-32 characters: letters, numbers, dot, dash, underscore';
    END IF;
    IF EXISTS (
      SELECT 1 FROM profiles
      WHERE lower(username) = lower(cleaned) AND id <> target_id
    ) THEN
      RAISE EXCEPTION 'That username is already taken';
    END IF;
  END IF;

  UPDATE profiles SET username = cleaned WHERE id = target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile found for user %', target_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_username(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_username(uuid, text) TO authenticated;
