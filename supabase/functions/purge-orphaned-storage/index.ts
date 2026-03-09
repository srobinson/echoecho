// Edge Function: purge-orphaned-storage
// Scheduled nightly via Supabase cron or external scheduler.
// Deletes route-audio and route-photos objects that have no corresponding waypoints row.
//
// Invocation: POST /functions/v1/purge-orphaned-storage
// Auth: service-role key required (set SUPABASE_SERVICE_ROLE_KEY in function secrets).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKETS = ['route-audio', 'route-photos'] as const;
// Maximum objects to inspect per route folder per invocation
const FOLDER_LIMIT = 200;
const OBJECT_LIMIT = 500;

Deno.serve(async (req: Request) => {
  // Only allow POST; GET is used by health checks from the Supabase dashboard
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok' }), {
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

    // Objects are stored as {route_id}/{waypoint_id}.{ext}.
    // list('') returns virtual folder entries (one per route_id), not actual files.
    // We must list each route folder to reach the actual objects.
    const { data: folders, error: folderListError } = await supabase.storage
      .from(bucket)
      .list('', { limit: FOLDER_LIMIT });

    if (folderListError) {
      errors.push(`folder list error: ${folderListError.message}`);
      results[bucket] = { removed: 0, errors };
      continue;
    }

    for (const folder of (folders ?? [])) {
      const { data: objects, error: objListError } = await supabase.storage
        .from(bucket)
        .list(folder.name, { limit: OBJECT_LIMIT });

      if (objListError) {
        errors.push(`list error in ${folder.name}: ${objListError.message}`);
        continue;
      }

      for (const obj of (objects ?? [])) {
        // Strip the file extension to recover the waypoint UUID.
        // Path: {route_id}/{waypoint_id}.{ext} — obj.name is just the filename part.
        const waypointId = obj.name.replace(/\.[^.]+$/, '');

        const { count, error: queryError } = await supabase
          .from('waypoints')
          .select('id', { count: 'exact', head: true })
          .eq('id', waypointId);

        if (queryError) {
          errors.push(`query error for ${folder.name}/${obj.name}: ${queryError.message}`);
          continue;
        }

        if (count === 0) {
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
