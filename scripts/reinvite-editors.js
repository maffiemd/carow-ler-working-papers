// One-off: deletes an existing Supabase Auth user and re-invites them, but
// only when the gap between invited_at and last_sign_in_at is suspiciously
// short (< 60s) - a real human reading an email and clicking takes longer
// than that, so a sub-minute gap means something automated (an email
// security scanner prefetching the link) consumed the invite, not the
// actual invitee. Refuses to touch an account with a longer or absent gap,
// since that could be a real completed sign-in.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node reinvite-editors.js "Name <email@example.com>" [...]

const { createClient } = require("@supabase/supabase-js");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const SUSPICIOUS_GAP_MS = 60 * 1000;

async function main() {
  const entries = process.argv.slice(2);
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const entry of entries) {
    const match = entry.match(/^(.*)<(.+)>$/);
    if (!match) {
      console.error(`Skipping "${entry}" - expected format: Name <email@example.com>`);
      continue;
    }
    const name = match[1].trim();
    const email = match[2].trim().toLowerCase();

    let existing;
    let page = 1;
    while (!existing) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`listUsers failed: ${error.message}`);
      existing = data.users.find((u) => (u.email || "").toLowerCase() === email);
      if (existing || data.users.length < 200) break;
      page += 1;
    }

    if (existing) {
      const invitedAt = existing.invited_at ? new Date(existing.invited_at).getTime() : null;
      const lastSignInAt = existing.last_sign_in_at ? new Date(existing.last_sign_in_at).getTime() : null;
      const gapMs = invitedAt && lastSignInAt ? lastSignInAt - invitedAt : null;

      if (lastSignInAt && (gapMs === null || gapMs >= SUSPICIOUS_GAP_MS)) {
        console.log(
          `Skipping ${name} <${email}> - last_sign_in_at is ${gapMs}ms after invited_at, ` +
            `too long to confidently call it a scanner false-positive. Not deleting.`,
        );
        continue;
      }

      const { error: delError } = await supabase.auth.admin.deleteUser(existing.id);
      if (delError) {
        console.error(`Failed to delete existing stuck user ${email}: ${delError.message}`);
        continue;
      }
      console.log(`Deleted stuck account for ${name} <${email}> (scanner-consumed invite, gap ${gapMs}ms).`);
    }

    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, { data: { name } });
    if (inviteError) {
      console.error(`Failed to invite ${name} <${email}>: ${inviteError.message}`);
    } else {
      console.log(`Invited ${name} <${email}> - they'll get an email to set their password.`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
