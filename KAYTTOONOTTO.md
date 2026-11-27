# Project starter kit

A reusable setup for new projects: Claude's safety hook and permissions, git hooks, security rules with their own tests, a check script that runs everything twice, and agents and commands.

## Start a new project

Requirements: Git, Node 22 or newer and gitleaks. SecurityScannerApp and its osv-scanner are required too, unless the project writes down why not (`eiSkanneria` in `tools/projekti.mjs`).

1. Copy the kit into the new project folder, including its hidden files. In an existing project, don't overwrite its files: merge `.gitignore` and `CLAUDE.md` by hand.

   `<kit folder>` is the folder this file is in. Don't use a remembered path, because a computer can have an older kit elsewhere. The current kit has `tools/projekti.mjs`. Keep the quotes, because folder names can have spaces.

   Mac:

   ```bash
   mkdir -p "<new project folder>"
   cp -R "<kit folder>"/. "<new project folder>"/
   ```

   Windows (PowerShell):

   ```powershell
   New-Item -ItemType Directory -Force "<new project folder>"
   Copy-Item "<kit folder>\*" "<new project folder>" -Recurse -Force
   ```

2. Open the folder in Claude Code and run `/aloita-projekti <what, how, stack>`. It fills in the placeholders, sets the rules, installs the hooks and runs the checks.

A fresh copy of the kit is deliberately red in `node tools/tarkista.mjs` until the placeholders and the project's own checks are filled in. This file can be deleted from the project afterwards, once you no longer need the steps below.

## What to change, and where

| What | Where |
|---|---|
| Project description and rules in plain text | `CLAUDE.md` |
| Remote, personal data, allowed image folders, code rules, own checks | `tools/projekti.mjs` |
| Secret patterns | `.gitleaks.toml` |
| Fast lint in commits | `tarkista_projekti` in `.githooks/yhteiset.sh` |
| Claude's permissions | `.claude/settings.json` |

Keep `tools/turvasaannot.mjs`, `tools/tarkista.mjs` and `.claude/hooks/turvavahti.mjs` the same across projects, so that improvements can be copied over. The hook needs `tools/turvasaannot.mjs` and `tools/projekti.mjs`, and it blocks every tool call if either one is missing.

## Allowing a remote

New projects have no remote. If the user decides otherwise for a project, make all three changes:

1. Set `etarepoSallittu: true` in `tools/projekti.mjs`. This opens the `pre-push` hook and the safety hook.
2. Remove the `git push`, `git remote add` and `gh` lines (Bash and PowerShell) from `deny` in `.claude/settings.json`.
3. Update the Remote line in `CLAUDE.md`.

## Windows status

A full Windows test passed on 2026-11-05, on one Intel PC with Windows PowerShell 5.1, with minor problems that have since been fixed. A retest on 2026-11-09 confirmed the fixes: a fresh test project set up with `/aloita-projekti` ended in `TULOS: VIHREÄ 2/2`, with 110 of 113 tests passing and the 3 expected skips. PowerShell 7 and other Windows machines still need a test.

On Windows, some tests skip themselves because they can't run there, such as those using symlinks. The check still ends green, and prints which tests were skipped.
