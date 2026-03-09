// Edge Function: auth-webhook
// Receives Supabase Auth events and writes to activity_log.
// Configure in Supabase dashboard: Authentication > Webhooks > Add webhook
//   URL:    https://<project>.supabase.co/functions/v1/auth-webhook
//   Events: LOGIN
//   Secret: set AUTH_WEBHOOK_SECRET in function secrets
//
// Supabase Auth signs webhook payloads with HMAC-SHA256 using the shared
// secret. The signature is sent in the x-supabase-signature header as hex.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function verifyHmacSignature(
  secret: string,
  signature: string,
  body: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes(signature),
    encoder.encode(body),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const webhookSecret = Deno.env.get('AUTH_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('[auth-webhook] AUTH_WEBHOOK_SECRET not configured');
    return new Response('Unauthorized', { status: 401 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-supabase-signature') ?? '';

  if (!signature) {
    return new Response('Unauthorized', { status: 401 });
  }

  const valid = await verifyHmacSignature(webhookSecret, signature, rawBody);
  if (!valid) {
    console.error('[auth-webhook] HMAC signature verification failed');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: {
    type?: string;
    event?: { user?: { id?: string; email?: string } };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

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
