import {test, assertThat} from "../../core/test/test_util.js";
import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');

const ROOT = process.cwd();

test("overlay.fixtures_valid_contains_all_kinds", () => {
  const txt = read(`${ROOT}/sample_circuits/honeycomb_overlay_valid.stim`);
  // Sets
  assertThat(/##!\s+SET\s+NAME=@hex/.test(txt)).isEqualTo(true);
  // Layers
  assertThat(/##!\s+LAYER\s+NAME=UPPER/.test(txt)).isEqualTo(true);
  assertThat(/##!\s+LAYER\s+NAME=MIDDLE/.test(txt)).isEqualTo(true);
  assertThat(/##!\s+LAYER\s+NAME=LOWER/.test(txt)).isEqualTo(true);
  // Embedding
  assertThat(/##!\s+EMBEDDING\s+TYPE=TORUS\s+LX=12\s+LY=12/.test(txt)).isEqualTo(true);
  // Layouts
  assertThat(/##!\s+LAYOUT\s+Q=@hex\s+LAYER=UPPER\s+MAP=HEX/.test(txt)).isEqualTo(true);
  assertThat(/##!\s+LAYOUT\s+Q=0..8\s+LAYER=LOWER\s+MAP=GRID/.test(txt)).isEqualTo(true);
  assertThat(/##!\s+LAYOUT\s+Q=0..2\s+LAYER=MIDDLE\s+MAP=LINE/.test(txt)).isEqualTo(true);
  // QUBIT overrides
  assertThat(/##!\s+QUBIT\s+Q=2\s+X=260\s+Y=140/.test(txt)).isEqualTo(true);
  // Connections
  assertThat(/##!\s+CONN\s+SET\s+EDGES=\(0-1, 1-2\)/.test(txt)).isEqualTo(true);
  assertThat(/##!\s+CONN\s+REMOVE\s+EDGES=\(3-4\)/.test(txt)).isEqualTo(true);
  // Polygons with paired pragmas
  assertThat(/##!\s+POLY\s+LAYER=UPPER/.test(txt)).isEqualTo(true);
  assertThat(/#!pragma\s+POLYGON\(/.test(txt)).isEqualTo(true);
  // Highlights
  assertThat(/##!\s+HIGHLIGHT\s+STYLE\s+NAME=ACTIVE/.test(txt)).isEqualTo(true);
  assertThat(/##!\s+HIGHLIGHT\s+QUBITS=3,4/.test(txt)).isEqualTo(true);
  // Marks & ERR with pragmas
  assertThat(/##!\s+MARK\s+STYLE=HOT/.test(txt)).isEqualTo(true);
  assertThat(/#!pragma\s+MARK\(0\)/.test(txt)).isEqualTo(true);
  assertThat(/##!\s+ERR\s+STYLE=BAD/.test(txt)).isEqualTo(true);
  assertThat(/#!pragma\s+ERR\s+2\s+5/.test(txt)).isEqualTo(true);
});

test("overlay.fixtures_invalid_contains_expected_bad_cases", () => {
  const txt = read(`${ROOT}/sample_circuits/honeycomb_overlay_invalid.stim`);
  // QU001: QUBIT without Q= anchored to TICK
  assertThat(/##!\s+QUBIT\s+X=100\s+Y=100/.test(txt)).isEqualTo(true);
  // QU002: missing qubit id
  assertThat(/##!\s+QUBIT\s+Q=99\s+X=200\s+Y=200/.test(txt)).isEqualTo(true);
  // PR001: MARK with no following pragma
  const markIdx = txt.indexOf('##! MARK STYLE=HOT TEXT="missing pragma"');
  assertThat(markIdx >= 0).isEqualTo(true);
  const nextLines = txt.substring(markIdx, markIdx + 200);
  const hasLineStartPragma = /(^|\n)#!pragma\s+MARK/m.test(nextLines);
  assertThat(hasLineStartPragma).isEqualTo(false);
  // EMB01: ROUTE=TORUS without EMBEDDING torus params
  assertThat(/##!\s+EMBEDDING\s+TYPE=PLANE/.test(txt)).isEqualTo(true);
  assertThat(/ROUTE=TORUS/.test(txt)).isEqualTo(true);
});
