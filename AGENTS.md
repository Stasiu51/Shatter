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

4.2 Layers
##! LAYER NAME=UPPER Z=1
##! LAYER NAME=LOWER Z=0


Declare before use. Z controls draw order.

4.3 Global Embedding (routing geometry)
##! EMBEDDING TYPE=PLANE
##! EMBEDDING TYPE=TORUS LX=12 LY=12


Global (not per layer). Supports PLANE | TORUS | CYLINDER | MOBIUS (today: params for TORUS).

4.4 Qubit properties
##! QUBIT Q=17 X=3.2 Y=1.0 LAYER=UPPER COLOUR=#3366FF DEFECTIVE=false TEXT="D17" MOUSEOVER="T1=22µs"


If Q omitted: apply to the qubits mentioned by the next Stim instruction (must exist) — otherwise error QU001.

If Q given: each id must appear in Stim (via a gate/measure or QUBIT_COORDS) — otherwise error QU002.

4.5 Bulk layout
##! LAYOUT Q=@data LAYER=UPPER MAP=HEX SPACING=1.2 ORIGIN=(0,0)
##! LAYOUT Q=0..15 LAYER=LOWER MAP=GRID DX=1.0 DY=0.9 ORIGIN=(0,0)
##! LAYOUT Q=@ring LAYER=UPPER MAP=CIRCLE RADIUS=6.0 ORIGIN=(5,5)
##! LAYOUT Q=0..7  LAYER=UPPER MAP=LINE START=(0,0) END=(7,0)


MAP params:

GRID: DX, DY, optional ORIGIN, COLS, ROWS, COUNT

HEX: SPACING, optional ORIGIN, COUNT

CIRCLE: RADIUS, optional ORIGIN, COUNT

LINE: START=(x,y), END=(x,y), optional COUNT

Later QUBIT can override individuals.

4.6 Connections

Set/add

##! CONN SET EDGES=(8-9, 10-11) LAYER=UPPER DROOP=0.15 COLOUR=#00AA88 DEFECTIVE=false TEXT="chain"

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

##! CONN REMOVE EDGES=(8-9) LAYER=UPPER

(don't need any style params for this, obviously)

4.7 Polygons

Styles

##! POLY STYLE NAME=A COLOUR=#88C0D0


Instances (prefer paired form for Crumble interop)

##! POLY LAYER=UPPER STYLE=A TEXT="cell A"
#!pragma POLYGON(0,0.5,1,0.2) 0 1 5 4

The pragma lists qubit ids used as polygon vertices. If absent, toStimCircuit(...,{ensurePragmas:true}) will insert a default #!pragma POLYGON(...) with a gentle color and no qubits.

Optional ALL_LAYERS=true draws on all layers.

4.8 Highlights

Styles

##! HIGHLIGHT STYLE NAME=ACTIVE COLOUR=#FF5555 OPACITY=0.88

This command declares a reusable style that can be reused in style commands

Apply

##! HIGHLIGHT QUBITS=3,4 STYLE=ACTIVE TEXT="hot"
##! HIGHLIGHT EDGES=(0-1,1-2) STYLE=5 MOUSEOVER="syndrome path"
##! HIGHLIGHT GATES=120,121 STYLE=2

Targets: QUBITS, EDGES, or GATES (instruction indices).

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

Diagnostics are returned on the Overlay as:

{ line: number; severity: 'error'|'warning'; code: string; message: string }

8) Minimal project structure
/ (static site; no server)
├─ src/
│  ├─ overlay.js         # parser + Overlay types + diagnostics + pragma interop
│  ├─ view.js            # SVG render + time slider + highlights
│  └─ main.js            # UI wiring (file input, drag-drop, save-as)
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

##! LAYER NAME=UPPER Z=1
##! EMBEDDING TYPE=TORUS LX=12 LY=12

##! LAYOUT Q=@data LAYER=UPPER MAP=HEX SPACING=80 ORIGIN=(100,100)
##! QUBIT Q=2 X=260 Y=140 LAYER=UPPER COLOUR=#3366FF TEXT="q2"

##! CONN SET EDGES=(0-1, 1-2, [0,0]-[1,3]) LAYER=UPPER ROUTE=AUTO STYLE=DROOP DROOP=0.15 COLOUR=#00AA88

##! POLY STYLE NAME=CELL COLOUR=#88C0D0
##! POLY LAYER=UPPER STYLE=CELL TEXT="tile"
#!pragma POLYGON(0,0.5,1,0.2) 0 1 2

##! MARK STYLE=HOT TEXT="X-check A"
#!pragma MARK(0) 0 1

##! ERR STYLE=BAD
#!pragma ERR 2

TICK
M 0


This file remains valid .stim, renders with our richer visuals, and drives Pauli propagation (the MARK(0) at time 0) to display which measurements/detectors are affected as you tick forward.
