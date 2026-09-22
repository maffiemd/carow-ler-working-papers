// Called by the editorial dashboard's "Accept & Publish" button
// (assets/js/dashboard.js, via supabase.functions.invoke). Deployed WITH
// JWT verification on (the default - no --no-verify-jwt), so only a
// request carrying a signed-in editor's session token reaches this code at
// all. The Supabase client below is additionally built from that same
// caller's token (not the service role), so every read/write here still
// goes through the `submissions`/`manuscripts` RLS policies in
// supabase/schema.sql rather than bypassing them.
//
// This function does not publish anything itself - it computes a WP
// number, creates a short-lived signed URL for the manuscript, and asks
// GitHub (via repository_dispatch) to do the actual work. See
// .github/workflows/publish-submission.yml and scripts/publish-submission.js,
// which reuse the same generate-cover-sheet.js the manual CLI publish path
// already relies on.
//
// One-time setup: see "Editorial dashboard" in the README.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const GITHUB_REPO = "maffiemd/carow-ler-working-papers";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function nextWpNumber(supabase: SupabaseClient): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from("submissions")
    .select("wp_number")
    .not("wp_number", "is", null)
    .like("wp_number", `${year}-%`);
  if (error) throw new Error(`Failed to compute WP number: ${error.message}`);

  let max = 0;
  for (const row of data ?? []) {
    const n = parseInt(String(row.wp_number).split("-")[1] ?? "0", 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${year}-${String(max + 1).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let submissionId: string | undefined;
  try {
    ({ submission_id: submissionId } = await req.json());
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!submissionId) {
    return new Response("Missing submission_id", { status: 400 });
  }

  const { data: submission, error: fetchError } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (fetchError || !submission) {
    return new Response("Submission not found", { status: 404 });
  }
  if (!submission.manuscript_path) {
    return new Response("Submission has no manuscript uploaded", { status: 400 });
  }

  const wpNumber = submission.wp_number || (await nextWpNumber(supabase));
  const slug = `${wpNumber}-${slugify(submission.title)}`;

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("manuscripts")
    .createSignedUrl(submission.manuscript_path, 600);
  if (signedUrlError || !signedUrlData) {
    return new Response(`Failed to sign manuscript URL: ${signedUrlError?.message}`, { status: 500 });
  }

  const dispatchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `token ${Deno.env.get("GITHUB_PAT")}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "publish-submission",
      client_payload: {
        submission_id: submission.id,
        slug,
        wp_number: wpNumber,
        title: submission.title,
        authors: submission.authors,
        abstract: submission.abstract ?? "",
        manuscript_url: signedUrlData.signedUrl,
      },
    }),
  });

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    return new Response(`GitHub dispatch failed (${dispatchRes.status}): ${text}`, { status: 502 });
  }

  await supabase
    .from("submissions")
    .update({ wp_number: wpNumber, status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", submission.id);

  return new Response(JSON.stringify({ ok: true, wp_number: wpNumber }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
