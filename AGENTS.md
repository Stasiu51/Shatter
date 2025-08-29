AGENTS.md

A richer, browser-only Stim circuit editor/visualizer—Crumble-compatible, with animated Pauli mark propagation and layered layout metadata that keeps files valid .stim.

Crumble website: https://algassert.com/crumble

Crumble source: https://github.com/quantumlib/Stim/tree/main/glue/crumble

1) Introduction

This project delivers a static, hostable website (no server) that opens plain or augmented .stim files, renders them, and simulates how Pauli “marks” propagate through the circuit—showing which detectors and observables fire and which errors appear.

We extend .stim using comment-only directives (so files remain valid Stim), and we interoperate with Crumble by pairing our directives with Crumble’s #!pragma lines (e.g. #!pragma MARK(k) …, #!pragma ERR …, #!pragma POLYGON …). If a paired pragma is missing, we can synthesize a default one on save to preserve compatibility.

Key ideas

Zero backend: all parsing, rendering, and propagation run in the browser.

Non-forking syntax: extensions live in comments and won’t break Stim tools.

Interop first: we read and write Crumble’s #!pragma … forms.

Deterministic propagation: simulate Pauli evolution round-by-round and surface detectors/observables triggered over time.

2) What the app does

Open a .stim circuit (drag-and-drop or file picker).

Parse Stim + our overlay directives into a clean Overlay model.

Render: qubits, connections, polygons; time axis via TICK.

Propagate Pauli marks (X/Y/Z) through the circuit, stepwise:

Show evolving Pauli support on qubits.

Indicate which measurements flip, which DETECTORs fire, and which observables are toggled.

Visualize ERR regions and POLYGON annotations.

Round-trip back to valid .stim, optionally inserting any missing paired Crumble pragmas.

Validate common authoring mistakes and display concise diagnostics.

Developer notes (current repo)

- Repository layout:
  - `stim_crumble/`: upstream Crumble snapshot (read-only).
  - `core/`: exact vendored copy of Crumble used by the app/tests (read-only).
  - `src/` + `index.html`: minimal demo UI (plain ESM).
  - `core/test/`, `core/run_tests_headless.js`: test harness and specs.
- Running tests:
  - Headless: `node core/run_tests_headless.js` (skips browser-only tests).
  - Browser: `python -m http.server --directory core` → open `/test/test.html`.
- Marks: use typed markers (`MARKX/MARKY/MARKZ(index)`) for propagation; generic `MARK` is visual only.

Design docs

- `ui_design_doc.md`: product/UI description and screenshots (what we aim to replicate/extend).
- `ui_implementation_doc.md`: one-to-one mapping from UI elements to Crumble source files/functions (how it works today), with panel draw flow details.

Shatter Plan (Design & Implementation)

Goals

- Multi-panel views filtering “sheets” (Z-stacked visual layers) while reusing Crumble for parsing, editing, gates, and propagation.
- Mouse-first editing with a small selection-mode indicator and an inspector; no new shortcuts needed initially.
- Preserve Crumble’s circuit view; extend only the panel(s) and property editing.

Core Reuse & Fork Strategy

- Keep `stim_crumble/` pristine; use it for Circuit/Layer/Operation, gates, propagation, and editor state.
- Fork panel renderer only (draw logic) with attribution to control draw order and filtering:
  - Copy `stim_crumble/draw/main_draw.js` → `shatter/draw/panel_draw.js` (internal use).
  - Optionally copy `stim_crumble/draw/timeline_viewer.js` later if we want sheet-filtered timelines.

Rendering Order (per panel)

- Our polygons (advanced, from overlay)
- Our connections (with optional “stubs” if an endpoint is off-panel)
- Squares (qubit boxes/grid)
- Gates (filtered by sheet)
- Pauli marks (propagated polygons/bars/ovals, filtered by visible qubits)
- Detectors/observables

Sheets & Panels

