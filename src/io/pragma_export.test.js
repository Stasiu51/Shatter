import {test, assertThat} from "../../core/test/test_util.js";
import {toPragmaStim} from "./pragma_export.js";

function lines(s) { return (s || '').trim().split(/\n+/); }
function hasLineStartingWith(s, prefix) {
  return lines(s).some(l => l.startsWith(prefix));
}

test("pragma_export.converts_mark_err_polygon", () => {
  const raw = `
QUBIT_COORDS(0, 0) 0
QUBIT_COORDS(1, 0) 1
MARKX(0) 0 1
ERR 0
POLYGON(0,0.5,1,0.2) 0 1
TICK`;
  // Sanity: input contains non-pragma forms at start-of-line.
  assertThat(hasLineStartingWith(raw, 'MARK')).isEqualTo(true);
  assertThat(hasLineStartingWith(raw, 'ERR')).isEqualTo(true);
  assertThat(hasLineStartingWith(raw, 'POLYGON')).isEqualTo(true);

  const out = toPragmaStim(raw);
  assertThat(hasLineStartingWith(out, '#!pragma MARK')).isEqualTo(true);
  assertThat(hasLineStartingWith(out, '#!pragma ERR')).isEqualTo(true);
  assertThat(hasLineStartingWith(out, '#!pragma POLYGON')).isEqualTo(true);
  // And no bare forms at start of line anymore.
  assertThat(hasLineStartingWith(out, 'MARK')).isEqualTo(false);
  assertThat(hasLineStartingWith(out, 'ERR')).isEqualTo(false);
  assertThat(hasLineStartingWith(out, 'POLYGON')).isEqualTo(false);
});

test("pragma_export.works_with_first_line_ops", () => {
  // Ensure conversion works when an op appears on the first line (no leading \n).
  const raw = `MARKZ(2) 0`;
  const out = toPragmaStim(raw);
  assertThat(lines(out)[0].startsWith('#!pragma MARK')).isEqualTo(true);
});
