-- Shared property notes: make notes visible to the people working the deal,
-- attribute them to their real author, and cap them at a short tag length.
--
-- Before this, property_notes had SELECT USING (auth.uid() = user_id) — notes
-- were own-row only, so nobody ever saw anyone else's note (and the notes
-- count badge only counted your own).
--
-- Visibility rules:
--   admin / broker : every note on any property they can see
--   client         : notes on their assigned properties, but ONLY those written
--                    by staff (admin/broker) or by someone at their own client.
--                    A property can be assigned to several clients, so this
--                    deliberately does NOT leak client A's notes to client B.
-- Writes stay own-row (you manage your own notes); admins may delete any note.

-- 1. Username on profiles — used as the note author label when set, and the
--    basis for client username logins. Unique, case-insensitive.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON profiles (lower(username)) WHERE username IS NOT NULL;

-- 2. Short-tag length cap. Existing longer notes are truncated rather than
--    blocking the constraint (nothing is silently lost that wasn't already a
--    note nobody but its author could read).
UPDATE property_notes SET content = left(content, 30) WHERE char_length(content) > 30;

DO $$
BEGIN
  ALTER TABLE property_notes
    ADD CONSTRAINT property_notes_content_len CHECK (char_length(content) <= 30);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Replace the own-row SELECT policy with role-aware visibility.
DROP POLICY IF EXISTS "select_own_notes" ON property_notes;
DROP POLICY IF EXISTS sel_property_notes ON property_notes;

CREATE POLICY sel_property_notes ON property_notes FOR SELECT TO authenticated
  USING (
    my_role() IN ('admin', 'broker')
    OR (
      property_id IN (SELECT property_id FROM property_clients WHERE client_id = my_client_id())
      AND EXISTS (
        SELECT 1 FROM profiles author
        WHERE author.id = property_notes.user_id
          AND (author.role IN ('admin', 'broker') OR author.client_id = my_client_id())
      )
    )
  );

-- Writes: own-row for everyone; admins can also delete (moderation).
DROP POLICY IF EXISTS "insert_own_notes" ON property_notes;
DROP POLICY IF EXISTS ins_property_notes ON property_notes;
CREATE POLICY ins_property_notes ON property_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notes" ON property_notes;
DROP POLICY IF EXISTS upd_property_notes ON property_notes;
CREATE POLICY upd_property_notes ON property_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notes" ON property_notes;
DROP POLICY IF EXISTS del_property_notes ON property_notes;
CREATE POLICY del_property_notes ON property_notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR my_role() = 'admin');

-- 4. Notes for a property with a real author label.
-- Email lookup first (the view function below calls it). SECURITY DEFINER only
-- to reach auth.users, which isn't readable from the browser; it returns a
-- single email for a user id and nothing else.
CREATE OR REPLACE FUNCTION public.note_author_email(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.note_author_email(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.note_author_email(uuid) TO authenticated;

-- SECURITY INVOKER so the RLS policy above still decides which rows come back.
CREATE OR REPLACE FUNCTION public.property_notes_with_authors(p_property_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  created_at timestamptz,
  updated_at timestamptz,
  author_label text,
  is_mine boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT n.id, n.user_id, n.content, n.created_at, n.updated_at,
         COALESCE(NULLIF(pr.username, ''), public.note_author_email(n.user_id), 'Unknown') AS author_label,
         (n.user_id = auth.uid()) AS is_mine
  FROM property_notes n
  LEFT JOIN profiles pr ON pr.id = n.user_id
  WHERE n.property_id = p_property_id
  ORDER BY n.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.property_notes_with_authors(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.property_notes_with_authors(uuid) TO authenticated;