- Each element (qubit, gate, polygon, connection) belongs to exactly one sheet; panels choose which sheets to display (checkbox UI per panel).
- Up to four panels; fixed layouts: 1 (full), 2 side-by-side, 3 side-by-side, 4 quadrants.
- All panels show synchronized views of the same circuit/selection; selection in one panel selects in all.

Selection Model

- Single-type selection at a time: gate | connection | qubit | polygon.
- Hit-testing follows draw order ("whatever is on top"):
  - No Alt: consider all four kinds; pick the topmost under cursor.
  - Alt held: consider only qubit, connection, polygon (exclude gates); pick the topmost of those. This lets you reach items under a gate.
- Selection chip near each panel shows current kind; single-select switches mode automatically; invalid multi-select (mixed kinds) flashes the chip red and ignores the incompatible items.

Selection Indicator UI

- A small inline widget near each panel shows four adjacent boxes (left→right):
  - [Gate] [Qubit] [Connection] [Polygon]
- The leftmost "Gate" box stands alone; the three boxes to its right are grouped by a continuous under‑brace style bracket labeled "Alt" centered beneath the group (see `debugging_pictures/1.png`). This indicates Alt enables selection among these three while excluding gates.
- The active kind is highlighted; when multi-select attempts to mix kinds, the whole widget briefly flashes red.

Inspector & Edits

- Inspector edits update the source of truth immediately:
  - Stim-backed (e.g., qubit coords) → commit via EditorState (toStimCircuit/fromStimCircuit) → re-render.
  - Shatter-only visuals (polygons, connections, highlights, sheets, fallback colors) → update overlay model → re-render; Stim updated on export as `##!` lines.

Polygons (supersede Crumble)

- Do not draw Crumble `POLYGON` markers at runtime; draw Shatter polygons only.
- Export: ensure each `##! POLY …` has a paired `#!pragma POLYGON(…)` with a fallback color so Crumble can render something outside Shatter.

Crossings

- Associate each crossing to its controlled gate via `layer.id_ops.get(q1)` at that layer.
- Draw the crossing only on panels where that gate is visible (sheet-filtered) and place crossings after gates.

Pauli Marks per Panel

- Reuse `PropagatedPauliFrames` once per layer change (cache shared across panels).
- Per panel: filter bases by visible qubits; shape rules:
  - ≥3 visible → polygon; 2 → pointy oval; 1 → single-qubit bar/square; 0 → skip.
- Errors: draw only for visible qubits in that panel.

Connections

- Draw under squares; if only one endpoint is visible, render a short “stub” toward the hidden endpoint (using qubit positions).

Performance & Sync

- One `EditorState` and overlay model shared; one propagation cache reused by all panels.
- Re-render all panels on any selection/inspector change; handle HiDPI and resize per canvas.

Export/Import Semantics

- Stim remains the source of truth; overlay stored as `##!` blocks in export.
- Always pair `##! POLY` with `#!pragma POLYGON` (fallback color) in export; no need to strip pragmas before parsing—Shatter simply does not call Crumble’s polygon drawer.

Timeline

- Single global timeline panel is docked to the right of all panels. It renders via Crumble's `draw/timeline_viewer.js` with high-DPI scaling. Timeline is resizable via a vertical drag handle and collapsible; width/collapsed state persist in localStorage. A persistent header button toggles show/hide.
- Keep Crumble timeline as-is initially (unfiltered); consider fork only if we need sheet-filtered timelines later.

Current UI Decisions (Repo State)

