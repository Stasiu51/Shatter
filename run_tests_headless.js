import {run_tests} from "./core/test/test_util.js";
import "./core/test/test_import_all.js"; // Crumble tests
import "./src/io/pragma_export.test.js"; // Shatter tests (colocated)

let total = await run_tests(() => {}, _name => true);
if (!total.passed) {
  throw new Error("Some tests failed");
}
