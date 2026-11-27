import assert from "node:assert/strict";
import { test } from "node:test";

import { inShard, JOURNEY_SECONDS, parseShard, shardPlan } from "./shards.mts";

const KEYS = Object.keys(JOURNEY_SECONDS).sort();
const SECONDS = new Map<string, number>(Object.entries(JOURNEY_SECONDS));
const TOTAL = Object.values(JOURNEY_SECONDS).reduce((sum, s) => sum + s, 0);
const LONGEST = Math.max(...Object.values(JOURNEY_SECONDS));

void test("every journey runs in exactly one shard, whatever the shard count", () => {
  for (let count = 1; count <= 8; count += 1) {
    const runs = KEYS.flatMap((key) =>
      Array.from({ length: count }, (_, index) =>
        inShard(key, { index: index + 1, count }) ? [key] : [],
      ).flat(),
    );
    assert.deepEqual(runs.sort(), KEYS, `${count} shards`);
  }
});

void test("no shard exceeds an even share by more than one journey", () => {
  for (let count = 1; count <= 8; count += 1)
    for (const keys of shardPlan(JOURNEY_SECONDS, count)) {
      const load = keys.reduce((sum, key) => sum + (SECONDS.get(key) ?? 0), 0);
      assert.ok(
        load <= TOTAL / count + LONGEST,
        `${count} shards: ${keys.join(", ")}`,
      );
    }
});

void test("a journey without a recorded time fails instead of running nowhere", () => {
  assert.throws(
    () => inShard("backend › unrecorded", undefined),
    /no recorded time/,
  );
});

void test("ANTELOPEJS_CI_SHARD parses as index/count, and empty runs everything", () => {
  assert.deepEqual(parseShard("2/4"), { index: 2, count: 4 });
  assert.deepEqual(parseShard(""), undefined);
  assert.deepEqual(parseShard(undefined), undefined);
  assert.throws(() => parseShard("5/4"), /ANTELOPEJS_CI_SHARD/);
  assert.throws(() => parseShard("0/4"), /ANTELOPEJS_CI_SHARD/);
});