- Layout: left multi-panel grid + single right-hand global timeline. Panels and timeline are independent; the timeline stays visible across layout changes.
- Timeline controls: vertical resizer between panels and timeline; collapse/expand via a button in the timeline header and an always-present toggle in the top-right of the main header. Width and collapsed state persist across reloads.
- Selection indicator: four-box widget [Gate] [Qubit] [Connection] [Polygon]. The right three are grouped by a curved under‑brace with the label "Alt" centered beneath the group; the brace width is tuned to the boxes (see debugging_pictures/1.png and follow-ups). Active kind is highlighted.
- Visual style: large containers (panels, timeline) use square corners; small controls retain rounded corners.
- Subbar toolbar: a full‑width toolbar below the global header includes an editable circuit name and tool buttons (Import/Export/etc.).
- Editable circuit name: shows the imported filename (without .stim/.txt), can be clicked/edited, sanitized, and persisted; export uses `<name>.stim`.
- Status bar: fixed bottom bar split into left/right halves. Left shows the most recent message (info/warning/error dot). Right shows the most recent warning/error unless the latest message is itself a warning/error (in which case it is blank). Clicking the bar downloads a single consolidated status log.
- Warning capture: during parse, Crumble warnings emitted via `console.warn` are captured and surfaced in the status bar and log.
- Timeline rendering: uses Crumble's timeline viewer with propagated marks and scrubber; renders after Import; re-renders on window resize and timeline width changes. Current layer defaults to 0 (Q/E layer stepping to be wired next).

Testing

- Keep Crumble tests intact (headless and browser) under `core/` — treat as read‑only.
- Colocate Shatter tests next to the modules they cover, following Crumble’s convention (e.g., `src/io/pragma_export.test.js`).
- Run all tests via the top‑level `run_tests_headless.js` (executes Crumble’s suite and our colocalized tests). Browser-only specs remain under `core/test/test.html`.

Open Questions (defer)

- Theme/appearance (fonts, colors), sheet-specific styles, and timeline filtering can be layered on later.

Incremental Delivery Plan (Top‑Down)

Milestone 0 — Baseline

- Dev: Ensure `stim_crumble/` vendored; `core/` mirrors upstream; tests green (headless + browser page).
- Manual: Open `core/test/test.html` and confirm “All tests passed”.

Milestone 1 — Skeleton Layout (no logic)

- Dev: Add PanelManager shell with fixed presets (1, 2, 3, 4 panels) and selection indicator widget (non‑functional). Canvases are blank.
- Dev: Add a global Timeline container docked to the right of the panel area (single shared timeline across all panels). Include an empty timeline canvas/DOM shell now; actual rendering comes later.
- Manual:
  - Switch layouts; canvases resize cleanly (CSS + DPR).
  - Selection indicator renders; switching layouts preserves its UI.
  - Timeline column remains visible and sized correctly regardless of panel layout.
- Unit: None (layout only).

Milestone 2 — Crumble View (single panel)

- Dev: Render Crumble timeline on the global right canvas using Crumble's timeline viewer; parse/import via `Circuit.fromStimCircuit` and show warnings. Panels remain placeholders for now.
- Manual:
  - Load sample Stim via Import; timeline renders with wires/gates/propagation; warnings appear in the status bar. Resize/collapse timeline; rendering stays crisp (HiDPI).
  - Export shows Stim with pragmas (ERR/MARK/POLYGON) as per upstream; exported filename matches editable name.
- Unit: Run core headless tests.

Milestone 3 — Multi‑Panel Manager (Crumble only)

- Dev: Add N panels (1–4) drawing the same Crumble state (no filtering yet); selection is shared (click in any panel highlights in all); timeline remains single.
- Manual:
  - Switch layouts; ensure redraw; selection/hover sync across panels; performance acceptable.
- Unit: None (integration).

Milestone 4 — Overlay Model + Inspector Shell

- Dev: Implement in‑memory overlay model (sheets, polygons, connections, highlights) and a minimal Inspector (sheets per panel, per‑element sheet assignment). No custom drawing yet.
- Manual:
  - Toggle panel sheet checkboxes; model updates; selection chip shows kind; invalid multi‑select flashes red.
