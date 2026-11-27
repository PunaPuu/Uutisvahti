---
description: "Adapt the starter kit to a new project: fill in placeholders, set the rules, install the hooks and get the checks green."
---

Adapt this copied starter kit to the project. Project description from the user: $ARGUMENTS

1. If the description doesn't cover the project's idea, stack, conventions, remote policy and personal data, ask about what is missing. Ask whether the project handles personal data, and of whom. The default remote policy is local git with no GitHub; change it only if the user says so for this project.
2. Fill in every `{{...}}` placeholder in `CLAUDE.md`, `PLAN.md`, `WORKLOG.md`, `tools/projekti.mjs` and `.claude/agents/security-scanner.md`. Keep `CLAUDE.md` short, and put long procedures in agents or commands.
3. Set `tools/projekti.mjs` to match:
   - `henkilotiedot`: turn off only the checks the user has said the project doesn't need. Add any project-specific patterns.
   - `tarkistukset`: add the stack's lint, build and test commands. If a project has none, write the reason in `eiOmiaTarkistuksia`.
   - `sallitutKuvakansiot`: list only the folders that hold real project images, such as `public`. Never list a folder for screenshots or test output.
   - `koodisaannot`, `kielletytNimet`, `kielletytKomennot`, `tyokalut` and `nodeVersio`: add what the stack needs. For example, block the deploy command until the user decides to deploy. Every code rule needs its examples (`osuu`, `eiOsu`).
4. If the user allowed a remote for this project, follow "Allowing a remote" in `KAYTTOONOTTO.md`.
5. Add stack-specific entries to `.gitignore` and `.gitleaks.toml`. Add a lint step to `tarkista_projekti` in `.githooks/yhteiset.sh` if the stack has a linter.
6. Run `sh tools/asenna-hookit.sh` on Mac, or `powershell -ExecutionPolicy Bypass -File tools\asenna-hookit.ps1` on Windows. Ask the user where backups should go, and set the folder with `git config projekti.varmuuskopio "<folder>"`.
7. Run `node tools/tarkista.mjs` until the result is `TULOS: VIHREÄ 2/2`. Don't weaken a rule to get there; show the user anything you can't fix.
8. Make the first commit on `main`; it is the only direct commit the hooks allow. Then record the setup and the check results in `WORKLOG.md` on a work branch.

Report what you filled in, and any decision left for the user.
