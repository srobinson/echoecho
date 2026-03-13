-- Migration: storage_rls_policies
-- Adds INSERT / SELECT / DELETE policies for route-audio and route-photos buckets.
--
-- Background: storage.objects has RLS enabled but no policies were included in the
-- baseline migration (20260310000001). Without policies, every client upload fails
-- with "new row violates row-level security policy".
--
-- Path convention: all pre-save uploads land under pending/{localId}.{ext}.
-- The nightly purge-orphaned-storage Edge Function knows this prefix and cleans
-- stale objects older than 24 hours.
--
-- Role matrix:
--   INSERT  admin, om_specialist, volunteer  (any recorder)
--   SELECT  admin, om_specialist, volunteer  (full access)
--           student                          (published routes in their campus only)
--   DELETE  admin, om_specialist             (no volunteer delete)
--   UPDATE  admin, om_specialist, volunteer  (for upsert: true on re-upload)

-- ── route-audio ───────────────────────────────────────────────────────────────

CREATE POLICY "route_audio_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'route-audio'
    AND public.current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  );

CREATE POLICY "route_audio_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'route-audio'
    AND public.current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  )
  WITH CHECK (
    bucket_id = 'route-audio'
    AND public.current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  );

CREATE POLICY "route_audio_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'route-audio'
    AND (
      public.current_user_role() IN ('admin', 'om_specialist', 'volunteer')
      OR (
        public.current_user_role() = 'student'
        AND EXISTS (
          SELECT 1
          FROM public.waypoints w
          JOIN public.routes r ON r.id = w.route_id
          WHERE w.annotation_audio_url = storage.objects.name
            AND r.status = 'published'
            AND r.campus_id = public.current_user_campus()
        )
      )
    )
  );

CREATE POLICY "route_audio_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'route-audio'
    AND public.current_user_role() IN ('admin', 'om_specialist')
  );

-- ── route-photos ──────────────────────────────────────────────────────────────

CREATE POLICY "route_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'route-photos'
    AND public.current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  );

CREATE POLICY "route_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'route-photos'
    AND public.current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  )
  WITH CHECK (
    bucket_id = 'route-photos'
    AND public.current_user_role() IN ('admin', 'om_specialist', 'volunteer')
  );

CREATE POLICY "route_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'route-photos'
    AND (
      public.current_user_role() IN ('admin', 'om_specialist', 'volunteer')
      OR (
        public.current_user_role() = 'student'
        AND EXISTS (
          SELECT 1
          FROM public.waypoints w
          JOIN public.routes r ON r.id = w.route_id
          WHERE w.photo_url = storage.objects.name
            AND r.status = 'published'
            AND r.campus_id = public.current_user_campus()
        )
      )
    )
  );

CREATE POLICY "route_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'route-photos'
    AND public.current_user_role() IN ('admin', 'om_specialist')
  );
