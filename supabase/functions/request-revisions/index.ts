// Called by the editorial dashboard's "Request revisions" dialog
// (assets/js/dashboard.js, via supabase.functions.invoke) - the second of
// the two decision-letter flows alongside reject-submission, see
// ../_shared/send-author-letter.ts for what they share and how this one
// differs (status: "revision_requested", column: revision_letter).
// Unlike rejection this isn't a one-shot terminal decision - an editor can
// send another round of revision requests later, which just overwrites
// revision_letter with the latest one.
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
    statusValue: "revision_requested",
    letterColumn: "revision_letter",
    alreadyPublishedMessage: "This paper is already published and can't be sent back for revisions",
  })
);
