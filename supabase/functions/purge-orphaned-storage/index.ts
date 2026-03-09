// Edge Function: purge-orphaned-storage
// Scheduled nightly via Supabase cron or external scheduler.
// Deletes route-audio and route-photos objects that have no corresponding waypoints row.
//
// Invocation: POST /functions/v1/purge-orphaned-storage
// Auth: service-role key required (set SUPABASE_SERVICE_ROLE_KEY in function secrets).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKETS = ['route-audio', 'route-photos'] as const;
// Maximum route folders and objects per folder to inspect per invocation
const FOLDER_LIMIT = 200;
const OBJECT_LIMIT = 500;
// Validate extracted waypoint IDs before querying the DB.
// Prevents accidental deletion of files with non-UUID names (placeholders, etc.).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

      // Filter to files whose name (sans extension) is a valid waypoint UUID.
      // Non-UUID names (e.g. .placeholder, stray files) are skipped — we only
      // know how to verify ownership for files that follow the path convention.
      const candidates = (objects ?? []).filter((obj) =>
        UUID_RE.test(obj.name.replace(/\.[^.]+$/, ''))
      );

      if (candidates.length === 0) continue;

      // Batch the existence check: one query per folder rather than one per object.
      const waypointIds = candidates.map((obj) => obj.name.replace(/\.[^.]+$/, ''));
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
