---
title: "Publishing a repo that once tracked personal data: ignoring files is not enough"
date: 2026-10-04
module: repository publishing
component: development_workflow
problem_type: workflow_issue
severity: high
applies_when:
  - "A repository that held personal data in an earlier commit is about to be pushed to a public remote"
  - "Someone adds a .gitignore entry for files that are already tracked"
  - "A push, a force-push or a repo-creation command is about to run from a branch with old history"
  - "Commits will carry an author email on a public GitHub repository"
tags:
  - git
  - privacy
  - gitignore
  - github-pages
  - commit-identity
related_components:
  - tooling
---

# Publishing a repo that once tracked personal data: ignoring files is not enough

## Context

This project started as a private time-tracking repo. Its first commit already contained the personal day logs (`Planning.md` and `days/*.json`, since moved to the ignored `data/` folder), and the notebook held run outputs. Before the first public push, the owner asked to "add a gitignore to keep my personal data local". A `.gitignore` entry alone would not have kept that data out of the public repo, and several other leaks were one command away.

## Guidance

1. **Ignoring does not untrack, and does not rewrite history.** A file already committed stays tracked after it is added to `.gitignore`, and stays in every earlier commit. Stop tracking it with `git rm -r --cached <path>` (the file stays on disk), then deal with history separately.
2. **If nothing has been pushed yet, publish a fresh root commit instead of the old history.** First commit the untracking from step 1, because `commit-tree` reads the tree of `HEAD`, not the index. Then create the new commit without touching any branch: `git commit-tree 'HEAD^{tree}' -m "<message>"` prints a parentless commit, and `git branch publish <that-sha>` names it. Review `git log -p publish` and `git ls-tree -r --name-only publish` before anything leaves the machine.
3. **Create the remote repo without pushing the current branch.** `gh repo create <owner>/<name> --public` on its own creates an empty repo. Do not add `--source . --push`, which pushes the checked-out branch and its old history. Add the remote by hand and push only the clean branch: `git push origin publish:main`.
4. **Put every personal file in one ignored folder** (here `data/`), not several per-file rules, and keep the per-file rules only as a safety net for the old locations in `.gitignore`. Point script defaults, the notebook and the README at that folder.
5. **Keep personal labels out of the code too.** Names, places and habits inside default lists and mappings are personal data once the repo is public. Load them from an ignored file (here `data/app-settings.json`, imported in the app's Settings, and `data/analysis.local.json` for the notebook) and ship generic defaults.
6. **Strip notebooks before committing.** Remove cell outputs and execution counts, and clear each cell's `metadata`. The metadata holds run timestamps (`iopub.execute_input`) that outputs-only clearing leaves behind. Check with a search for dates and names in the file.
7. **Set the commit identity before the clean commit.** `gh auth login` and git's commit identity are independent: `gh` can be logged in as the right user while `git config user.email` (here from `~/.gitconfig`) belongs to another account. On a public GitHub repo the author email is visible on every commit. Get the account's no-reply address from `gh api user` (`<id>+<login>@users.noreply.github.com`), set it for this repo only with `git config user.email`, and create the clean commit afterwards.
8. **Verify the remote, not just the local state.** After the push, read the commits the remote actually has (`gh api repos/<owner>/<repo>/commits`) and fetch paths that must not be public from the Pages site: they should return 404.
9. **For Pages, publish only the app folder.** A Pages site is public even when the repo is private (private Pages needs GitHub Enterprise Cloud). The workflow uploads only `app/` (`path: app`) and deletes `app/tests` first (`rm -rf app/tests`), so test files and fixtures are not served.

## Why This Matters

A pushed public repo is copied and indexed within minutes and cannot be reliably pulled back. Each of these steps closes a different leak that the others miss: tracked files (step 1), old commits (2), the push command itself (3), labels in code (5), notebook metadata (6), the commit author email (7) and files the Pages artifact would serve (9). Steps 4 and 8 prevent a leak and verify the result rather than closing one.

## When to Apply

- Before the first push of any repo that was ever used for personal data, even if the current files look clean.
- Whenever an `--all`, `--force` or `gh repo create ... --push` command is about to run in such a repo.

## Examples

Current state of this repo (2026-10-04), to read before pushing anything else:

- `origin/main` is the clean history that starts from one parentless commit, authored with the no-reply address. Its local branch is `publish`, and new commits for the remote go there.
- The local branch `main` has 3 commits, shares no history with `publish`, and its commits carry the old Outlook address and the labels from before they were made generic. Never push it. A push of local `main` to `origin` would be rejected as unrelated history, and forcing it would publish those commits.
- The original commits that contained `Planning.md` and `days/` are no longer on any branch, but they remain as unreachable objects in `.git` until `git reflog expire --expire=now --all && git gc --prune=now` is run. Run that only after confirming the personal files exist on disk, because it destroys the old commits permanently.
- Deleting the old local branches needed the owner's own hands: the assistant's tooling blocked `git branch -D` as irreversible.

Commands used, in order:

```bash
git rm -r --cached days Planning.md          # untrack, files stay on disk
git commit -m "..."                          # commit the untracking first
git commit-tree 'HEAD^{tree}' -m "..."       # parentless commit, prints a sha
git branch publish <sha>                     # name it; nothing deleted
gh repo create AymanL/TimeAnalysis --public  # empty repo, no push
git remote add origin https://github.com/AymanL/TimeAnalysis.git
git push origin publish:main                 # only the clean branch
gh api repos/AymanL/TimeAnalysis/commits --jq '.[] | "\(.sha[0:7]) \(.commit.author.email)"'
```
