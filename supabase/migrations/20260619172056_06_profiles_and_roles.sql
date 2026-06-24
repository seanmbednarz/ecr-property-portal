-- Profiles table: links auth.users to a role + optional broker/client
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'broker', 'client')),
  broker_id uuid REFERENCES brokers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile; admins can read all
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR (auth.jwt() ->> 'email') LIKE '%@ecrtx.com'
  );

-- Only admins can insert/update profiles
CREATE POLICY "admin_insert_profile" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "admin_update_profile" ON profiles FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "admin_delete_profile" ON profiles FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

-- Auto-create profile on new auth user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (
    NEW.id,
    CASE WHEN NEW.email LIKE '%@ecrtx.com' THEN 'admin' ELSE 'client' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
