#!/usr/bin/env node
// Discover every *.test.ts file under lib/, app/, and tests/ and dispatch it to
// the runner that matches its imports. node:test files run via `node --test`;
// vitest files run via `vitest run`. Exits non-zero if either runner fails.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";

const roots = ["lib", "app", "tests"];
const nodeTest = [];
const vitest = [];

for (const root of roots) {
  for await (const file of glob(`${root}/**/*.test.ts`)) {
    const src = readFileSync(file, "utf8");
    if (/from\s+["']vitest["']/.test(src)) {
      vitest.push(file);
    } else if (/from\s+["']node:test["']/.test(src)) {
      nodeTest.push(file);
    }
  }
}

nodeTest.sort();
vitest.sort();

console.log(
  `Discovered ${nodeTest.length} node:test files and ${vitest.length} vitest files`,
);

let failed = false;

if (nodeTest.length > 0) {
  console.log("\n▸ node --test");
  const result = spawnSync(
    "node",
    ["--experimental-strip-types", "--test", ...nodeTest],
    { stdio: "inherit" },
  );
  if (result.status !== 0) failed = true;
}

if (vitest.length > 0) {
  console.log("\n▸ vitest run");
  const result = spawnSync("npx", ["vitest", "run", ...vitest], {
    stdio: "inherit",
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
