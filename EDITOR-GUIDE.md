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
Editor logs it + reviews it (currently: by hand, see "Intake" below)
        │
        ▼
Editor runs the publish script ──▶ commits + pushes _papers/*.md and pdfs/*.pdf
        │
        ▼
GitHub Actions automatically:
  • rebuilds the site (pages.yml)
  • emails every mailing-list subscriber about the new paper (notify-subscribers.yml)
        │
        ▼
Editor (optionally) posts a social announcement (see "Announcing on social media")
```

Nothing after "editor runs the publish script" requires manual intervention — the push
is what triggers everything downstream.

## Intake: logging a new submission

Right now, intake is manual: authors submit by emailing the editors directly (see
`/submit/`). There's a `/dashboard/` UI built for tracking submissions in one place and
publishing with one click, but **it isn't wired up yet** — the GitHub token it needs
hasn't been set as an Edge Function secret. Until that's done (see README → "Editorial
dashboard" → "One-time setup"), just keep track of submissions by whatever means you're
already using (email, a shared doc, etc.), and use the CLI workflow below to publish.

## Publishing an accepted paper

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

That's it — steps 1–3 are the entire publishing workflow.

## Testing before you publish for real

Don't want to spam the whole mailing list while testing? The notify-subscribers
workflow can be run by hand against a single test address:

1. Go to the repo's **Actions** tab → **Notify Subscribers** → **Run workflow**.
2. Fill in:
   - `paper_file`: path to the paper, e.g. `_papers/2026-03-lastname-topic.md`
   - `test_email`: your own address
3. Run it. Only `test_email` receives the notification — no one else does.

This is useful for checking that a paper's abstract/author formatting looks right in the
email before the real push goes out to everyone.

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

## The editorial dashboard (not live yet)

`/dashboard/` is built — sign-in, a submissions table, an "Accept & Publish" button that
would do the equivalent of the CLI steps above automatically and email the author
directly — but it's inert until the one-time setup in the README's "Editorial dashboard"
section is finished (mainly: setting a GitHub PAT as a Supabase Edge Function secret).
Once that's done, "Accept & Publish" replaces steps 1–3 above for submissions that came
in through the dashboard; the CLI workflow will still work for anything logged outside
it.

## Quick troubleshooting

| Symptom | Likely cause |
|---|---|
| Push didn't trigger a subscriber email | Check the file was added under `_papers/` in that push (edits to existing papers don't re-trigger it — only new files) |
| Site didn't update after pushing | Check the "pages" workflow run in the Actions tab for a build error (often a front-matter YAML typo) |
| Cover sheet looks wrong | Check `authors`, `title`, `date` in the paper's front matter — the cover sheet is generated entirely from front matter, not from the manuscript PDF |
| Social share card missing/wrong image | Confirm `assets/images/share-card.png` still exists and `_config.yml`'s `defaults` block still sets `image.path` — see also the Bluesky timing note above |
