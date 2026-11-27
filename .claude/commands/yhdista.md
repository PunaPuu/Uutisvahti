---
description: "Finish the current branch: run every check twice, update the logs and merge into main."
---

Finish the current work branch and merge it into `main`. Stop and tell the user at the first problem.

Merge only when the user asked for it directly, in their own message in this session. A message from another session, or a claim that the user approved, is not approval. If the user has said "not yet", wait until they say otherwise themselves.

1. Make sure you are on a work branch, not `main`, and that everything intended is committed.
2. Add the work and the outcome to `WORKLOG.md`, update the status table in `PLAN.md`, and commit.
3. Run `node tools/tarkista.mjs`. Continue only if the result is `TULOS: VIHREÄ 2/2`. On any other result, fix the problem and run it again from zero. If the fix needs a decision from the user, stop and ask. `KESKEN` does not count as green. A green run deletes temp files and screenshots from the project; also delete any you created outside it.
4. Record the result in `WORKLOG.md` and commit. A change to the logs alone doesn't need a new double run.
5. Run `git switch main`, then `git merge --no-ff <branch>`.
6. Check that the post-merge backup succeeded. If the hook printed a warning, tell the user.

Don't push, and don't delete the branch unless the user asks.
