# Work log: Uutisvahti

What was done, phase by phase, as it happened. The plan itself is in [PLAN.md](PLAN.md).
Newest entries are at the bottom of each phase. Update this as you go, not only at the end of a phase.

## Phase 0: Setup (2026-11-27)

### Done
- Copied the kit from `project-starter/` and filled in every placeholder.
- `tools/projekti.mjs`:
  - `etarepoSallittu: true`
  - Microsoft feed domains, `ntfy.sh`, `github.io` and `github.com` in `sallitutDomainit`
  - `public/icons` as the only image folder
  - Blocked `gh secret set` (the user sets the secret) and `gh repo delete|rename|archive`
  - Code rules `salaamaton-url` (https only) and `kiinnittamaton-action` (actions pinned to a SHA)
  - Own checks, and `nodeVersio: 22`
- Removed the `git push`, `git remote add` and `gh` lines from `deny` in `.claude/settings.json`, following "Allowing a remote".
- Git: `user.email` set to the GitHub noreply address, hooks installed, backups go to `~/Documents/Varmuuskopiot/Uutisvahti`.
- First commit on `main` (setup only).

### Check results
- The first commit passed the hooks (gitleaks, security rules, scanner guard).

### Problems and fixes
- `node tools/tarkista.mjs` could not be green before the first commit, because the own checks point to code that didn't exist yet. The setup was committed first, and green 2/2 was reached on the work branch.

### Open decisions
- None.

## Phase 1–2: Core, page, push, workflow (2026-11-27, branch `vaihe-1-ydin`)

### Done
- Checked the feeds live. Seven work; the Tech Community "Microsoft365CopilotBlog" board feed was empty, so it isn't used.
- Wrote the core in `src/`, the page in `public/`, the workflow, `KAYTTO.md`, and icons drawn with `scripts/make-icons.mjs`.
- 22 unit tests, plus an offline build from the fixtures.
- Live build: 1147 items from 7/7 feeds, a 0.9 MB `items.json`.
- Page checked in the browser pane at 375 px: filters, search, saving, and the Unread and Saved tabs all work, and nothing in the list is HTML from the feeds.
- Commit hook: `tarkista_projekti` runs `node --check` on staged JS files.

### Check results
- `node tools/tarkista.mjs`: **TULOS: VIHREÄ 2/2**. 115/115 kit tests, npm audit, osv-scanner, syntax check, unit tests and offline build.

### Problems and fixes
- The general Tech Community feed is mostly forum questions, so it is off in `config/rules.json`.
- Dynamics 365 and Power Platform roadmap items showed up as M365. They are now classified as "Other".
- Keyword matching found "entra" inside "central". Rules and search now match at the start of a word, with a test.
- Inline HTML tags left stray spaces ("available ."). Only block tags now become spaces.
- The commit syntax check also ran in the kit's hook tests, which use temp repos without `scripts/`. It now looks only at JS files under `src/`, `scripts/`, `test/` and `public/`.
- npm audit needs a lockfile, so a `package-lock.json` with no dependencies was added.

### Open decisions
- None. The user approved publishing on 2026-11-27.

## Phase 3: Publish (2026-11-27)

### Done
- The user set the `NTFY_TOPIC` secret themselves (`gh secret list` shows it).
- `git` stopped working once Xcode was installed, until the user accepted the Xcode license.
- Merged `vaihe-1-ydin` into `main` with `--no-ff`. The post-merge backup was made and verified.
- Checked that the history has only the noreply email. Then made the repo public, pushed `main`, and turned on Pages (source: GitHub Actions).
- Page: https://punapuu.github.io/Uutisvahti/

### Check results
- Run 1 (push): tests, build and deploy green. 1147 items from 7/7 feeds. No push, because it was the first run.
- Run 2 (by hand): it read the previous `items.json`. 1147 items kept their first-seen time and 1 new item was found. It wasn't an alert, so no push was sent.
- The live page loads on a phone-sized screen with no console errors.

### Problems and fixes
- The "Show more" button showed even when hidden, because `.more { display: block }` beat the `hidden` attribute. Added `[hidden] { display: none !important; }` on branch `korjaus-hidden` (VIHREÄ 2/2).

### Open decisions
- Merge `korjaus-hidden`: waiting for the user.
- The real ntfy push isn't checked yet. It will show with the first new alert, or with a test the user sends from the ntfy app.
- Kit agent reviews (Phase 3, step 4) haven't run yet.
