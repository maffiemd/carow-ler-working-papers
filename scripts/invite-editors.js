// One-off script: invites the editorial dashboard's editors via Supabase
// Auth. Sends each an email with a link to set their own password - this
// script (and you, running it) never sees or sets a password.
//
// Run locally, once per new editor:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/invite-editors.js "Kortney Koebel <kortney@example.com>" "Michael Maffie <mdm283@cornell.edu>"
//
// The service role key is in the Supabase dashboard under
// Project Settings -> API -> service_role key. Never commit it or paste it
// into chat - it grants full access to the project, bypassing every RLS
// policy in supabase/schema.sql.

const { createClient } = require("@supabase/supabase-js");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const entries = process.argv.slice(2);
  if (entries.length === 0) {
    console.error('Usage: node scripts/invite-editors.js "Name <email@example.com>" [...]');
    process.exit(1);
  }

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

  for (const entry of entries) {
    const match = entry.match(/^(.*)<(.+)>$/);
    if (!match) {
      console.error(`Skipping "${entry}" - expected format: Name <email@example.com>`);
      continue;
    }
    const name = match[1].trim();
    const email = match[2].trim();

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, { data: { name } });
    if (error) {
      console.error(`Failed to invite ${name} <${email}>: ${error.message}`);
    } else {
      console.log(`Invited ${name} <${email}> - they'll get an email to set their password.`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
