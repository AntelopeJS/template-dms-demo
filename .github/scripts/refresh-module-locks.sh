#!/usr/bin/env bash
set -euo pipefail

body=$1
branch=${BRANCH:-antelopejs/module-locks}
work=$(mktemp -d)

lock_folders() {
  sed -n 's|^\(antelope-lock/.*\)/[^/]*$|\1|p' | sort -u
}

git ls-tree -r --name-only HEAD -- antelope-lock | lock_folders > "$work/before"

pnpm exec ajs project modules update --fix >&2
pnpm install --no-frozen-lockfile --reporter=silent >&2
pnpm update --no-save '@antelopejs/interface-*' @antelopejs/dms @antelopejs/dms-frontend >&2
pnpm exec oxfmt package.json antelope.config.ts >&2

find antelope-lock -type f | lock_folders > "$work/after"

if cmp -s "$work/before" "$work/after"; then
  echo current
  exit 0
fi

if git fetch -q origin "refs/heads/${branch}" 2> /dev/null &&
  [ "$(git rev-parse FETCH_HEAD^)" = "$(git rev-parse HEAD)" ] &&
  git ls-tree -r --name-only FETCH_HEAD -- antelope-lock | lock_folders | cmp -s - "$work/after"; then
  echo proposed
  exit 0
fi

{
  echo "Records the latest release of each AntelopeJS module in \`antelope-lock/\` with \`ajs project modules update --fix\`, and moves \`pnpm-lock.yaml\` to the newest \`dms\`, \`dms-frontend\` and interface releases their ranges allow."
  echo
  echo "| Module | From | To |"
  echo "| --- | --- | --- |"
  comm -3 "$work/before" "$work/after" | awk -F'\t' '
    {
      side = $1 != "" ? "from" : "to"
      path = $1 != "" ? $1 : $2
      sub(/^antelope-lock\//, "", path)
      at = match(path, /@[^@]*$/)
      name = substr(path, 1, at - 1)
      if (!(name in seen)) { seen[name]; order[++count] = name }
      versions[name, side] = versions[name, side] (versions[name, side] == "" ? "" : ", ") "`" substr(path, at + 1) "`"
    }
    END {
      for (i = 1; i <= count; i++) {
        name = order[i]
        from = versions[name, "from"] == "" ? "none" : versions[name, "from"]
        to = versions[name, "to"] == "" ? "none" : versions[name, "to"]
        printf "| `%s` | %s | %s |\n", name, from, to
      }
    }'
  echo
  echo "Other files:"
  echo
  echo '```'
  git diff --stat -- . ':(exclude)antelope-lock'
  echo '```'
} > "$body"
echo changed
