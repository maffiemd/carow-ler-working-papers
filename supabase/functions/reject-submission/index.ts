// Called by the editorial dashboard's "Reject & notify" dialog
// (assets/js/dashboard.js, via supabase.functions.invoke) - the first of
// the two decision-letter flows alongside request-revisions, see
// ../_shared/send-author-letter.ts for what they share and how this one
// differs (status: "rejected", column: rejection_letter).
//
// Two safety valves, both handled by the shared helper:
//   - preview: true  -> sends only to the signed-in editor's own address
//                       and changes nothing on the submission.
//   - STAGING_EMAIL  -> (Supabase secret, separate from the GitHub variable
//                       of the same name) redirects the real send to that
//                       address instead of the authors.

import { handleLetterRequest } from "../_shared/send-author-letter.ts";

Deno.serve((req) =>
  handleLetterRequest(req, {
    statusValue: "rejected",
    letterColumn: "rejection_letter",
    alreadyPublishedMessage: "This paper is already published and can't be rejected here",
  })
);
