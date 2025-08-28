This document maps each UI element in the Crumble design (as described in ui_design_doc.md) to the concrete implementation in the vendored source under `stim_crumble/`. It uses “layer” for timeslices (Crumble’s term). Where helpful, it explains the runtime flow and data dependencies so we can confidently extend the panel later.

Reference snapshot

- Source of truth: files in `stim_crumble/` (vendored from glue/crumble). All path references below are relative to `stim_crumble/`.

Conventions

- Panel = a left-side canvas showing a single timeslice (k) and the half-step Pauli frame (k+0.5).
- Timeline = a single global right-hand “circuit through time” view shared by all panels.
- “Markers” = typed user marks (MARKX/Y/Z), detectors, observables, and polygons (POLYGON).
- Propagation = computed Pauli frames used for mark rendering (PropagatedPauliFrames).

# Layout & Containers (skeleton)

- The app root uses a two-area layout: a multi-panel grid on the left and a fixed-width global timeline column on the right.
- The PanelManager only manages the left grid (1/2/3/4 canvases). The timeline has its own single canvas/DOM container, independent of panel count.
- Milestone 1 includes the empty timeline container, with rendering wired in later milestones.

# A1: Panel (timeslice viewer)

Entry points and data flow

- Draw loop: `draw/main_draw.js` exports `draw(ctx, snap)`.
  - Called from `stim_crumble/main.js` when `editorState.obs_val_draw_state` changes.
- Snapshot: `draw/state_snapshot.js` class `StateSnapshot` holds:
  - `circuit: Circuit`, `curLayer: number`, `focusedSet: Map<string,[x,y]>`, `timelineSet`, mouse coordinates and drag box preview.
  - Constructed in `editor/editor_state.js` via `toSnapshot()`; drawing never mutates it.
- Circuit model: `circuit/*` (Circuit/Layer/Operation) contain the gates and markers per layer.
- Propagated frames per mark index:
  - In `draw/main_draw.js`, before drawing, compute `propagatedMarkerLayers: Map<int, PropagatedPauliFrames>`:
    - User marks (0..N-1): `PropagatedPauliFrames.fromCircuit(circuit, mi)` for each declared index (derived by scanning markers for max index).
    - Detectors/Observables: resolve measurement mids via `circuit.collectDetectorsAndObservables(false)`, then batch-compute `PropagatedPauliFrames.batchFromMeasurements(circuit, batch)`. Detectors are keyed at `~mi`; observables at `~mi ^ (1<<30)`.

Rendering order (high level)

1) Background polygons (POLYGON markers).
   - Determine the last layer ≤ current k that has a polygon (`lastPolygonLayer`).
   - Sort those markers by target count and draw them behind everything via `op.id_draw(...)`.
2) Grid and coordinate labels.
   - X and Y labels every 0.5 units; draw a white square at each lattice point (dimmer alpha when unused/never operated).
3) Crossing highlights (from propagation at integer steps).
   - For each `PropagatedPauliFrames` entry: at layer k, draw colored thick connectors between `q1` and `q2` for each crossing (X=red, Y=green, Z=blue).
4) Gates in the current layer.
   - Iterate `circuit.layers[k].iter_gates_and_markers()` and call `op.id_draw(qubitDrawCoords, ctx)` for each non-POLYGON op.
5) Panel-side mark shapes (from propagation at half-steps).
   - Polygons for multi-qubit products: build the vertex list from `bases` at `k+0.5` and fill (low alpha) then stroke; uniform basis: red/green/blue; mixed: black.
   - Per-qubit rectangles/bars for single-qubit sites: computed via `gates/gateset_markers.js: marker_placement(mi, key, hitCount)`; color by basis.
   - Error highlights (non-deterministic events): from `p.atLayer(k).errors` → magenta stroke around the mark glyph, then black fill inside.
6) Selections and hover overlays.
   - Timeline-linked highlight (yellow) for `snap.timelineSet`; selection (blue) for `snap.focusedSet`; hover (red square) for the current mouse; box selection preview (blue rectangle) while dragging.
