// Edge Function: auth-webhook
// Receives Supabase Auth events and writes to activity_log.
// Configure in Supabase dashboard: Authentication → Webhooks → Add webhook
//   URL:    https://<project>.supabase.co/functions/v1/auth-webhook
//   Events: LOGIN
//   Secret: set AUTH_WEBHOOK_SECRET in function secrets
//
// POST /functions/v1/auth-webhook
// Auth: Supabase HMAC-signed webhook header (Authorization: Bearer <secret>)
//
// Event payload shape (Supabase Auth):
//   { type: 'LOGIN', event: { user: { id, email } }, created_at: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  // Reject if AUTH_WEBHOOK_SECRET is not configured — fail closed, not open.
  const webhookSecret = Deno.env.get('AUTH_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: {
    type?: string;
    event?: { user?: { id?: string; email?: string } };
  };

  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Only handle LOGIN events; ignore others silently.
  if (payload.type !== 'LOGIN') {
    return new Response(null, { status: 204 });
  }

  const userId = payload.event?.user?.id;
  if (!userId) {
    return new Response('Missing user.id', { status: 400 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  const { error } = await adminClient.from('activity_log').insert({
    actor_id: userId,
    action: 'auth.login',
    target_type: 'user',
    target_id: userId,
    metadata: { email: payload.event?.user?.email ?? null },
  });

  if (error) {
    console.error('[auth-webhook] Failed to write activity_log:', error);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(null, { status: 204 });
});
