import {test, assertThat} from "../../core/test/test_util.js";
import {computeCanvasSize} from "./crumble_panel_renderer.js";

test("panel.computeCanvasSize_rounds_and_bounds", () => {
  const rect = {width: 123.45, height: 67.89};
  const {w, h} = computeCanvasSize(rect, 2);
  assertThat(w).isEqualTo(Math.floor(123.45 * 2));
  assertThat(h).isEqualTo(Math.floor(67.89 * 2));
});