7) Timeline (right-hand, global) is drawn via `draw/timeline_viewer.js: drawTimeline(...)` into a single shared canvas, separate from the per-panel draw calls.
8) Scrubber (summary bar) across the bottom shows per-layer hints (see B2).

Key functions and responsibilities

- `draw/main_draw.js`:
  - Computes `propagatedMarkerLayers` for user marks and detector/observable propagations.
  - Converts circuit coords → canvas coords via `c2dCoordTransform` using pitch/offsets from `draw/config.js`.
  - “Used” vs “operated” qubits: builds `usedQubitCoordSet` and `operatedOnQubitSet` to dim unused squares by reducing `ctx.globalAlpha`.
  - `drawCrossMarkers`: for crossings at integer layer k.
  - `drawMarkers`: for mark shapes at half-step k+0.5 and error highlights at k.
  - Selection/hover/box highlight drawing using values from `snap`.
  - Summary/scrubber drawing at the end.
- `gates/gateset_markers.js`:
  - `marker_placement(index, key, hitCount)`: returns `(dx, dy, wx, wy)` offsets/sizes per mark index; used by both panel and timeline to place bars/squares consistently.
  - Drawer for MARKX/Y/Z ops draws wedge/triangle overlays (distinct from propagated mark shapes).
- `circuit/propagated_pauli_frames.js`:
  - Produces `PropagatedPauliFrames` for user marks and detector/observable sets (forward and backward propagation). The panel consumes these snapshots at k (errors/crossings) and k+0.5 (bases).

Notes on “termination” glyphs vs propagated shapes

- Triangles and large squares come from the MARK gate drawers (when a MARK op is on the current layer). Propagated shapes (polygons/bars) reflect the Pauli product’s state at k+0.5 and are independent of MARK overlay glyphs.

# A2: Pauli mark selection

Input and focus mechanics

- Event sources: `stim_crumble/main.js` registers `keydown/keyup/mousedown/mousemove/mouseup` on the canvas.
- Keys → chords: `keyboard/chord.js` captures held keys/modifier state into a `ChordEvent` with `.chord` (a set), `.altKey/.ctrlKey/.shiftKey/...`, plus an “inProgress” flag.
- Chords → actions: `main.js: makeChordHandlers()` maps chord strings (e.g., "2+x", "p+y") to bound functions on `EditorState`.
- Focused selection: `editor/editor_state.js`
  - `changeFocus(newFocus, unionMode, xorMode)`: manages `focusedSet` as a map of "x,y" → [x,y]. Shift = union; Ctrl = XOR; plain click = replace.
  - `currentPositionsBoxesByMouseDrag(parityLock)`: returns an array of 0.5-lattice boxes within the drag rectangle (with parity locks if Alt is held). Used for box-select visual preview and finalize on mouseup.

Mark creation and updates

- Infer-and-mark (digit key alone or with inferred basis):
  - `markFocusInferBasis(preview, markIndex)`: determines an appropriate basis per selected qubit from the current layer’s operations (M/MR/R; MX/MRX; MY/MRY; MXX/MYY/MZZ; or MPP special case). If mixed/unforced, defaults to Z.
  - Writes `MARKX/Y/Z(markIndex)` operations at selected qubits into the current layer with `layer.put(...)`.
- Explicit basis (e.g., "3+x"):
  - `writeGateToFocus(preview, GATE_MAP.get('MARKX').withDefaultArgument(markIndex))`: places typed MARK ops at selected qubits.
- Remove/clear marks:
  - `clearMarkers()`: deletes all MARKX/Y/Z ops from all layers.
- From propagation into MARK ops:
  - `addDissipativeOverlapToMarkers(preview, markIndex)`: scans before/after bases from `PropagatedPauliFrames.fromCircuit(...)` at the current layer and creates MARK ops overlapping dissipative events (resets, demolition measurements, pair measurements, and MPP with a scoring rule).

Detectors/observables integration

