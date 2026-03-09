// Edge Function: purge-orphaned-storage
// Scheduled nightly via Supabase cron or external scheduler.
// Deletes route-audio and route-photos objects that have no corresponding waypoints row.
//
// Invocation: POST /functions/v1/purge-orphaned-storage
// Auth: service-role key required (set SUPABASE_SERVICE_ROLE_KEY in function secrets).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKETS = ['route-audio', 'route-photos'] as const;
// Maximum objects to remove per invocation to bound execution time
const BATCH_SIZE = 200;

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

    // List all objects in the bucket (paginated at BATCH_SIZE)
    const { data: objects, error: listError } = await supabase.storage
      .from(bucket)
      .list('', { limit: BATCH_SIZE });

    if (listError) {
      errors.push(`list error: ${listError.message}`);
      results[bucket] = { removed: 0, errors };
      continue;
    }

    if (!objects || objects.length === 0) {
      results[bucket] = { removed: 0, errors };
      continue;
    }

    for (const obj of objects) {
      // Path convention: {route_id}/{waypoint_id}.{ext}
      // Extract the URL as stored in waypoints rows
      const objectUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/${bucket}/${obj.name}`;

      const column =
        bucket === 'route-audio' ? 'annotation_audio_url' : 'photo_url';

      const { count, error: queryError } = await supabase
        .from('waypoints')
        .select('id', { count: 'exact', head: true })
        .eq(column, objectUrl);

      if (queryError) {
        errors.push(`query error for ${obj.name}: ${queryError.message}`);
        continue;
      }

      if (count === 0) {
        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove([obj.name]);

        if (removeError) {
          errors.push(`remove error for ${obj.name}: ${removeError.message}`);
        } else {
          removed.push(obj.name);
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
