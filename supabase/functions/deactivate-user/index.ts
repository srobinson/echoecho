// Edge Function: deactivate-user
// Admin-only. Immediate two-step deactivation:
//   1. auth.admin.updateUserById({ ban_duration: '876600h' }) — blocks new token issuance
//   2. profiles.is_active = false                             — invalidates existing JWTs via RLS
//
// current_user_role() in ALP-942 queries profiles WHERE is_active = true.
// A deactivated user's role resolves to null, failing all RLS policies on the
// next request — before the JWT's natural expiry.
//
// POST /functions/v1/deactivate-user
// Auth: Bearer <admin JWT>
// Body: { user_id: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ code: 'METHOD_NOT_ALLOWED', message: 'POST required' }, 405);
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  const authHeader = req.headers.get('Authorization');
  const callerUid = await resolveCallerUid(adminClient, authHeader);
  if (!callerUid) {
    return json({ code: 'UNAUTHORIZED', message: 'Valid auth token required' }, 401);
  }

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerUid)
    .single();

  if (callerProfile?.role !== 'admin') {
    return json({ code: 'FORBIDDEN', message: 'Admin role required' }, 403);
  }

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ code: 'BAD_REQUEST', message: 'Invalid JSON body' }, 400);
  }

  const { user_id: targetUserId } = body;
  if (!targetUserId || typeof targetUserId !== 'string') {
    return json({ code: 'BAD_REQUEST', message: 'user_id is required' }, 400);
  }

  // Self-lockout prevention.
  if (targetUserId === callerUid) {
    return json({ code: 'SELF_LOCKOUT', message: 'Admins cannot deactivate their own account' }, 400);
  }

  // Step 1: ban the auth user to block new token issuance.
  // '876600h' = 100 years (GoTrue's closest approximation to a permanent ban).
  // ban_duration: 'none' would *remove* a ban — do not use it here.
  const { error: banError } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    { ban_duration: '876600h' }
  );
  if (banError) {
    console.error('[deactivate-user] Auth ban failed:', banError);
    return json({ code: 'BAN_FAILED', message: banError.message }, 500);
  }

  // Step 2: set is_active = false so current_user_role() returns null,
  // invalidating existing JWTs at the RLS level immediately.
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({ is_active: false })
    .eq('id', targetUserId);

  if (profileError) {
    console.error('[deactivate-user] Profile update failed:', profileError);
    return json({ code: 'PROFILE_UPDATE_FAILED', message: profileError.message }, 500);
  }

  await adminClient.from('activity_log').insert({
    actor_id: callerUid,
    action: 'user.deactivate',
    target_type: 'user',
    target_id: targetUserId,
    metadata: {},
  });

  return json({ user_id: targetUserId, deactivated: true }, 200);
});

async function resolveCallerUid(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
