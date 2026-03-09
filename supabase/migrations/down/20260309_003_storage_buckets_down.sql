-- DOWN: Reverse 20260309_003_storage_buckets

DROP POLICY IF EXISTS "route-photos delete" ON storage.objects;
DROP POLICY IF EXISTS "route-photos insert" ON storage.objects;
DROP POLICY IF EXISTS "route-photos read"   ON storage.objects;
DROP POLICY IF EXISTS "route-audio delete"  ON storage.objects;
DROP POLICY IF EXISTS "route-audio insert"  ON storage.objects;
DROP POLICY IF EXISTS "route-audio read"    ON storage.objects;

DELETE FROM storage.buckets WHERE id IN ('route-audio', 'route-photos');
