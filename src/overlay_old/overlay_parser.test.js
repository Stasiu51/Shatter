import {test, assertThat} from "../../core/test/test_util.js";
import {parseOverlayFromStim} from "../overlay.js";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("overlay.parser_valid_has_no_pr001_for_style", () => {
  const txt = read(`sample_circuits/honeycomb_overlay_valid.stim`);
  const ov = parseOverlayFromStim(txt);
  const pr = (ov.diagnostics||[]).filter(d => d.code === "PR001");
  assertThat(pr.length).isEqualTo(0);
});

test("overlay.parser_invalid_reports_pr001_for_poly_instance", () => {
  const txt = read(`sample_circuits/honeycomb_overlay_invalid.stim`);
  const ov = parseOverlayFromStim(txt);
  const pr = (ov.diagnostics||[]).filter(d => d.code === "PR001");
  assertThat(pr.length > 0).isEqualTo(true);
});