- Unit: Overlay parse/save round‑trip (##! blocks) with snapshots.

Milestone 5 — Forked Panel Draw (filters only)

- Dev: Copy `draw/main_draw.js` → `shatter/draw/panel_draw.js`. Add isVisibleQ/op filters; remove Crumble polygon pass; keep connections/polygons disabled for now.
- Manual:
  - Assign sheets to qubits/gates; panels filter gates/marks by sheet; marks render per visible subset.
- Unit: Small tests for filter helpers (visible qubits/ops) and mark shape selection (≥3/2/1/0).

Milestone 6 — Underlays (Polygons, Connections)

- Dev: Draw Shatter polygons (under squares) and connections (under squares) in the fork at the underlay stage; implement connection stubs.
- Manual:
  - Create polygons/connections via Inspector; verify draw order (under squares) and sheet filtering; stubs appear when endpoints are off‑panel.
  - Export includes paired `##! POLY` + fallback `#!pragma POLYGON`.
- Unit: Geometry helpers for stubs; overlay export consistency tests.

Milestone 7 — Selection & Hit‑Testing (full)

- Dev: Implement hit‑tests and selection mode (gate | qubit | connection | polygon); Alt excludes gates; selection chip updates; Inspector edits apply live (Stim or overlay).
- Manual:
  - Click/Shift‑click/Ctrl‑click per kind; Alt to reach items under gates; invalid mixed multi‑select flashes red.
  - Inspector edits qubit coords (Stim), sheet assignments (overlay), colors/text (overlay).
- Unit: Hit‑test unit tests for each kind; Stim write‑through smoke tests (qubit move).

Milestone 8 — Crossings Tied to Gates

- Dev: Associate crossings to gate ops and draw them only on panels where the gate is visible; place crossings after gates.
- Manual:
  - Verify crossings appear/disappear per panel based on gate visibility; confirm color matches basis.
- Unit: Crossing→gate mapping tests on small circuits.

Milestone 9 — Polish & QA

- Dev: DPI scaling; minor styling; error states; performance pass (cache PropagatedPauliFrames once per tick).
- Manual:
  - Resize windows; fast layer scrubbing; large circuits still responsive; export/import unchanged Stim correctness.
- Unit: Overlay parse/save edge cases; perf micro‑benchmarks if needed.

3) Agent roles (for Codex)
Parser Agent

Implement parseOverlayFromStim(text) that:

Parses Stim instructions and computes time t (incremented by TICK).

Parses our ##! … directives into an Overlay structure.

Imports Crumble pragmas (#!pragma MARK… | ERR | POLYGON) and pairs them with the immediately preceding ##! MARK | ERR | POLY for extra metadata (layer/style/text).

Emits diagnostics (see §7).

Simulation Agent (Pauli propagation)

Provide a browser-side propagation engine:

 A small TypeScript Clifford tableau engine local Pauli conjugation and measurement flips.

API:

prepare(circuitText): { ir, meta } — preprocess for stepping.

propagate({ marksAtTimeT }) -> { nextMarks, flippedMeasurements, firedDetectors, toggledObservables } — one logical tick.

runAll({ initialMarks }) -> timeline[] — produce full timeline for the viewer.

Renderer Agent

Map Overlay + Simulation state to SVG:

Qubits (position, color, layer, defective dimming, labels/tooltips).

Connections (straight or drooped; torus shortest path when embedding is TORUS).

Polygons (fill/stroke via styles).

Highlights (temporary via DUR ticks).

Mark propagation (e.g., outline qubits with basis-coded halo).

Detectors/observables (icons/overlays on the relevant time steps).

Interop Agent

Implement:

fromStimCircuit(text) → Overlay (parser front door).

toStimCircuit(text, overlay, { ensurePragmas }) → text that inserts default #!pragma lines when a paired ##! POLY|MARK|ERR has no immediate pragma.

App Agent

Static single-page app (no build step): plain ESM modules, file picker, drag-and-drop, zoom/pan, time slider, diagnostics panel, “Save as .stim”.

Run parsing and propagation on the main thread, mirroring Crumble’s approach.

Note: The demo’s propagation printout formats layers explicitly instead of using Crumble’s `toString()` to avoid relying on internal stringifier details.

QA Agent

Fixtures for:

Dangling directives.

Missing paired pragmas.

Qubit anchor and existence checks.

TORUS vs PLANE routing decisions.

Propagation sanity cases (single-gate conjugations; detection events).

4) Language Extensions (Spec)

