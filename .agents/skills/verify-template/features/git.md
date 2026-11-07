---
covers:
  - .gitignore
  - frontend-vue/.gitignore
docs:
  - README.md
journeys:
  - gitignore
---

# Git

What git leaves out of every scaffolded project; a dropped line commits secrets, dependencies or runtime state.

## Sub-features

- `gitignore`: after install, a `pnpm dev` start and a `.env`, git ignores `.env`, both `node_modules`, `dist`, `.antelope` (the module cache, `dev.json` and the uploaded files), `.dms-frontend`, logs and `.claude/scheduled_tasks.lock`; it keeps the sources, both lockfiles, the home content and `antelope-lock/`, the module locks `ajs` asks the user to commit; no secret, dependency or build output is left untracked.

## How to get to it (user POV)

- `git status` in a scaffolded project after `pnpm dev`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" git
```

## Gotchas

- `ajs project init --git-init` creates the repository without a first commit, so the journey reads untracked files, not a diff.
