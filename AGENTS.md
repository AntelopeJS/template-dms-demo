# AntelopeJS DMS project

This project is built on the AntelopeJS DMS (dashboard management system). The
deep, product-specific guidance is NOT in this repo: it ships as skills inside
the DMS packages themselves.

Bootstrap: see Getting started in `README.md` (`pnpm install`, then
`pnpm exec ajs project modules install`, then `pnpm dev`).

The skills reach the project through a sync from its installed packages: the
DMS skills from `@antelopejs/dms` once `pnpm install` has run, and the `dms-*`
modules' skills once `pnpm dev` has downloaded them into `.antelope/cache`.
Claude Code reads them from `.claude/skills/`, Codex from `.agents/skills/`.
When they seem missing:

- Claude Code: run `/antelopejs:sync-skills`; `/antelopejs:skills` lists what
  is synced. The antelopejs plugin syncs on session start and after installs,
  and `.claude/settings.json` offers to install it when you trust this folder.
- Codex: run `npx -y github:AntelopeJS/agent-skills sync --target codex` from
  the project root (`list` instead of `sync` shows what is synced), then
  restart Codex if a skill does not appear.

Start with the `dms` skill for the mental model and its routing, and follow
`dms-best-practices` when building pages and blocks. `dms-project` runs the
dev servers, and `dms-frontend` covers the `ajs dms` CLI.

The backend lives in `src/` and the Vue frontend module in `frontend-vue/`,
which is a separate package with its own ESLint, Prettier and Vitest setup —
run its checks with `pnpm --dir frontend-vue lint` and `pnpm --dir frontend-vue
test`, not with the root oxlint/oxfmt.
