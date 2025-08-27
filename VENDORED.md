# Vendored Code Tracking

This file documents code copied or adapted from the upstream Crumble implementation located in `stim_crumble/`. Treat `stim_crumble/` as a read‑only reference snapshot; vendor code into our own modules and record changes here.

## Upstream

- Source: `stim_crumble/` (see `stim_crumble/README.md` for details and authorship)
- License: Respect upstream licensing; preserve attributions in code comments and PRs.

## Scope and Ownership

- Reference only: `stim_crumble/` — do not modify files in this directory.
- Our modules: files under `core/` and `io/` (to be created as we build) are owned by this repo and may adapt upstream logic.

## Files Vendored

- Base utilities:
  - core/base/describe.js (from stim_crumble/base/describe.js)
  - core/base/equate.js (from stim_crumble/base/equate.js)
  - core/base/seq.js (from stim_crumble/base/seq.js)
- Draw helpers referenced by gates:
  - core/draw/config.js (from stim_crumble/draw/config.js)
  - core/draw/draw_util.js (from stim_crumble/draw/draw_util.js)
- Gates (verbatim):
  - core/gates/gate.js
  - core/gates/gateset.js
  - core/gates/gate_draw_util.js
  - core/gates/gateset_paulis.js
  - core/gates/gateset_resets.js
  - core/gates/gateset_hadamard_likes.js
  - core/gates/gateset_quarter_turns.js
  - core/gates/gateset_demolition_measurements.js
  - core/gates/gateset_solo_measurements.js
  - core/gates/gateset_pair_measurements.js
  - core/gates/gateset_swaps.js
  - core/gates/gateset_third_turns.js
  - core/gates/gateset_sqrt_pauli_pairs.js
  - core/gates/gateset_markers.js
  - core/gates/gateset_mpp.js
- Circuit/Propagation:
  - core/circuit/operation.js (from stim_crumble/circuit/operation.js)
  - core/circuit/layer.js (from stim_crumble/circuit/layer.js)
  - core/circuit/propagated_pauli_frames.js (from stim_crumble/circuit/propagated_pauli_frames.js)
  - core/circuit/pauli_frame.js (from stim_crumble/circuit/pauli_frame.js)
  - core/circuit/circuit.js (from stim_crumble/circuit/circuit.js)

## Local Modifications

Record deviations from upstream here (per file):

- File: core/* (above)
  - Based on: corresponding path under stim_crumble/* at local snapshot
  - Changes: none (verbatim), except we deferred adding core/circuit/{pauli_frame.js,circuit.js} which are planned next.
  - Rationale: establish a vendored baseline for gates and propagation scaffolding.

## Update Procedure

1. Copy files from `stim_crumble/` into `core/` preserving relative paths and filenames.
2. Add attribution at the top of adapted files and update this document.
3. Run tests:
   - Headless: `node stim_crumble/run_tests_headless.js`
   - Browser: `python -m http.server --directory stim_crumble` → open `/test/test.html`
4. For syntax differences, implement adapters in `io/` (`parse_shatter.js`, `save_shatter.js`) that translate to/from `core/Circuit`.
