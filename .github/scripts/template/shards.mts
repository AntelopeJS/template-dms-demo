/**
 * Seconds each journey took on `blacksmith-4vcpu-ubuntu-2404`, keyed `<feature> › <id>`: run 46075268041. The first
 * journey of a process also paid for the scaffold and the MongoDB container. A journey missing here fails to register.
 */
export const JOURNEY_SECONDS = {
  "deploy › frontend-image": 134,
  "project › database-mapping": 101,
  "backend › restart": 68,
  "backend › helio-data": 56,
  "deploy › production-env": 49,
  "tooling › lint-rejects": 49,
  "frontend › dashboard-dev": 42,
  "backend › home-page": 37,
  "smoke › scaffold-checks": 35,
  "frontend › frontend-checks": 29,
  "deploy › locked-build": 28,
  "frontend › frontend-verify": 23,
  "project › onboarding": 22,
  "smoke › scaffold-dev": 21,
  "git › gitignore": 20,
  "docs › docs-claims": 15,
} as const satisfies Readonly<Record<string, number>>;

/** A CI shard, `index` of `count`, as `ANTELOPEJS_CI_SHARD` writes it: `2/4`. */
export interface Shard {
  index: number;
  count: number;
}

/** Parses `ANTELOPEJS_CI_SHARD`; unset or empty runs every journey. */
export function parseShard(value: string | undefined): Shard | undefined {
  if (value === undefined || value === "") return undefined;
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(value);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (match === null || index > count)
    throw new Error(
      `ANTELOPEJS_CI_SHARD must be <index>/<count>, not ${value}`,
    );
  return { index, count };
}

/**
 * Splits the journeys into `count` shards of near-equal recorded time: longest first, each onto the shard with the
 * least time so far. Every journey lands in exactly one shard.
 */
export function shardPlan(
  seconds: Readonly<Record<string, number>>,
  count: number,
): string[][] {
  const shards: { total: number; keys: string[] }[] = Array.from(
    { length: count },
    () => ({ total: 0, keys: [] }),
  );
  const longestFirst = Object.entries(seconds).sort(
    ([a, x], [b, y]) => y - x || a.localeCompare(b),
  );
  for (const [key, time] of longestFirst) {
    const lightest = shards.reduce((best, shard) =>
      shard.total < best.total ? shard : best,
    );
    lightest.total += time;
    lightest.keys.push(key);
  }
  return shards.map((shard) => shard.keys);
}

/** Whether the journey `key` runs in `shard`; with no shard, every journey runs. */
export function inShard(key: string, shard: Shard | undefined): boolean {
  if (!Object.hasOwn(JOURNEY_SECONDS, key))
    throw new Error(
      `${key} has no recorded time in shards.mts JOURNEY_SECONDS, so no shard runs it`,
    );
  if (shard === undefined) return true;
  return (
    shardPlan(JOURNEY_SECONDS, shard.count)[shard.index - 1]?.includes(key) ??
    false
  );
}