All extensions are comment lines beginning with ##! so Stim ignores them.
Keywords are UPPERCASE (Stim style). Attachment rule: a directive applies to the next Stim instruction (or TICK) and becomes visible when t_view ≥ t_attach. Highlights can be temporary using DUR=<ticks>. Last-write-wins for the same target/property.

4.1 Sets
##! SET NAME=@data VALUE=0..143


VALUE: comma list and a..b ranges. (Sets are not allowed inside edge lists.)

4.2 Sheets (directive name remains LAYER for compatibility)
##! SHEET NAME=UPPER Z=1
##! SHEET NAME=LOWER Z=0


Declare before use. Z controls draw order.

4.3 Global Embedding (routing geometry)
##! EMBEDDING TYPE=PLANE
##! EMBEDDING TYPE=TORUS LX=12 LY=12


Global (not per layer). Supports PLANE | TORUS | CYLINDER | MOBIUS (today: params for TORUS).

4.4 Qubit properties
##! QUBIT Q=17 X=3.2 Y=1.0 SHEET=UPPER COLOUR=#3366FF DEFECTIVE=false TEXT="D17" MOUSEOVER="T1=22µs"


If Q omitted: apply to the qubits mentioned by the next Stim instruction (must exist) — otherwise error QU001.

If Q given: each id must appear in Stim (via a gate/measure or QUBIT_COORDS) — otherwise error QU002.

4.5 Bulk layout
##! LAYOUT Q=@data SHEET=UPPER MAP=HEX SPACING=1.2 ORIGIN=(0,0)
##! LAYOUT Q=0..15 SHEET=LOWER MAP=GRID DX=1.0 DY=0.9 ORIGIN=(0,0)
##! LAYOUT Q=@ring SHEET=UPPER MAP=CIRCLE RADIUS=6.0 ORIGIN=(5,5)
##! LAYOUT Q=0..7  SHEET=UPPER MAP=LINE START=(0,0) END=(7,0)


MAP params:

GRID: DX, DY, optional ORIGIN, COLS, ROWS, COUNT

HEX: SPACING, optional ORIGIN, COUNT

CIRCLE: RADIUS, optional ORIGIN, COUNT

LINE: START=(x,y), END=(x,y), optional COUNT

Later QUBIT can override individuals.

4.6 Connections

Set/add

##! CONN SET EDGES=(8-9, 10-11) SHEET=UPPER DROOP=0.15 COLOUR=#00AA88 DEFECTIVE=false TEXT="chain"

Params (specified here, most are then applicable to other commands):
EDGES: which qubits to pair up.
LAYER: which layer to render on.
DROOP (optional, default=0): whether to render as a straight line or whether to droop (-ve value) or be suspended upwards (+ve value).
DEFECTIVE (optional, default=false): a visual cue to show the connection as disfunctional
TEXT (optional, default=""): an always-visible label
MOUSEOVER (optional, default=""): a label visible on mouseover
COLOUR (optional default=[some kinda grey]): obvious

Note that two qubits cannot be connected on more than one layer. The solution here will be to render multiple layers into the same frame.

Remove

##! CONN REMOVE EDGES=(8-9) SHEET=UPPER

