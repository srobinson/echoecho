// Edge Function: invite-user
// Admin-only. Sends an email invite, pre-creates the profiles row so RLS
// works from the first authenticated request (not deferred to first login).
//
// POST /functions/v1/invite-user
// Auth: Bearer <admin JWT>
// Body: { email: string, role: 'om_specialist' | 'volunteer', campus_id: string }
//
// Security: client never holds the service role key. All admin Auth API calls
// happen inside this function using the server-side service role key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_INVITE_ROLES = ['om_specialist', 'volunteer'] as const;
type InviteRole = (typeof ALLOWED_INVITE_ROLES)[number];

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

  // Verify caller identity from Bearer JWT.
  const authHeader = req.headers.get('Authorization');
  const callerUid = await resolveCallerUid(adminClient, authHeader);
  if (!callerUid) {
    return json({ code: 'UNAUTHORIZED', message: 'Valid auth token required' }, 401);
  }

  // Caller must be admin.
  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerUid)
    .single();

  if (callerProfile?.role !== 'admin') {
    return json({ code: 'FORBIDDEN', message: 'Admin role required' }, 403);
  }

  // Parse and validate body.
  let body: { email?: string; role?: string; campus_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ code: 'BAD_REQUEST', message: 'Invalid JSON body' }, 400);
  }

  const { email, role, campus_id } = body;

  if (!email || typeof email !== 'string') {
    return json({ code: 'BAD_REQUEST', message: 'email is required' }, 400);
  }
  if (!role || !(ALLOWED_INVITE_ROLES as readonly string[]).includes(role)) {
    return json({
      code: 'BAD_REQUEST',
      message: `role must be one of: ${ALLOWED_INVITE_ROLES.join(', ')}`,
    }, 400);
  }
  if (!campus_id || typeof campus_id !== 'string') {
    return json({ code: 'BAD_REQUEST', message: 'campus_id is required' }, 400);
  }

  // Send Auth invite email.
  const adminAppUrl = Deno.env.get('ADMIN_APP_URL') ?? '';
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin
    .inviteUserByEmail(email, {
      redirectTo: `${adminAppUrl}/accept-invite`,
    });

  if (inviteError || !inviteData?.user) {
    console.error('[invite-user] Auth invite failed:', inviteError);
    return json({ code: 'INVITE_FAILED', message: inviteError?.message ?? 'Invite failed' }, 500);
  }

  const newUserId = inviteData.user.id;

  // Pre-create the profiles row so RLS resolves correctly from the first request.
  // The row is created with is_active=true; the user cannot log in until they
  // accept the invite (Auth handles this via the invite token).
  const { error: profileError } = await adminClient.from('profiles').insert({
    id: newUserId,
    role: role as InviteRole,
    campus_id,
    is_active: true,
  });

  if (profileError) {
    // Roll back by deleting the created auth user so the invite is not orphaned.
    await adminClient.auth.admin.deleteUser(newUserId);
    console.error('[invite-user] Profile insert failed:', profileError);
    return json({ code: 'PROFILE_CREATE_FAILED', message: profileError.message }, 500);
  }

  // Audit log.
  await adminClient.from('activity_log').insert({
    actor_id: callerUid,
    action: 'user.invite',
    target_type: 'user',
    target_id: newUserId,
    metadata: { email, role, campus_id },
  });

  return json({ user_id: newUserId, email }, 200);
});

// ── Helpers ────────────────────────────────────────────────────────────────

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
