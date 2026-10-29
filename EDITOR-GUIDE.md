# Editor's Guide: Running the Working Paper Series

A practical, day-to-day runbook for the two series editors (Kourtney Koebel, Michael
Maffie). This covers what to actually *do* when a paper is ready, how the mailing list
works, and how to announce a new paper on social media.

For one-time infrastructure setup (Supabase, Resend, GitHub secrets, inviting editors),
see [`README.md`](README.md) instead — this guide assumes that's already done.

## The pipeline, at a glance

```
Author emails manuscript
        │
        ▼
Editor logs it in the dashboard (/dashboard/) and reviews it
        │
        ▼
Editor clicks "Build cover sheet"
        │          ──▶ emails the editor the cover-sheeted PDF
        ▼
Editor uploads that PDF to the published-papers Box folder, copies the link
        │
        ▼
Editor clicks "Accept & Publish", pastes the Box link
        │          ──▶ commits + pushes _papers/*.md (no PDF file - it lives in Box)
        ▼
GitHub Actions automatically:
  • rebuilds the site (pages.yml)
  • emails every mailing-list subscriber about the new paper (notify-subscribers.yml)
  • emails the author(s) that their paper is live
        │
        ▼
Editor (optionally) posts a social announcement (see "Announcing on social media")
```

Every public link now has to point at Cornell Box, not this GitHub repo (a Cornell IT
requirement), which is why publishing takes those two editor steps instead of one click —
see "Publishing an accepted paper" below. Nothing after pasting the Box link requires
manual intervention. While testing any of this, turn on [staging mode](README.md#staging-mode)
first so real subscribers/authors never see a test email — see "Testing before you publish
for real" below.

## Intake: logging a new submission

Authors submit by emailing the editors directly (see `/submit/`) — there's no public
upload form. Log each submission in the dashboard at **[/dashboard/](https://workingpapers.ilr.cornell.edu/dashboard/)**
(sign in, "Add submission": title, authors, abstract, who it's assigned to, date
received, and the manuscript PDF). From there you can track status, add decision notes,
and reassign it as it moves through review — see "Publishing an accepted paper" below for
what happens once it's accepted.

## Publishing an accepted paper

**If it's logged in the dashboard**, publishing is two steps, because every link on the
public site has to point at Cornell Box, not this GitHub repo:

1. Click **Build cover sheet** on the row. This downloads the manuscript, merges the
   CAROW cover sheet, and emails you the result as a PDF attachment — nothing is
   committed or published yet.
2. Upload that PDF to the series' published-papers Box folder, set its sharing to
   "Anyone with the link can view," and copy the link.
3. Click **Accept & Publish**. A dialog asks for the WP number, that **Published PDF
   link** you just copied, and optionally a **message to the author(s)**: feedback or a
   personal note, which appears in their acceptance email under the congratulations (a
   blank line starts a new paragraph; leave it empty to send the standard email). The
   dialog also lists exactly which addresses will be emailed. Click **Publish & notify**
   and it writes the paper's page, commits and pushes, and emails the author once it's
   live, automatically.

Skip to "Mint a DOI" below once it's done.

**Otherwise** (or if you'd rather drive it from the terminal), use the CLI path — it
builds the same cover sheet, but still commits the finished PDF to this repo under
`pdfs/` rather than Box, so only use it for a paper that doesn't need to satisfy the
Box-only requirement above:

1. **Copy the template**:
   ```bash
   cp templates/new-paper.md _papers/2026-03-lastname-topic.md
   ```
   Name it `YYYY-NN-lastname-topic.md` — `YYYY-NN` should match the `wp_number` you give
   it below (e.g. the 3rd paper logged in 2026 is `2026-03`).

2. **Fill in the front matter**. Every field below is required except `forthcoming_in`
   and `doi`, which can stay blank:

   | Field | Example | Notes |
   |---|---|---|
   | `wp_number` | `"2026-03"` | Sequential within the year, used in the series label (e.g. `CAROW-LER-WP-2026-03`) |
   | `title` | `"Collective Voice in..."` | |
   | `date` | `2026-03-01` | Drives the date shown on the cover sheet and paper page |
   | `authors` | list of `{name, affiliation}` | One entry per author |
   | `status` | `working` | One of `working` / `revised` / `forthcoming` / `published` |
   | `forthcoming_in` | `""` | Journal name, if accepted elsewhere — leave blank otherwise |
   | `abstract` | 150–250 words | Shown on the paper's page and in the notification email |
   | `jel_codes` | `["J50", "J53"]` | |
   | `keywords` | `["collective bargaining", ...]` | |
   | `pdf_path` | `"/pdfs/2026-03-lastname-topic.pdf"` | Where the *finished, cover-sheeted* PDF will live — the publish script writes to this path |
   | `doi` | `""` | Fill in later, after minting one via Zenodo (see README's launch checklist) |

3. **Run the publish script**, pointing it at the author's plain manuscript (no cover
   page needed — the script builds one):
   ```bash
   cd scripts && npm install && cd ..   # first time only
   node scripts/publish-paper.js _papers/2026-03-lastname-topic.md ~/Downloads/manuscript.pdf
   ```
   This builds a CAROW-branded cover sheet from the front matter, merges it onto the
   manuscript, writes the result to `pdf_path`, then **commits and pushes both files**.
   The push is what publishes the paper — there's nothing else to run.

   Add `--no-push` if you want to build and commit locally first and inspect the
   generated PDF before it goes live; run `git push` yourself when ready.

4. **Mint a DOI** (optional, can be done later): register the published PDF with
   [Zenodo](https://zenodo.org) and add the DOI to the paper's front matter in a
   follow-up commit.

That's it — the CLI path is just those steps; the dashboard path is the two clicks above.

## Testing before you publish for real

There's a real subscriber list and real submitted authors in the database — don't test
against them. Two options:

**Staging mode (recommended)** — set the `STAGING_EMAIL` GitHub Actions repo variable to
your own address (Settings → Secrets and variables → Actions → Variables), and *every*
real publish — CLI or dashboard, mailing-list blast or author-acceptance email — redirects
to just that one address instead of real people, while everything else (site rebuild,
cover sheet, Supabase status) runs for real. **Delete the variable before actually
launching**, or every real paper will only ever email you. See "Staging mode" in the
README for the full explanation.

**One-off resend test** — to just check how an *already-published* paper's notification
email looks, without touching staging mode: Actions tab → **Notify Subscribers** → **Run
workflow** → fill in `paper_file` (e.g. `_papers/2026-03-lastname-topic.md`) and
`test_email` (your address) → Run. Only `test_email` receives it.

## The mailing list ("the listserv")

There's no real listserv software involved — "the listserv" is:

- **Subscriber storage**: a Supabase Postgres table. People sign up via the form in the
  site footer or at `/subscribe/`, which talks to Supabase directly (no server in the
  loop). Editors never see or manage this list directly except by querying Supabase's
  Table Editor if needed.
- **Sending**: the `notify-subscribers.yml` GitHub Action, triggered automatically by
  any push that adds a file under `_papers/`. It reads the new paper's front matter
  (no site rebuild needed to do this), pulls every subscribed address from Supabase, and
  sends via [Resend](https://resend.com).
- **Unsubscribing**: handled by a link in every email (`/unsubscribe/`) — fully
  self-service, no editor action needed.

**If an email didn't seem to go out**, check two places:
1. **Actions tab** → the "Notify Subscribers" run for that push — the logs will show an
   error if Resend or Supabase rejected the request.
2. **Resend dashboard** → Emails — shows delivery status per recipient, including
   bounces.

## Announcing on social media (Bluesky)

The site has a branded share-card image (`assets/images/share-card.png`) wired into
every page via `_config.yml`, so pasting any page's link into Bluesky, Twitter, LinkedIn,
etc. shows a proper preview card (title, tagline, Cornell/UofT crests) instead of a bare
link.

To post an announcement:

1. Write a short post — plain text is fine, something like:
   > New working paper: "[Title]" by [Author]. [one-line hook from the abstract].
   > https://workingpapers.ilr.cornell.edu/papers/2026-03-lastname-topic/
2. Paste the paper's URL (or the homepage URL for a general announcement) into the
   composer.
3. **Wait a second or two for the preview thumbnail to actually render** in the compose
   box before hitting Post. Bluesky fetches the link's preview image in the background;
   if you post before that finishes, your post goes out with no image at all, and
   there's no way to add one after the fact — you'd have to delete the post and redo it.

If a post genuinely goes out with no image even after waiting, the likely cause is
Bluesky's link-preview cache being cold for that exact URL for the very first time (rare
after the first person anywhere has posted it) — just try again a few seconds later.

## The editorial dashboard

**[workingpapers.ilr.cornell.edu/dashboard/](https://workingpapers.ilr.cornell.edu/dashboard/)**
— sign-in, a submissions table, and "Build cover sheet" / "Accept & Publish" buttons that
do the equivalent of the CLI steps above and email the author directly once it's live —
see "Publishing an accepted paper" above for the two-step flow.

**Signing in for the first time**: you'll get an invite email with a 6-digit code, not a
clickable link — many institutional email systems (Cornell's and UofT's included)
auto-scan links before you ever see them, which silently burns a one-time link's token.
On the sign-in page, click **"Have an invite code instead?"** and enter your email, the
code, and a password of your choosing.

**Rejecting a submission**: click **Reject & notify** on the row. A dialog opens with a
pre-drafted letter (greeting with the authors' names, a standard decline, and your
sign-off) that you edit freely; replace the bracketed placeholder line with your specific
feedback, or delete it. The dialog lists exactly who will be emailed. Use **Send preview
to me** to see it in your own inbox first, then **Send rejection letter** (it asks you to
confirm, and can't be undone). The submission is marked rejected and a copy of the letter
is kept. If no author email is on file, the button becomes **Mark as rejected** and
nothing is emailed. Changing the Status dropdown to "rejected" by itself does *not* send
a letter.

**Editing a submission**: click **Edit** on any row to change its title, authors,
abstract, or date received, or to replace the manuscript PDF (leave the file field empty
to keep the current one). Status, assignee, and decision notes are edited right in the
table. For a paper that's already published, Edit only changes the dashboard record, not
the live paper page or PDF.

**Hiding and removing submissions**: **Hide** takes a row off the main list (it's
reversible, and nothing is deleted); tick **Show hidden** at the top to see hidden rows
and **Unhide** them. Use this for decluttering or when an author withdraws a paper.
If an author wants their paper actually gone, hide it first, then use **Delete
permanently** on the hidden row, which removes the record and its manuscript file for
good. Deleting a published paper here does not take it off the live site; that means
removing its `_papers/<slug>.md` file from the repo (and, for a paper published before
the Box migration, its `pdfs/<slug>.pdf` too) — the PDF itself, for anything published
since, lives in Box and needs removing there separately if it should come down too.

The CLI workflow still works too, for anything logged outside the dashboard.

## Quick troubleshooting

| Symptom | Likely cause |
|---|---|
| A real paper's emails only went to you | `STAGING_EMAIL` repo variable is still set from testing — delete it |
| Push didn't trigger a subscriber email | Check the file was added under `_papers/` in that push (edits to existing papers don't re-trigger it — only new files) |
| Site didn't update after pushing | Check the "pages" workflow run in the Actions tab for a build error (often a front-matter YAML typo) |
| Cover sheet looks wrong | Check `authors`, `title`, `date` in the paper's front matter — the cover sheet is generated entirely from front matter, not from the manuscript PDF |
| Social share card missing/wrong image | Confirm `assets/images/share-card.png` still exists and `_config.yml`'s `defaults` block still sets `image.path` — see also the Bluesky timing note above |
