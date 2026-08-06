-- Admin team management.
-- The Team page needs to (a) list every user with their email + role and
-- (b) change a user's role. Neither is possible from the browser client on
-- its own: auth.users (which holds emails) isn't exposed to the anon key, and
-- profiles is locked down by RLS. Both operations are therefore SECURITY
-- DEFINER RPCs that check the caller is an admin via the existing my_role()
-- helper (migration 23) before doing anything.

-- List all users: id, email, role, and any broker/client linkage. Admin only.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (id uuid, email text, role text, broker_id uuid, client_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can list users';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, p.role, p.broker_id, p.client_id, u.created_at
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    ORDER BY
      CASE p.role WHEN 'admin' THEN 0 WHEN 'broker' THEN 1 ELSE 2 END,
      u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Set a user's role. Admin only, validates the role, and refuses to demote
-- the last remaining admin (which would lock everyone out of admin controls).
CREATE OR REPLACE FUNCTION public.admin_set_role(target_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE admin_count int;
BEGIN
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  IF new_role NOT IN ('admin', 'broker', 'client') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  IF new_role <> 'admin' THEN
    SELECT count(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
    IF admin_count <= 1
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = target_id AND role = 'admin') THEN
      RAISE EXCEPTION 'Cannot demote the last remaining admin';
    END IF;
  END IF;

  UPDATE public.profiles SET role = new_role WHERE id = target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile found for user %', target_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_role(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, text) TO authenticated;
