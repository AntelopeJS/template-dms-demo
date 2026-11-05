---
covers:
  - oxlint.config.ts
  - oxfmt.config.ts
  - knip.config.ts
  - tsconfig.json
  - tsconfig.config.json
  - guardrails.suppressions.json
  - renovate.json
docs:
  - AGENTS.md
  - CONTRIBUTING.md
journeys:
  - scaffold-checks
  - lint-rejects
---

# Tooling

The guardrail configuration the scaffolded project inherits: TypeScript, oxlint, oxfmt, knip, the suppression budget and Renovate.

## Sub-features

- `scaffold-checks`: the pack's journey, as in [smoke](smoke.md): `pnpm run checks` passes in the scaffolded project.
- `lint-rejects`: a `debugger` statement in `src/` fails `pnpm run lint`, `export const parsed: string = JSON.parse("1")` fails it with `typescript(no-unsafe-assignment)`, which only runs with type information (`typeAware: true`), a string typed as a number fails `pnpm run typecheck`, and an unformatted file fails `pnpm run format:check` and is named, so the configs are live.

## How to get to it (user POV)

- `pnpm run checks` before opening a pull request, as CONTRIBUTING.md and AGENTS.md say.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" tooling
```

## Gotchas

- The scaffold is a copy of this repository, so the verification layer's own files are linted, formatted and sized by the project's checks.
- `scaffold-checks` fails at `sync:check` with `@antelopejs/core` 1.20.0 and `@antelopejs/tooling-configs` 0.2.18: `ajs project init` leaves `.agents/` and `.claude/skills/` out of every scaffold (`SCAFFOLD_EXCLUDED_PATHS`), and `antelopejs-sync --check --profile template` then reports the synced skill files as drift. The other checks pass. The fix belongs to one of those two packages, not to this template.
