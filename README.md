# CAROW Working Papers in Industrial & Employment Relations

A Jekyll-based working paper series site affiliated with the [Center for Applied Research
on Work (CAROW)](https://www.ilr.cornell.edu/carow) at the Cornell University ILR School.
Circulates new research on industrial relations, employment relations, labor-management
institutions, collective bargaining, and related workplace governance topics.

## Local development

```
eval "$(rbenv init -)"
bundle install
bundle exec jekyll serve --drafts
```

Then visit http://localhost:4000.

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

## Status

Scaffolded; not yet publicly launched. Outstanding before launch:

- [ ] Confirm series editor and editorial board (see `editorial-board.md`)
- [ ] Confirm submission eligibility (open vs. CAROW-affiliated only) in `submit.md`
- [ ] Set `url` in `_config.yml` once the GitHub Pages URL (or custom domain) is known
- [ ] Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) after first push
- [ ] Register with RePEc; consider SSRN mirroring
- [ ] Link to this site from ilr.cornell.edu/carow
