// Discovers every   test_circuits/*.expected.js
// matches it with   test_circuits/<base>.stim
// and asserts parseAnnotated(stim) === expected.
//
// Assumptions:
// - Node-style ESM execution (top-level await OK).
// - Your runner collects tests registered via `test(...)` from core/test/test_util.js.

import { test } from "../../core/test/test_util.js";
import { parseAnnotated } from "./annotated_circuit.js";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, "test_circuits");

// Enumerate expected files
const expectedFiles = fs
  .readdirSync(TEST_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".expected.js"))
  .map((d) => d.name)
  .sort();

// Preload all expected modules at top level so tests can be synchronous
const cases = [];
for (const expectedName of expectedFiles) {
  const base = expectedName.replace(/\.expected\.js$/, "");
  const stimPath = path.join(TEST_DIR, `${base}.stim`);
  if (!fs.existsSync(stimPath)) {
    throw new Error(`Missing matching .stim for ${expectedName}`);
  }
  const expectedURL = pathToFileURL(path.join(TEST_DIR, expectedName)).href;
  const expectedMod = await import(expectedURL);
  const expected = expectedMod.expected ?? expectedMod.default;
  cases.push({ name: base, stimPath, expected });
}

// Register one test per pair
for (const c of cases) {
  test(`parse ${c.name}.stim matches ${c.name}.expected.js`, () => {
    const stimText = fs.readFileSync(c.stimPath, "utf8");
    const actual = parseAnnotated(stimText);
    assert.deepStrictEqual(
      actual,
      c.expected,
      `Mismatch for ${c.name}.stim`
    );
  });
}

console.log("hello2")