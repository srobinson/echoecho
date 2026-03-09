-- Migration: 20260309_003_storage_buckets
-- UP: Create private storage buckets and per-object RLS for route audio and photos.
-- Reversible via: supabase/migrations/down/20260309_003_storage_buckets_down.sql
--
-- NOTE: storage.buckets is a Supabase-internal table. This migration uses
-- the Supabase Storage schema directly; it works via supabase db push.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'route-audio',
    'route-audio',
    false,
    10485760,   -- 10 MB per file
    ARRAY['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/webm']
  ),
  (
    'route-photos',
    'route-photos',
    false,
    5242880,    -- 5 MB per file
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STORAGE RLS
-- Object paths follow the pattern: {route_id}/{waypoint_id}.{ext}
-- Readable if: caller is admin/om_specialist/volunteer, OR caller is a student
--   whose campus has this route published.
-- Writable only by the route's recorder or admin/om_specialist.
-- ============================================================

CREATE POLICY "route-audio read" ON storage.objects FOR SELECT USING (
  bucket_id = 'route-audio'
  AND (
    current_user_role() IN ('admin', 'om_specialist', 'volunteer')
    OR (
      current_user_role() = 'student'
      AND EXISTS (
        SELECT 1 FROM routes r
        WHERE r.id::text = (string_to_array(name, '/'))[1]
          AND r.status = 'published'
          AND r.campus_id = current_user_campus()
          AND r.deleted_at IS NULL
      )
    )
  )
);

CREATE POLICY "route-audio insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'route-audio'
  AND current_user_role() IN ('admin', 'om_specialist', 'volunteer')
);

CREATE POLICY "route-audio delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'route-audio'
  AND current_user_role() IN ('admin', 'om_specialist')
);

CREATE POLICY "route-photos read" ON storage.objects FOR SELECT USING (
  bucket_id = 'route-photos'
  AND (
    current_user_role() IN ('admin', 'om_specialist', 'volunteer')
    OR (
      current_user_role() = 'student'
      AND EXISTS (
        SELECT 1 FROM routes r
        WHERE r.id::text = (string_to_array(name, '/'))[1]
          AND r.status = 'published'
          AND r.campus_id = current_user_campus()
          AND r.deleted_at IS NULL
      )
    )
  )
);

CREATE POLICY "route-photos insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'route-photos'
  AND current_user_role() IN ('admin', 'om_specialist', 'volunteer')
);

CREATE POLICY "route-photos delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'route-photos'
  AND current_user_role() IN ('admin', 'om_specialist')
);
