const { createClient } = require('@supabase/supabase-js');

const projectRef = process.env.STAGING_PROJECT_REF;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectRef) {
  throw new Error('STAGING_PROJECT_REF is required');
}

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const supabaseUrl = `https://${projectRef}.supabase.co`;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  {
    id: '00000000-0000-0000-0000-000000000099',
    email: 'seed-admin@echoecho.test',
    password: 'test1234',
  },
  {
    id: '00000000-0000-0000-0000-000000000098',
    email: 'seed-student@echoecho.test',
    password: 'test1234',
  },
];

async function upsertUser(user) {
  const attributes = {
    id: user.id,
    email: user.email,
    password: user.password,
    email_confirm: true,
    role: 'authenticated',
    user_metadata: { email_verified: true },
    app_metadata: { provider: 'email', providers: ['email'] },
  };

  const existing = await supabase.auth.admin.getUserById(user.id);

  if (existing.error && existing.error.status !== 404) {
    throw existing.error;
  }

  if (existing.data?.user) {
    const updated = await supabase.auth.admin.updateUserById(user.id, attributes);
    if (updated.error) throw updated.error;
    return 'updated';
  }

  const created = await supabase.auth.admin.createUser(attributes);
  if (created.error) throw created.error;
  return 'created';
}

(async () => {
  for (const user of users) {
    const result = await upsertUser(user);
    console.log(`${result}: ${user.email}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
