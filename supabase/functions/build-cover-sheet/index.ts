// Called by the editorial dashboard's "Build cover sheet" button
// (assets/js/dashboard.js, via supabase.functions.invoke) - the first of
// the two steps that make up publishing a submission now that the final,
// cover-sheeted PDF has to live in Cornell Box rather than this GitHub
// repo (Cornell IT requirement: every link on the public site must point
// at Box, not GitHub). See "Publishing: the two-step flow" in the README.
//
// Assigns the WP number (if the submission doesn't already have one) and
// asks GitHub (via repository_dispatch) to download the manuscript, merge
// the cover sheet, and email the result to the signed-in editor - see
// .github/workflows/build-cover-sheet.yml and scripts/send-cover-sheet.js.
// The editor uploads that PDF to Box themselves, then pastes the
// resulting link into "Accept & Publish" (publish-submission), which
// writes the public page.
//
// Deployed WITH JWT verification on (the default - no --no-verify-jwt),
// so only a request carrying a signed-in editor's session token reaches
// this code at all. The Supabase client below is additionally built from
// that same caller's token (not the service role), so every
// read/write here still goes through the `submissions` RLS policies in
// supabase/schema.sql rather than bypassing them.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const GITHUB_REPO = "maffiemd/carow-ler-working-papers";

// Called directly from the browser, so it must answer the CORS preflight
// and echo these headers on every response (same reason as the other
// dashboard-facing functions).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, { ...init, headers: { ...CORS_HEADERS, ...init.headers } });
}

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return response("Unauthorized", { status: 401 });
  }
  const editorEmail = userData.user.email;
  if (!editorEmail) {
    return response("Your account has no email address to send the cover sheet to", { status: 400 });
  }

  let submissionId: string | undefined;
  try {
    ({ submission_id: submissionId } = await req.json());
  } catch {
    return response("Invalid JSON body", { status: 400 });
  }
  if (!submissionId) {
    return response("Missing submission_id", { status: 400 });
  }

  const { data: submission, error: fetchError } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (fetchError || !submission) {
    return response("Submission not found", { status: 404 });
  }
  if (!submission.manuscript_box_url && !submission.manuscript_path) {
    return response("Submission has no manuscript uploaded", { status: 400 });
  }

  const wpNumber = submission.wp_number || (await nextWpNumber(supabase));
  const slug = `${wpNumber}-${slugify(submission.title)}`;

  // Same reasoning as publish-submission: the GitHub Action curls this
  // URL directly, so it just needs to be a plain, unauthenticated,
  // directly-downloadable link. Only a submission stored before the Box
  // migration falls back to signing a Storage URL.
  let manuscriptUrl: string;
  if (submission.manuscript_box_url) {
    manuscriptUrl = submission.manuscript_box_url;
  } else {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("manuscripts")
      .createSignedUrl(submission.manuscript_path, 600);
    if (signedUrlError || !signedUrlData) {
      return response(`Failed to sign manuscript URL: ${signedUrlError?.message}`, { status: 500 });
    }
    manuscriptUrl = signedUrlData.signedUrl;
  }

  const dispatchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `token ${Deno.env.get("GITHUB_PAT")}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "build-cover-sheet",
      client_payload: {
        slug,
        wp_number: wpNumber,
        title: submission.title,
        authors: submission.authors,
        manuscript_url: manuscriptUrl,
        editor_email: editorEmail,
      },
    }),
  });

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    return response(`GitHub dispatch failed (${dispatchRes.status}): ${text}`, { status: 502 });
  }

  if (!submission.wp_number) {
    await supabase
      .from("submissions")
      .update({ wp_number: wpNumber, updated_at: new Date().toISOString() })
      .eq("id", submission.id);
  }

  return response(JSON.stringify({ ok: true, wp_number: wpNumber }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
