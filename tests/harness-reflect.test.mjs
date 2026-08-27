import assert from "node:assert/strict";
import test from "node:test";
import { REFLECT_PLAYBOOK_KEYS } from "../lib/harness/reflect.ts";

test("reflection vocabulary is bounded per agent", () => {
  assert.ok(REFLECT_PLAYBOOK_KEYS["sales-harness"].length > 0);
  assert.ok(REFLECT_PLAYBOOK_KEYS.dawn.length > 0);
  for (const keys of Object.values(REFLECT_PLAYBOOK_KEYS)) {
    for (const key of keys) {
      assert.match(key, /^[a-z_]+$/, `${key} must be snake_case`);
    }
  }
});

test("agents cannot rewrite each other's vocabulary", () => {
  const sales = new Set(REFLECT_PLAYBOOK_KEYS["sales-harness"]);
  const overlap = REFLECT_PLAYBOOK_KEYS.dawn.filter((key) => sales.has(key));
  assert.deepEqual(overlap, [], "playbook vocabularies must not overlap");
});
