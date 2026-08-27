import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * Design-conformance guard (DESIGN_GUIDE.md + 1OS operator tokens).
 * The harness surfaces are scanned for the guide's prohibited patterns so
 * quality is enforced by CI, not by memory:
 *   - no stock green/emerald/rose accents (signals are --electric/--magenta);
 *   - no page-local hex colours (tokens only; explicit depth values live in
 *     globals.css, not components);
 *   - no stacked-card rounded-xl/2xl inflation on list-style surfaces;
 *   - no infinite ping/spin decorations (motion explains state).
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "components");

const SURFACES = [
  "deck",
  join("admin", "routes", "AdminDeckRoute.tsx"),
  join("admin", "routes", "AdminThreadsRoute.tsx"),
  join("admin", "routes", "AdminBriefsRoute.tsx"),
  join("admin", "routes", "AdminDossierRoute.tsx"),
];

function* surfaceFiles() {
  for (const entry of SURFACES) {
    const full = join(root, entry);
    try {
      if (entry.includes(".")) {
        yield full;
      } else {
        for (const file of readdirSync(full)) {
          if (file.endsWith(".tsx")) yield join(full, file);
        }
      }
    } catch {
      assert.fail(`Harness surface missing from the design system: ${entry}`);
    }
  }
}

const FORBIDDEN = [
  [/emerald|green-\d00|grass-|teal-|lime-/i, "stock green accents are prohibited — signals are --electric / --magenta"],
  [/bg-\[#|text-\[#|border-\[#/, "page-local hex colours are prohibited — use tokens or globals.css"],
  [/\brounded-(xl|2xl|3xl)\b/, "stacked rounded cards prohibited — shared borders and gap-px matrices at ≤ md radius"],
  [/animate-ping\b/, "infinite ping decoration prohibited — motion must explain state"],
];

test("harness surfaces stay on the 1-MI design system", () => {
  const offenders = [];
  for (const file of surfaceFiles()) {
    const source = readFileSync(file, "utf8");
    for (const [pattern, reason] of FORBIDDEN) {
      if (pattern.test(source)) offenders.push(`${file}: ${reason}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("operator tokens carry the identity, not ad-hoc classes", () => {
  // The Deck speaks in the established voice: telemetry labels and signal colour.
  const deck = readFileSync(join(root, "admin", "routes", "AdminDeckRoute.tsx"), "utf8");
  assert.match(deck, /line-label/, "telemetry labels");
  assert.match(deck, /var\(--electric\)/, "signal colour");
  assert.match(deck, /divide-y divide-white\/8/, "shared-border matrix");
  const dock = readFileSync(join(root, "deck", "ChatDock.tsx"), "utf8");
  assert.match(dock, /app-surface/, "panel chrome from globals.css");
});
