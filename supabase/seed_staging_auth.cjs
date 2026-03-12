const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');

const linkedProjectRefPath = path.join(__dirname, '.temp', 'project-ref');
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const projectRefFromUrl = supabaseUrl
  .replace(/^https?:\/\//, '')
  .replace(/\.supabase\.co\/?$/, '')
  .split('.')[0];
const projectRef =
  process.env.STAGING_PROJECT_REF ||
  projectRefFromUrl ||
  (fs.existsSync(linkedProjectRefPath) ? fs.readFileSync(linkedProjectRefPath, 'utf8').trim() : '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectRef) {
  throw new Error('STAGING_PROJECT_REF is required or supabase/.temp/project-ref must exist');
}

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const resolvedSupabaseUrl = `https://${projectRef}.supabase.co`;

const supabase = createClient(resolvedSupabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  {
    id: '00000000-0000-0000-0000-000000000099',
    email: 'seed-admin@echoecho.test',
    password: 'test1234',
    profile: {
      role: 'volunteer',
      is_active: true,
      campus_id: null,
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000098',
    email: 'seed-student@echoecho.test',
    password: 'test1234',
    profile: {
      role: 'student',
      is_active: true,
      campus_id: null,
    },
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

async function upsertProfile(user) {
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    role: user.profile.role,
    campus_id: user.profile.campus_id,
    is_active: user.profile.is_active,
  });

  if (error) throw error;
}

(async () => {
  for (const user of users) {
    const result = await upsertUser(user);
    await upsertProfile(user);
    console.log(`${result}: ${user.email}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
