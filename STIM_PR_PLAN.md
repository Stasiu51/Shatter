Title: Fix toString() crash in Crumble’s PropagatedPauliFrameLayer when iterating crossings

Overview

- Problem: PropagatedPauliFrameLayer.toString assumes each element of `crossings` is a 2‑tuple `[q1, q2]`, but `crossings` actually stores objects `{q1, q2, color}`. Calling `String(propagated)` or `String(layer)` can throw `TypeError: .for is not iterable`.
- Fix: Iterate using object destructuring `{q1, q2}` instead of array destructuring `[q1, q2]`.
- Scope: One‑line change in `glue/crumble/circuit/propagated_pauli_frames.js` plus a small unit test.

Repro (dev build)

```js
const c = Circuit.fromStimCircuit(`
QUBIT_COORDS(0,0) 0
QUBIT_COORDS(1,0) 1
MARKX(0) 0
TICK
CX 0 1
`);
const pf = PropagatedPauliFrames.fromCircuit(c, 0);
String(pf); // throws in toString() today
```

Patch (unified diff)

```diff
diff --git a/glue/crumble/circuit/propagated_pauli_frames.js b/glue/crumble/circuit/propagated_pauli_frames.js
--- a/glue/crumble/circuit/propagated_pauli_frames.js
+++ b/glue/crumble/circuit/propagated_pauli_frames.js
@@
     toString() {
         let num_qubits = 0;
         for (let q of this.bases.keys()) {
             num_qubits = Math.max(num_qubits, q + 1);
         }
         for (let q of this.errors) {
             num_qubits = Math.max(num_qubits, q + 1);
         }
-        for (let [q1, q2] of this.crossings) {
+        for (const {q1, q2} of this.crossings) {
             num_qubits = Math.max(num_qubits, q1 + 1);
             num_qubits = Math.max(num_qubits, q2 + 1);
         }
         let result = '"';
         for (let q = 0; q < num_qubits; q++) {
             let b = this.bases.get(q);
             if (b === undefined) {
```

Test (new file)

Add `glue/crumble/circuit/propagated_pauli_frames.tostring.test.js`:

```js
import {test, assertThat} from "../test/test_util.js";
import {PropagatedPauliFrameLayer} from "./propagated_pauli_frames.js";

test("propagated_pauli_frame_layer.toString_handles_object_crossings", () => {
    const layer = new PropagatedPauliFrameLayer(
        new Map([[0, 'X']]),
        new Set(),
        [{q1: 0, q2: 1, color: 'X'}],
    );
    assertThat(() => String(layer)).runsWithoutThrowingAnException();
});
```

How to Create the PR

1) Fork and clone Stim
- Fork https://github.com/quantumlib/Stim to your account.
- `git clone https://github.com/<you>/Stim`
- `cd Stim`

2) Create a branch
- `git checkout -b fix-crumble-crossings-tostring`

3) Apply the patch
- Edit the file shown in the diff: `glue/crumble/circuit/propagated_pauli_frames.js`
- Replace the destructuring loop as shown above.
- Create the new test file at `glue/crumble/circuit/propagated_pauli_frames.tostring.test.js` (content above).

4) Run tests
- Browser: `python -m http.server --directory glue/crumble &` then open `http://localhost:8000/test/test.html` — page should report all tests passed.
- Headless: `node glue/crumble/run_tests_headless.js` — should end with ‘all tests passed’.

5) Commit and push
- `git add glue/crumble/circuit/propagated_pauli_frames.js glue/crumble/circuit/propagated_pauli_frames.tostring.test.js`
- `git commit -m "crumble: fix PropagatedPauliFrameLayer.toString to handle object-shaped crossings; add test"`
- `git push -u origin fix-crumble-crossings-tostring`

6) Open Pull Request
- Title: `Crumble: fix PropagatedPauliFrameLayer.toString when crossings contain objects`
- Body:
  - What: Change toString to iterate `crossings` via `{q1, q2}` instead of `[q1, q2]`.
  - Why: `crossings` entries are objects `{q1, q2, color}`; array destructuring throws `TypeError: .for is not iterable`.
  - Repro: include the Stim snippet and `String(pf)` call (see above).
  - Tests: added `propagated_pauli_frames.tostring.test.js` to ensure toString does not throw with object-shaped crossings.

Notes

- The change is internal to toString; it doesn’t affect propagation logic or rendering. Optional: we could also print the color if desired, but that’s unrelated to this crash.

