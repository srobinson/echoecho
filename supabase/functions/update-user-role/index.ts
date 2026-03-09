// Edge Function: update-user-role
// Admin-only. Changes a user's role and logs the change.
//
// Role changes take effect on the next request — role is read from profiles
// at RLS evaluation time, not from the JWT. No token invalidation needed.
//
// PATCH /functions/v1/update-user-role
// Auth: Bearer <admin JWT>
// Body: { user_id: string, role: 'om_specialist' | 'volunteer' | 'student' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ROLES = ['admin', 'om_specialist', 'volunteer', 'student'] as const;
type UserRole = (typeof ALLOWED_ROLES)[number];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== 'PATCH') {
    return json({ code: 'METHOD_NOT_ALLOWED', message: 'PATCH required' }, 405);
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

  let body: { user_id?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ code: 'BAD_REQUEST', message: 'Invalid JSON body' }, 400);
  }

  const { user_id: targetUserId, role: newRole } = body;
  if (!targetUserId || typeof targetUserId !== 'string') {
    return json({ code: 'BAD_REQUEST', message: 'user_id is required' }, 400);
  }
  if (!newRole || !(ALLOWED_ROLES as readonly string[]).includes(newRole)) {
    return json({ code: 'BAD_REQUEST', message: `role must be one of: ${ALLOWED_ROLES.join(', ')}` }, 400);
  }

  // Self-lockout prevention: admin cannot demote themselves.
  if (targetUserId === callerUid) {
    return json({ code: 'SELF_LOCKOUT', message: 'Admins cannot change their own role' }, 400);
  }

  // Capture the previous role for the audit log.
  const { data: targetProfile, error: fetchError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .single();

  if (fetchError || !targetProfile) {
    return json({ code: 'USER_NOT_FOUND', message: 'Target user not found' }, 404);
  }

  const previousRole = targetProfile.role as UserRole;

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ role: newRole })
    .eq('id', targetUserId);

  if (updateError) {
    console.error('[update-user-role] Profile update failed:', updateError);
    return json({ code: 'UPDATE_FAILED', message: updateError.message }, 500);
  }

  await adminClient.from('activity_log').insert({
    actor_id: callerUid,
    action: 'user.role_change',
    target_type: 'user',
    target_id: targetUserId,
    metadata: { from: previousRole, to: newRole },
  });

  return json({ user_id: targetUserId, previous_role: previousRole, new_role: newRole }, 200);
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
