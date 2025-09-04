import {run_tests} from "./core/test/test_util.js";
import "./core/test/test_import_all.js"; // Crumble tests
import "./src/io/pragma_export.test.js"; // Shatter tests (colocated)
import "./src/panels/crumble_panel_renderer.test.js"; // Panels helpers
// import "./src/overlay/overlay_fixtures.test.js"; // Overlay fixtures exist
// import "./src/overlay/overlay_parser.test.js";   // Overlay parser unit checks
import "./src/circuit/annotated_circuit.test.js"; // Parser → integration over test_circuits fixtures


let total = await run_tests(() => {}, _name => true);
if (!total.passed) {
  throw new Error("Some tests failed");
}