- Create from current tracked product:
  - `writeMarkerToDetector(preview, markIndex)` / `writeMarkerToObservable(preview, markIndex)`: Derives transitions at dissipative sites for the tracked product and inserts DETECTOR / OBSERVABLE_INCLUDE markers at those positions; removes existing MARK ops for that index in the process.
- Move existing detector/observable into a tracked product:
  - `moveDetOrObsAtFocusIntoMarker(preview, markIndex)`: searches for a DETECTOR/OBS whose propagation touches the current timeslice’s focused area; if found, uses its forward/backward `PropagatedPauliFrames` to place MARK ops along the region and clears the original.

Collision and placement rules

- `Layer.put(op, allow_overwrite)`: prevents multiple ops on the same target range in one layer. For markers, ensures uniqueness per `(qid, marker_index)` and gate kind (MARKX/Y/Z).
- Creating non-existent qubits: `writeGateToFocus` calls `{Circuit}.withCoordsIncluded` to inject required coordinates for selected boxes before writing ops.

Visual feedback during selection

- While dragging the mouse, `main_draw.js` draws a translucent blue rectangle for the current drag box and highlights candidate boxes. Hover and selection overlays (red/blue) reflect `snap.curMouse*`, `snap.mouseDown*`, `snap.focusedSet`.

# B1: Circuit display (timeline)

Files and flow

- `draw/timeline_viewer.js: drawTimeline(ctx, snap, propagatedMarkerLayers, timesliceQubitCoordsFunc, numLayers)`.
- Wires: Determine the list of qubits from `snap.timelineQubits()`; sort by Y then X; compute an x‑axis mapping relative to current layer to place the time axis.
- Labels: For each qubit wire, draw `qx,qy:` at the left of the wire row (using the circuit’s stored `qubitCoordData`).
- Gates: For each time t, iterate the layer’s `iter_gates_and_markers()` and call `op.id_draw(qubitTimeCoordsForLayer, ctx)` to draw gate glyphs in the wire context.
- Current layer: Draw a translucent vertical band centered at t = current layer.

Propagation on the timeline

- For each `PropagatedPauliFrames` in `propagatedMarkerLayers`:
  - At half-steps (k+0.5): draw colored bars for basis X/Y/Z (red/green/blue) per qubit using `marker_placement`; bar placement/size depends on index (rows 1–4 and ring positions beyond) to encode the mark id.
  - At integer steps (k): draw magenta rectangles for errors; draw crossings as thick colored connectors.

Mouse linkage between timeline and panel

- When the cursor is over the right half and within the y‑band of a wire, draw connecting lines between the timeline wire and the left panel’s qubit square; also darken a band in the timeline around the hovered row.

# B2: Circuit summary (scrubber)

Where: bottom of `draw/main_draw.js` (“Draw scrubber”). Each layer is a narrow 8px column encoding:

- Single‑qubit Clifford present: column filled yellow.
- Otherwise, polygons present: three colored stripes (pink/green/blue thirds) indicate polygons.
- Measurements: light grey over entire height; Resets: light grey over the left half of the column.
- Marker presence: tiny red/green/blue dots near the bottom for X/Y/Z marks in that layer.
- Two‑qubit gate tick (single vertical stroke) vs multi‑qubit tick (two strokes).
- Errors in any propagated set: magenta frame rectangle around the column.
- Current layer: black triangle pointer.

# C: Instruction palette (toolbox)

Rendering

- File: `keyboard/toolbox.js`.
- Canvas `#toolbox` shows three rows (X/Y/Z) by many columns (H, S, R, M, MR, C, W, SC, MC, P, 1–9). Each cell contains a textual glyph or icon for a gate, polygon (P column), or marker (1–9 columns show X1/Y1/Z1 triangles and bar).
- The palette reacts to held chords:
  - Row highlighting: holding X or Y or Z (or X+Z as the “Y” chord) sets the focused row.
  - Column highlighting: holding a column key (e.g., “h”, “s”, “r”, “m”, “c”, “w”, “p”, digits) sets the focused column.
  - Intersection: highlights the chosen cell (red) and resolves to a `Gate` via `POS_TO_GATE_DICT` for use by the action layer.

