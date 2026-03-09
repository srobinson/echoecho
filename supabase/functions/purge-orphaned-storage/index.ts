// Edge Function: purge-orphaned-storage
// Scheduled nightly via Supabase cron or external scheduler.
// Deletes route-audio and route-photos objects that have no corresponding waypoints row.
//
// Invocation: POST /functions/v1/purge-orphaned-storage
// Auth: PURGE_FUNCTION_SECRET required in Authorization header (set in function secrets).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKETS = ['route-audio', 'route-photos'] as const;
// Page size for storage list API calls. Both folders and objects paginate
// through the full listing using offset-based iteration.
const PAGE_SIZE = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  // GET is used by health checks from the Supabase dashboard
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify caller via dedicated secret. This function uses a service-role
  // client to delete storage objects, so it must not be callable by
  // arbitrary authenticated users. The CRON scheduler or admin CLI must
  // provide this secret in the Authorization header.
  const purgeSecret = Deno.env.get('PURGE_FUNCTION_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';

  if (!purgeSecret || authHeader !== `Bearer ${purgeSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const results: Record<string, { removed: number; errors: string[] }> = {};

  for (const bucket of BUCKETS) {
    const removed: string[] = [];
    const errors: string[] = [];

    // Paginate through all route folders in the bucket.
    // Storage list('') returns virtual folder entries (one per route_id).
    let folderOffset = 0;
    let hasMoreFolders = true;

    while (hasMoreFolders) {
      const { data: folders, error: folderListError } = await supabase.storage
        .from(bucket)
        .list('', { limit: PAGE_SIZE, offset: folderOffset });

      if (folderListError) {
        errors.push(`folder list error: ${folderListError.message}`);
        break;
      }

      if (!folders || folders.length === 0) break;
      hasMoreFolders = folders.length === PAGE_SIZE;
      folderOffset += folders.length;

      for (const folder of folders) {
        // Paginate through all objects within each folder.
        let objectOffset = 0;
        let hasMoreObjects = true;

        while (hasMoreObjects) {
          const { data: objects, error: objListError } = await supabase.storage
            .from(bucket)
            .list(folder.name, { limit: PAGE_SIZE, offset: objectOffset });

          if (objListError) {
            errors.push(`list error in ${folder.name}: ${objListError.message}`);
            break;
          }

          if (!objects || objects.length === 0) break;
          hasMoreObjects = objects.length === PAGE_SIZE;
          objectOffset += objects.length;

          const candidates = objects.filter((obj: { name: string }) =>
            UUID_RE.test(obj.name.replace(/\.[^.]+$/, ''))
          );

          if (candidates.length === 0) continue;

          // The `pending/` folder holds pre-save uploads keyed by local UUID.
          // These are orphaned if the save_route RPC never completed.
          if (folder.name === 'pending') {
            const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;
            for (const obj of candidates) {
              const createdAt = obj.created_at ? new Date(obj.created_at).getTime() : 0;
              if (createdAt < staleThreshold) {
                const objectPath = `pending/${obj.name}`;
                const { error: removeError } = await supabase.storage
                  .from(bucket)
                  .remove([objectPath]);
                if (removeError) {
                  errors.push(`remove error for ${objectPath}: ${removeError.message}`);
                } else {
                  removed.push(objectPath);
                }
              }
            }
            continue;
          }

          // Batch existence check: one query per page rather than per object.
          const waypointIds = candidates.map((obj: { name: string }) =>
            obj.name.replace(/\.[^.]+$/, '')
          );

          const { data: existing, error: queryError } = await supabase
            .from('waypoints')
            .select('id')
            .in('id', waypointIds);

          if (queryError) {
            errors.push(`query error for folder ${folder.name}: ${queryError.message}`);
            continue;
          }

          const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));

          for (const obj of candidates) {
            const waypointId = obj.name.replace(/\.[^.]+$/, '');
            if (!existingIds.has(waypointId)) {
              const objectPath = `${folder.name}/${obj.name}`;
              const { error: removeError } = await supabase.storage
                .from(bucket)
                .remove([objectPath]);

              if (removeError) {
                errors.push(`remove error for ${objectPath}: ${removeError.message}`);
              } else {
                removed.push(objectPath);
              }
            }
          }
        }
      }
    }

    results[bucket] = { removed: removed.length, errors };
  }

  const totalRemoved = Object.values(results).reduce((sum, r) => sum + r.removed, 0);
  const totalErrors = Object.values(results).flatMap((r) => r.errors);

  return new Response(
    JSON.stringify({ success: true, totalRemoved, results, errors: totalErrors }),
    {
      status: totalErrors.length > 0 ? 207 : 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
