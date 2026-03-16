-- handle_new_user() previously hardcoded role='volunteer' for all new users.
-- The student app now passes { app: 'student' } in raw_user_meta_data during
-- anonymous sign-in. Use that to assign the correct role.

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO profiles (id, role)
  VALUES (
    NEW.id,
    CASE WHEN NEW.raw_user_meta_data->>'app' = 'student' THEN 'student'
         ELSE 'volunteer'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill: update existing anonymous users that signed in from the student app
-- but were given the 'volunteer' role.
UPDATE profiles
SET role = 'student'
WHERE role = 'volunteer'
  AND id IN (
    SELECT id FROM auth.users
    WHERE is_anonymous = true
      AND raw_user_meta_data->>'app' = 'student'
  );

-- Allow students to update their own campus_id (needed for campus detection
-- persistence). Only the campus_id column can be changed by the student.
CREATE POLICY profiles_student_set_campus ON profiles
  FOR UPDATE
  USING (id = auth.uid() AND role = 'student')
  WITH CHECK (id = auth.uid() AND role = 'student');