(don't need any style params for this, obviously)

4.7 Polygons

Styles

##! POLY STYLE NAME=A COLOUR=#88C0D0


Instances (prefer paired form for Crumble interop)

##! POLY SHEET=UPPER STYLE=A TEXT="cell A"
#!pragma POLYGON(0,0.5,1,0.2) 0 1 5 4

The pragma lists qubit ids used as polygon vertices. If absent, toStimCircuit(...,{ensurePragmas:true}) will insert a default #!pragma POLYGON(...) with a gentle color and no qubits.

Optional ALL_LAYERS=true draws on all layers.

4.8 Highlights

Styles

##! HIGHLIGHT STYLE NAME=ACTIVE COLOUR=#FF5555 OPACITY=0.88

This command declares a reusable style that can be reused in style commands

Apply

##! HIGHLIGHT QUBITS=3,4 STYLE=ACTIVE TEXT="hot"
##! HIGHLIGHT EDGES=(0-1,1-2) STYLE=PATH MOUSEOVER="syndrome path"
##! HIGHLIGHT GATE STYLE=ACTIVE
##! HIGHLIGHT GATE QUBITS=0,1 STYLE=ACTIVE TEXT="two-qubit gate"

Targets: QUBITS, EDGES, or GATE.

Gate highlighting semantics

- Attachment: applies to the next gate instruction in the file (skipping comments, blank lines, and TICK). No opaque IDs.
- Optional filter: if `QUBITS=` is specified, the highlight applies only if the next gate’s targets include all listed qubits; otherwise the highlight is ignored with a diagnostic (HL002).
- Missing anchor: if the next non-trivia line is not a gate, a diagnostic is emitted (HL001).

4.9 Marks & Errors (paired with Crumble pragmas)
##! MARK STYLE=HOT TEXT="X-check A"
#!pragma MARK(0) 5 6

##! ERR STYLE=BAD
#!pragma ERR 7 9


MARK/ERR have no layer; they render wherever the qubits are.

If the pragma is missing, saving with ensurePragmas:true inserts a default:

#!pragma MARK (no basis/index),

#!pragma ERR.

5) Pauli propagation semantics

What is a “mark”?
A MARK denotes an inserted Pauli on given qubits at the directive’s attached time t_attach. The basis is taken from the pragma (MARKX, MARKY, MARKZ), and index acts as a grouping label.

Propagation model

At each step, conjugate the current Pauli error through the next gates:

Clifford conjugation rules (e.g., H X H = Z, S X S† = Y, CX: X⊗I → X⊗X, CZ: X⊗I → X⊗Z, etc.).

For measurements, a Pauli that anti-commutes with the measured basis flips the outcome. Record:

flipped measurement indices,

which DETECTORs (parity of referenced rec[...]) are triggered,

which OBSERVABLE_INCLUDEs are toggled.

Repeat until the end of circuit or until user stops stepping.

Implementation notes

Reuse Crumble’s ESM primitives for propagation (PauliFrame, PropagatedPauliFrames, Circuit, Gate) directly on the main thread to ensure parity with Crumble and avoid bespoke tableau or worker infrastructure.

UI behavior

At time t, render:

current Pauli support (e.g., colored halo per basis X/Y/Z),

highlighted gates acting at t,

highlighted qubits,

detector icons where triggers occur,

annotations for ERR regions and polygons.

6) Round-tripping & pairing

On load:

Parse Stim and our ##! lines.

Parse #!pragma lines; if a #!pragma line is immediately preceded by our ##! POLY|MARK|ERR, attach extra metadata (layer/style/text/mouseover) from the ##! line.

On save:

Return the original text, but if ensurePragmas:true, ensure each ##! POLY|MARK|ERR has an immediate paired pragma line; if not, insert a default pragma with safe defaults.

7) Diagnostics (examples)

QU001 — QUBIT without Q= did not anchor to a Stim instruction that mentions qubits (no next-line qubits).

QU002 — QUBIT Q=<id> references a qubit not present in Stim (no gate/measure use and no QUBIT_COORDS).

PR001 — Paired ##! POLY|MARK|ERR has no following #!pragma and ensurePragmas is off.

EMB01 — CONN SET … ROUTE=TORUS but no EMBEDDING TYPE=TORUS with LX,LY.

HL001 — HIGHLIGHT GATE had no gate to attach to (next non-trivia line is not a gate).
HL002 — HIGHLIGHT GATE with QUBITS filter didn’t match the next gate’s targets.

Diagnostics are returned on the Overlay as:

{ line: number; severity: 'error'|'warning'; code: string; message: string }