Key mapping logic

- `getFocusedRow(ev)`: determines which basis row is active; supports the X+Z composition for Y.
- `getFocusedCol(ev)`: determines which column is active; matches all characters in the column label.
- `getToolboxFocusedData(ev)`: combines row/col; if only col is present, picks a default basis row from `DEF_ROW`.
- Gate selection: `POS_TO_GATE_DICT` maps row/col to actual `Gate` instances from `GATE_MAP`, including MARKX/Y/Z defaults for columns 9..12.

Integration with actions

- `main.js: makeChordHandlers()` binds chord patterns to `editorState` methods:
  - Gate placement (`writeGateToFocus`), polygon placement (`POLYGON` with RGB args), marking (`MARKX/Y/Z` with defaultArgument), and detector/observable conversions (`writeMarkerToDetector/Observable`, `moveDetOrObsAtFocusIntoMarker`).

# D: UI buttons

Where and binding

- DOM elements: `crumble.html` contains buttons with ids used by `stim_crumble/main.js`.
- Handlers in `main.js`:
  - Insert/Delete layer → `editorState.insertLayer(false)`, `editorState.deleteCurLayer(false)`.
  - Undo/Redo → `editorState.undo()`, `editorState.redo()`.
  - Clear markers → `editorState.clearMarkers()`.
  - Import/Export panel → toggles visibility and loads/saves via `Circuit.toStimCircuit()`/`Circuit.fromStimCircuit()` (with inline pragma conversions for ERR/MARK/POLYGON).
  - Next/Prev layer → `editorState.changeCurLayerTo(cur±1)`; Shift+Q/E steps by 5 (via keyboard handlers).
  - Rotate 45° → `editorState.rotate45(±1)`.
  - Clear circuit → `editorState.clearCircuit()`.

Side effects

- Several actions recompute the snapshot immediately by publishing to `obs_val_draw_state`; the draw loop observes and triggers a re-render.

# E: Keyboard interaction and chords

Chord engine

- `keyboard/chord.js`: Aggregates live keydown/up into a chord state; exposes a queue consumed by `makeChordHandlers`.
- Chord matching is string-based, e.g., "h+y", "p+x+z", "2+x", with `shift/alt/ctrl` prefixes as needed.

Action bindings (selected highlights)

- Marking and unmarking:
  - "{digit}" and "{digit}+x|y|z" → `markFocusInferBasis` or `writeGateToFocus` with typed MARK.
  - " " (space) to unmark at focus via `unmarkFocusInferBasis`.
- Detector/observable conversions: "{digit}+d" / "{digit}+o" → `writeMarkerToDetector/Observable`.
- Move det/obs into marker: "{digit}+j" → `moveDetOrObsAtFocusIntoMarker`.
- Add dissipative overlaps: "{digit}+k" → `addDissipativeOverlapToMarkers`.
- Gate families: `h`, `s`, `r`, `m` (+ modifiers x/y/z), `c` (two-qubit), `w` (swap/iswap), `sc` (sqrt pair gates), `mc` (pair measurements), etc.
- Navigation & transforms: `q/e` (± layers), Shift for faster steps, arrows/"<", ">", "^", "v", "." for grid transforms, Ctrl+Z/Y for undo/redo, Delete/Backspace for deletion.

Hook-up

- `main.js` registers both DevTools-friendly copy/paste handlers (Export/Import) and the chord handlers; the live chord is also sent to the toolbox painter (`drawToolbox`) so the palette reacts in real time.

Appendix: Visual encoding summary (panel vs timeline)

- Panel:
  - Propagated state (k+0.5): polygons (multi-qubit) + per-qubit rectangles; uniform basis colors; mixed = black.
  - Crossings (k): thick colored link on controlled edges.
  - Errors (k): magenta outline.
  - MARK overlays: wedge/triangle/square glyphs for typed mark ops in the current layer.
- Timeline:
  - Same encoding, but bars are placed across time with x-pitch; wires labeled by `qx,qy:`; current layer band and links back to panel on hover.
