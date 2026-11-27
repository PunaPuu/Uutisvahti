# Uutisvahti: plan

## Status

Update this table at each merge to `main`.

| Phase | State | Date | Checks |
|---|---|---|---|
| 0 Setup | done (first commit on `main`) | 2026-11-27 | hooks passed |
| 1–2 Core, page, push, workflow | merged and published | 2026-11-27 | VIHREÄ 2/2 |
| 3 Publish and review | published; agent reviews not run yet | 2026-11-27 | 2 workflow runs green |

Day-by-day details are in [WORKLOG.md](WORKLOG.md).

## Context

The user wants a single place for all Azure, Microsoft 365 and Copilot news: new features, previews, GA, rollouts and retirements, readable on the iPhone (Wi-Fi and mobile data) and on the PC.

GitHub Actions fetches Microsoft's public RSS feeds every hour, classifies and filters them, publishes a static page to GitHub Pages, and sends ntfy push alerts for new items that match the rules.

## Decisions

- **2026-11-27: no native iOS app.** Xcode can't be installed on this Mac, and free signing needs a reinstall every 7 days.
- **2026-11-27: web page + ntfy push** instead of the app.
- **2026-11-27: hosting on GitHub Actions + Pages,** so the page works on mobile data and the PC can be off.
- **2026-11-27: remote exception.** This is a personal project, so it lives on GitHub at `PunaPuu/Uutisvahti`. The repo is made **public**, because free Pages needs that. Commits use the GitHub noreply email.
- **2026-11-27: rule-based filtering first.** AI summaries come later.
- **2026-11-27: no npm dependencies.** The project uses its own small RSS/Atom parser instead of `fast-xml-parser`, which would bring 6 packages into a public repo.
- **2026-11-27: the general Tech Community feed is off by default.** It is mostly forum questions.
- **2026-11-27: Dynamics 365 and Power Platform are classified as "Other".**
- **2026-11-27: fixtures are made-up feeds,** shaped like the real ones, so the public repo copies no Microsoft text.

## Phases

Each phase is its own branch, merged to `main` only after `TULOS: VIHREÄ 2/2`.

### Phase 0: Setup
Kit copied and adapted, hooks installed, backup folder set, first commit on `main`.

### Phase 1: Fetch and filter core
- `src/parse.mjs`: RSS and Atom parsing.
- `src/classify.mjs`: product and status.
- `src/dedupe.mjs`: duplicate removal.
- `src/rules.mjs`: rules from `config/rules.json`.
- `src/build.mjs`: merges with the previously published `items.json`, keeps failed feeds' items, and refuses to publish if the previous site can't be read.
- Tests use fixtures and no network.

### Phase 2: Page, push, workflow
- `public/`: mobile-first page with filters, search, unread and saved marks, light and dark themes, and home-screen icons.
- `src/notify.mjs`: one batched ntfy push per run, none on the first run.
- `.github/workflows/paivitys.yml`: runs hourly with actions pinned to SHAs, then deploys to Pages.
- `KAYTTO.md`: user guide.

### Phase 3: Publish and review
1. Merge to `main`, add the remote, make the repo public, push.
2. Turn on Pages with the "GitHub Actions" source. The user sets `NTFY_TOPIC` with `gh secret set`.
3. Run the workflow by hand, check the page and that a second run sends no duplicate push.
4. Run the kit agents (`vulnerability-reviewer`, `gdpr-reviewer`, `security-scanner`, `ux-reviewer`, `basic-user`) and fix what they find.

### Later
- AI summaries with Claude.
- Message Center through Graph.
- A Teams digest.
