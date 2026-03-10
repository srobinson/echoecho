ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_campus_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_campus_id_fkey FOREIGN KEY (campus_id)
REFERENCES public.campuses(id) ON DELETE CASCADE ON UPDATE CASCADE;