8) Minimal project structure
/ (static site; no server)
├─ src/
│  ├─ overlay.js           # parser + Overlay types + diagnostics + pragma interop
│  ├─ view.js              # SVG render + time slider + highlights
│  ├─ shatter_main.js      # app shell orchestrator (layout, IO, module wiring)
│  ├─ timeline/
│  │  ├─ renderer.js       # draws timeline; propagated frames; content/scroll maths
│  │  └─ controller.js     # timeline UI (zoom, scroll, collapse, resizer)
│  ├─ status/logger.js     # status bar + downloadable log
│  ├─ name/editor.js       # editable circuit name (sanitize + persist)
│  └─ layers/keyboard.js   # layer stepping keyboard handler (Q/E, arrows)
├─ index.html            # loads ESM modules directly
├─ samples/*.stim        # example circuits
└─ package.json          # { "type": "module" } (optional)


Local dev

- Open `index.html` directly or serve statically, e.g. `python -m http.server --directory .`.


Hosting: serve the static files (GitHub Pages / Netlify / Vercel). All parsing/simulation is client-side.

9) Roadmap

Full detector/observable timeline tooling (filter, jump to next firing).

Performance tuning if needed; otherwise mirror Crumble’s single‑threaded approach.

Export of overlay JSON sidecar (optional).

Additional embeddings (cylinder/möbius visualization helpers).

Unit tests for grammar, pairing, propagation invariants.

10) License & attribution

Keep a permissive license (MIT/Apache-2.0).

Attribute Stim/Crumble author Craig Gidney.

11) Implementation & Vendoring (Crumble reuse)

Treat `stim_crumble/` as a read‑only upstream snapshot. Vendor the following into our code when building features, keeping local edits minimal and documented:

- Propagation and circuit core: `stim_crumble/circuit/{pauli_frame.js, propagated_pauli_frames.js, operation.js, layer.js, circuit.js}`
- Gate catalog (as needed): `stim_crumble/gates/**`
- Base helpers used by the above: `stim_crumble/base/{equate.js, seq.js, describe.js}`

Parsing/saving: adapt our overlay (`##! …`) to/from `Circuit` without forking the core Stim grammar. Pair overlays with Crumble’s `#!pragma` lines (`POLYGON`, `ERR`, `MARK`) and keep markers basis‑agnostic at the pragma level (`MARK(index)`), with basis chosen in the UI.

Testing: run Crumble’s headless tests to detect regressions (`node stim_crumble/run_tests_headless.js`).

Appendix: Example (paired pragmas + overlays)
##! SET NAME=@data VALUE=0..5
QUBIT_COORDS(0, 0) 0
QUBIT_COORDS(1, 0) 1
QUBIT_COORDS(1, 1) 2
QUBIT_COORDS(1, 2) 3
QUBIT_COORDS(1, 3) 4
QUBIT_COORDS(2, 0) 5
QUBIT_COORDS(2, 1) 6
QUBIT_COORDS(2, 2) 7

##! SHEET NAME=UPPER Z=1
##! EMBEDDING TYPE=TORUS LX=12 LY=12

##! LAYOUT Q=@data SHEET=UPPER MAP=HEX SPACING=80 ORIGIN=(100,100)
##! QUBIT Q=2 X=260 Y=140 SHEET=UPPER COLOUR=#3366FF TEXT="q2"

##! CONN SET EDGES=(0-1, 1-2, [0,0]-[1,3]) SHEET=UPPER ROUTE=AUTO STYLE=DROOP DROOP=0.15 COLOUR=#00AA88

##! POLY STYLE NAME=CELL COLOUR=#88C0D0
##! POLY SHEET=UPPER STYLE=CELL TEXT="tile"
#!pragma POLYGON(0,0.5,1,0.2) 0 1 2

##! MARK STYLE=HOT TEXT="X-check A"
#!pragma MARK(0) 0 1

##! ERR STYLE=BAD
#!pragma ERR 2

TICK
M 0


This file remains valid .stim, renders with our richer visuals, and drives Pauli propagation (the MARK(0) at time 0) to display which measurements/detectors are affected as you tick forward.
