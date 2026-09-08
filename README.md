# CAROW Working Papers in Labor & Employment Relations

A Jekyll-based working paper series site affiliated with the [Center for Applied Research
on Work (CAROW)](https://www.ilr.cornell.edu/carow) at the Cornell University ILR School.
Circulates new research on industrial relations, employment relations, labor-management
institutions, collective bargaining, and related workplace governance topics.

## Local development

```
eval "$(rbenv init -)"
bundle install
bundle exec jekyll serve --drafts --baseurl ""
```

Then visit http://localhost:4000. (The `--baseurl ""` override keeps local links at the
site root; the production build under `_config.yml`'s `baseurl` serves from
https://maffiemd.github.io/carow-ler-working-papers/.)

## Publishing a new paper

1. Copy [`templates/new-paper.md`](templates/new-paper.md) into `_papers/`, named
   `YYYY-NN-lastname-topic.md`.
2. Fill in the front matter (WP number, title, authors, abstract, JEL codes, keywords).
3. Drop the paper's PDF into `pdfs/` and point `pdf_path` at it.
4. Once published, consider minting a DOI via [Zenodo](https://zenodo.org) and adding it
   to the front matter.
5. Commit and push to `main` — GitHub Actions builds and deploys automatically.

## Structure

- `_papers/` — one Markdown file per paper (front matter only; the PDF is the actual paper)
- `pdfs/` — the paper PDFs
- `_layouts/`, `_includes/` — templates
- `assets/` — CSS and images (CAROW/Cornell brand assets used with CAROW's permission)
- `templates/new-paper.md` — copy this to start a new paper

## Mailing list

- **Subscribers**: stored in a [Supabase](https://supabase.com) Postgres table, *not* in this
  repo. The signup form (in the footer and at `/subscribe/`) talks to Supabase directly using a
  public "anon" key that can only insert new subscribers and call one narrow "unsubscribe"
  function — it can never read the subscriber list.
- **Sending email**: a GitHub Action (`.github/workflows/notify-subscribers.yml`) runs on every
  push that adds a file under `_papers/`. It reads the new paper's front matter directly (title,
  authors, abstract, PDF link — no Jekyll build needed), reads the subscriber list from Supabase
  (using a private key only the Action has), and sends it via [Resend](https://resend.com).

### One-time setup

**1. Supabase (subscriber storage)**

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and
   run it. This creates the `subscribers` table and locks it down with Row Level Security.
3. Go to **Project Settings → API** and note down:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (keep this one secret — never put it in the site's JS or commit it)

**2. Resend (sending email)**

1. Create a free account at [resend.com](https://resend.com).
2. Create an API key.
3. Verify a sending domain under **Domains** (add the DNS records Resend gives you at your
   domain registrar), or use Resend's shared testing domain to start. Your "from" address needs
   to be on a verified domain before you can send to real subscribers.

**3. Wire the keys up**

**Public values** — edit [`_config.yml`](_config.yml) directly and commit:
- `supabase_url` → your Project URL
- `supabase_anon_key` → your anon/public key

**Secrets** — in the GitHub repo, go to **Settings → Secrets and variables → Actions**:
- *Secrets* tab, add:
  - `SUPABASE_URL` (same Project URL as above)
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`
- *Variables* tab, add:
  - `FROM_EMAIL` — e.g. `CAROW LER Working Papers <papers@yourdomain.com>`
  - `SITE_URL` — `https://maffiemd.github.io/carow-ler-working-papers` (no trailing slash)
  - `SERIES_PREFIX` — `CAROW-LER-WP`
  - `REPLY_TO` — optional, an address that can receive mail (the sending domain can't)

Once these are set, pushing a new file under `_papers/` automatically emails everyone
subscribed. Test first with `workflow_dispatch` (Actions tab → Notify Subscribers → Run
workflow) and a `test_email` input before sending to real subscribers.

## Status

Scaffolded; not yet publicly launched. Outstanding before launch:

- [ ] Confirm series editor and editorial board (see `editorial-board.md`)
- [ ] Confirm submission eligibility (open vs. CAROW-affiliated only) in `submit.md`
- [ ] Set up Supabase + Resend for the mailing list (see "Mailing list" above) — signup form
      is live but inert until `supabase_url`/`supabase_anon_key` are set
- [ ] Register with RePEc; consider SSRN mirroring
- [ ] Link to this site from ilr.cornell.edu/carow
