# AntelopeJS DMS project

This project is built on the AntelopeJS DMS (dashboard management system). The
deep, product-specific guidance is NOT in this repo: it ships as skills inside
the DMS packages themselves.

Bootstrap: run `pnpm install`, then `ajs project modules install`. Once the
dependencies are present, the packages' skills (pages & components, auth &
permissions, module authoring, dev servers, …) are synced automatically into
`.claude/skills/` by the antelopejs plugin — on session start and after
installs. If they seem missing, run `/antelopejs:sync-skills`.

Start with the synced `dms--antelopejs-dms` skill for the mental model, and
`dms--dms-dev` to run the dev servers.
