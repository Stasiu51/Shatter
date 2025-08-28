import {run_tests} from "./core/test/test_util.js";
import "./core/test/test_import_all.js"; // Crumble tests
import "./src/io/pragma_export.test.js"; // Shatter tests (colocated)
import "./src/panels/crumble_panel_renderer.test.js"; // Panels helpers
import "./src/overlay/overlay_fixtures.test.js"; // Overlay fixtures exist

let total = await run_tests(() => {}, _name => true);
if (!total.passed) {
  throw new Error("Some tests failed");
}
