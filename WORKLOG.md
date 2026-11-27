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
- The real ntfy push isn't checked yet. It will show with the first new alert, or with a test the user sends from the ntfy app.

## Phase 3: Reviews and fixes (2026-11-27, branch `korjaus-hidden`)

### Reviews run
- **security-scanner:** PASS. 71 files, 0 findings, and the git guard is installed. The 3 app icons can't be scanned for text; they are drawn shapes.
- **gdpr-reviewer:** LOW and informational only. No cookies, analytics or outside scripts. Marks stay in the browser. Fixtures are made up. Commits carry only the noreply email.
- **vulnerability-reviewer:** 1 MEDIUM, 4 LOW, nothing high or critical.
- **ux-reviewer** and **basic-user:** several problems using the page on a phone (below).

### Fixes
- **Security:**
  - **MEDIUM, feed parser.** CDATA and comments are now taken out before items are split, so `</item>` inside a post can't end an item early or add a fake one. NUL characters are removed, so the placeholders can't be forged. Two tests added.
  - **Previous `items.json` is untrusted.** `cleanPrevious()` re-checks every field, keeps https links only, recomputes the id from the link, and drops broken items. Dates more than a day in the future fall back to the first-seen time. Sorting can't crash on bad values. Tests added.
  - **Size limit.** Feeds and the previous `items.json` are read with a 20 MB limit (`readLimited`). Test added.
  - **Preview server.** `scripts/preview.mjs` answers 400 to a malformed address instead of crashing.
  - **Accepted:** framing by other sites. GitHub Pages can't send `frame-ancestors`, and nothing important can be changed through a frame.
- **Usability and accessibility:**
  - "Show more" shows only when there is more, with the remaining count. The list ends with "That's everything – N stories".
  - On the phone, the filter chips wrap, so all of them are visible. The two filter rows are labelled "Product" and "Status", and status names are spelled out ("Generally available"). "M365" now reads "Microsoft 365", and "Other" explains what it holds.
  - A result count shows with the active filters, plus "Clear filters" above the list and in the empty state. Empty states name the filter that caused them.
  - "Mark these N as read" now has an 8-second Undo, and focus moves to Undo. Each story has its own mark read/unread button.
  - Unread stories have a "New" label and a coloured left edge.
  - Only the title and tabs stay pinned (100 px instead of 225 px). `scroll-padding-top` keeps keyboard focus clear of the header. A "Skip to stories" link was added.
  - The page follows the iPhone text-size setting (`-apple-system-body`). Tap targets are 40–44 px. The star has stronger contrast in light mode, the placeholder has stronger contrast in dark mode, and the Save button keeps one label.
  - "Updated today 13:16" now shows the day. There is a one-line description under the title and a privacy line in the footer.
- Checked in the browser pane at 375 px, in light and dark: filters, counts, clear, mark-all with undo, per-story read/unread, empty states, no sideways scroll.

### Check results
- `node tools/tarkista.mjs`: **TULOS: VIHREÄ 2/2**. 27 unit tests.

### Problems and fixes
- The preview served the old built copy of the page. Fixed by copying `public/` into the preview folder before testing.

### Open decisions
- Merge `korjaus-hidden`: waiting for the user.
- Not done, both LOW: highlighting search matches, and a SharePoint item tagged Copilot because its feed categories include Copilot.
