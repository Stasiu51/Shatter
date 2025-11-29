# Shatter Syntax and Semantics (Spec)

Audience: this document targets users familiar with Stim and Crumble. Shatter extends Stim through comment‑only overlay directives (`##! ...`) that pair with Crumble pragmas (`#!pragma ...`). Stim text remains valid for external tools; overlays affect how Shatter renders and simulates in the browser.

Status labels used below:
- Implemented: available now in Shatter.
- Partially: some behavior exists; details noted.
- Planned: parsed or specified but not yet drawn/applied.

## 1) Overview

- Zero‑backend, browser‑only. Shatter reads a Stim file and optional overlay directives, renders panels and a timeline, and simulates Pauli mark propagation using Crumble’s primitives.
- Overlays are comment lines starting with `##!`, optionally paired with the immediately following Crumble pragma `#!pragma ...` (e.g. POLYGON, MARK, ERR). Pairing preserves compatibility with Crumble. Pragmas are accepted with or without a space (e.g. `#! pragma POLYGON`).
- Attachment rule (anchored overlays): Some overlay lines (e.g. `##! QUBIT` without an explicit `Q=`) attach to the very next crumble instruction of the right kind (e.g. `QUBIT_COORDS`). If the next non‑trivia line is the wrong kind, a diagnostic is emitted.
- Layers vs. sheets: “Layers” are circuit time steps (Stim `TICK`s). “Sheets” are Shatter’s Z‑stacked visual planes for panel filtering.

## 2) Sheets

Syntax:
```
##! SHEET NAME=<UPPERCASE> [Z=<int>]
```
- Declares a named sheet. Z orders sheets visually; defaults to 0.
- Must appear before non‑sheet content.

Status: Implemented (parsing + panel filter; Z is stored; rendering uses order but no special z‑stack visuals yet).

Diagnostics:
- SHEET001: must be at top.
- SHEET002: duplicate sheet.
- SHEET003: unknown sheet referenced.

## 3) Qubit properties

Syntax:
```
##! QUBIT [Q=<id>] [X=<float> Y=<float>] [SHEET=<name>] \
          [COLOUR=<css>] [DEFECTIVE=<bool>] [TEXT="..."] [MOUSEOVER="..."]
```
- With `Q=<id>`: applies immediately to that qubit.
- Without `Q=`: anchors to the next `QUBIT_COORDS(x,y) q` instruction and applies to its target.
- Panel coordinates: `X,Y` are panel‑space coordinates (not Stim coords). Defaults to Stim coords if not set.
- `SHEET` assigns the qubit to a sheet.
- `COLOUR`, `DEFECTIVE`, `TEXT`, `MOUSEOVER` are visual metadata (Planned for richer draw; stored now).

Status: Implemented (anchor + panel coords + sheet assignment; color/defective/labels stored; label rendering Planned).

Diagnostics:
- QU001: QUBIT w/o Q must attach to next `QUBIT_COORDS` / must reference exactly one target.
- COORD001/2: coordinate reuse, etc. (see §8).

## 4) Connections

Syntax:
```
##! CONN SET SHEET=<name> EDGES=(q1-q2, q3-q4, ...)
    [COLOUR=<css>] [DROOP=<float>] [DEFECTIVE=<bool>] [TEXT="..."] [MOUSEOVER="..."]
```
- Declares connections between qubit id pairs on the given sheet.
- Visibility: depends only on the connection’s `SHEET` (endpoints’ sheets are ignored).
- Draw order: above polygons, under qubits.
- Style:
  - Implemented: `COLOUR`, `THICKNESS`, and `DROOP` (curved rendering). Defaults: color light grey, thickness 4, droop 0 (straight).
  - Planned: `DEFECTIVE`, text/hover labels.

Status: Implemented (sheet filtering + colour/thickness/droop). Enhancements Planned.

## 5) Polygons

Paired form (recommended):
```
##! POLY SHEET=<name> [STROKE=<css>]
#!pragma POLYGON(r,g,b,a)  id ...
```
- The `#!pragma POLYGON(r,g,b,a)` line carries the fill color and the qubit ids that define vertices.
- The `##! POLY` header carries sheet and stroke (outline). FILL in the `##! POLY` header is ignored; fill is derived from the pragma color.
- Panels: polygons draw under connections and qubits; filtered by the polygon’s `SHEET`. Vertex positions use panel coordinates.
- Timeline: polygons draw in the column for the layer where they appear. All polygon sets are shown at their respective time columns.
- Duration semantics:
  - Panels: the most recent polygon set up to the current layer is shown (sticky underlay), matching Crumble behavior in its view.
  - Timeline: all polygon sets are shown across time (each in its layer column).

Status: Implemented (annotations + panel + timeline). Stroke/alpha applied; sheet filtering in panels; timeline is global (unfiltered) by design.

Diagnostics:
- POLY001: `##! POLY` must be immediately followed by `#!pragma POLYGON`.
- POLY002: invalid `POLYGON` body (bad color or args).

## 6) Highlights

Syntax:
```
##! HIGHLIGHT TARGET=GATE [COLOR=<css>]
##! HIGHLIGHT TARGET=QUBIT QUBITS=<id,id,...> [COLOR=<css>]
```
- `TARGET=GATE`: Anchors to the next gate (non‑marker) instruction and records a `GateHighlight` annotation for that op (gate name + targets). Draw of gate highlights is Planned.
- `TARGET=QUBIT`: Immediate qubit underlay highlight on the current layer for the listed ids; drawn in panels (under qubit squares).

Status: Partially. Qubit highlights are drawn in panels; gate highlights are parsed/anchored but not yet drawn.

Diagnostics:
- HL001: had no gate to attach to.

## 7) Marks & Errors (Crumble pragmas)

Crumble pragmas are part of Stim parsing and remain as operations:
```
#!pragma MARKX(index) q ...
#!pragma MARKY(index) q ...
#!pragma MARKZ(index) q ...
#!pragma ERR q ...
```
- Shatter reuses Crumble’s propagation machinery. Panel rendering shows marker rectangles and error outlines; detectors/observables are derived from measurement parity (below) and shown as special negative mi layers.
- Sheet filtering: per‑qubit marker rectangles/errors are suppressed on panels for qubits not visible on the selected sheets.

Status: Implemented (propagation + draw; filtered per panel).

## 7.1) Gate connector global style

Syntax:
```
##! GATESTYLE [DROOP=<float>] [COLOUR=<css>] [THICKNESS=<number>]
```
- Applies globally to gate-drawn connectors (lines between qubits drawn by gates). Does not affect `##! CONN SET` overlays.
- DROOP scales the bezier “droop” used on longer spans (0 disables curvature, >0 increases; default preserves legacy curve).
- COLOUR sets connector stroke color (e.g., `black`, `#00AA88`).
- THICKNESS sets connector stroke width in panel/timeline (default 2).
- Last-write-wins across multiple directives.

Status: Implemented (panel and timeline). MPP and standard two‑qubit gates respect this style.

## 8) Repeat & attachment behavior

- Anchored overlays (QUBIT without Q, HIGHLIGHT GATE, POLY header) set a callback that must attach to the next crumble instruction of the expected kind (QUBIT_COORDS, a gate, POLYGON respectively). Otherwise, diagnostics are emitted.
- REPEAT: overlay anchors respect expanded lines; barriers (TICK, end of repeat) do not implicitly clear anchors unless the expected instruction appears.

Diagnostics (selection):
- REP001: unmatched `}`.
- REP002: unclosed REPEAT block.
- ANNOTATION001: unknown `##!` directive.
- COORD001/002: coordinate misuse.
- FEED001 (warning): feedback not supported.
- GATE001 (warning): ignoring unrecognized instruction.

## 9) Panels: rendering/filtering rules

- Sheet selection per panel: each panel has a selectable set of visible sheets.
- Qubits: drawn at panel coordinates when the qubit’s `SHEET` is visible.
- Operations: drawn when `op.sheets == null` and any target qubit is visible (current default). Planned: if `op.sheets` is set, visibility will be controlled explicitly by op.sheets.
- Crossings (Pauli mark crossings at two‑qubit gates): derived from the gate and drawn only when that gate is visible in the panel; drawn after gates.
- Connections: drawn when the connection’s `SHEET` is visible, regardless of qubit endpoints’ sheets.
- Polygons: drawn when the polygon’s `SHEET` is visible.
- Torus connectors: for embedding TORUS, connectors for MPP and standard two‑qubit gates (CX/CY/CZ, SWAP/ISWAP/CXSWAP/CZSWAP, MXX/MYY/MZZ, √XX/√YY/√ZZ, II) render using shortest‑path seam‑aware segments.

## 10) Timeline: global view

- Shows the full circuit over time; no sheet filtering.
- Polygons: injected into the snapshot as temporary POLYGON markers so the existing timeline marker path draws them; all polygon sets appear at their respective layer columns.
- Propagation overlays: bases (bars), errors, crossings drawn similar to Crumble’s viewer.
- Gate connectors obey `##! GATESTYLE` (droop/colour) in timeline rendering as well.

## 11) Embedding & Layout

- EMBEDDING TYPE=PLANE | TORUS (LX,LY) | CYLINDER | MOBIUS (CYLINDER/MOBIUS Planned):
```
##! EMBEDDING TYPE=PLANE
##! EMBEDDING TYPE=TORUS LX=<int> LY=<int>
```
- LAYOUT helpers (GRID/HEX/CIRCLE/LINE) to bulk position qubits on panel sheets:
```
##! LAYOUT Q=0..15 SHEET=<name> MAP=GRID DX=... DY=... ORIGIN=(x,y)
```
Status: Layout helpers Planned.

## 12) Pairing & round‑tripping

- On load: Shatter reads Stim text, Crumble pragmas, and `##!` overlay directives. Polygon annotations are paired with their `#!pragma POLYGON` fill color.
- On save (`toStimCircuit`): Emits Stim text plus overlay lines for:
  - `##! SHEET` declarations (excluding implicit DEFAULT),
  - `##! EMBEDDING` (PLANE or TORUS with LX/LY),
  - `##! GATESTYLE` when present (DROOP/COLOUR),
  - per‑qubit overlays `##! QUBIT` (when non‑default metadata exists),
  - `##! CONN SET` overlays,
  - `##! POLY` headers paired with `#!pragma POLYGON(...)` bodies.

## 13) Diagnostics (summary)

- SHEET001/002/003: sheet placement/duplication/missing.
- QU001/QU002: QUBIT anchoring/target issues.
- HL001: highlight without gate.
- POLY001/002: polygon pairing/body errors.
- ANNOTATION001: unknown overlay directive.
- COORD001/002: coordinate misuse.
- FEED001 (warning): feedback not supported.
- GATE001 (warning): ignoring unrecognized instruction.
- REP001/002: repeat errors.

## 14) Examples

Minimal polygons:
```
##! SHEET NAME=DEFAULT Z=0
QUBIT_COORDS(0, 0) 0
QUBIT_COORDS(1, 0) 1
QUBIT_COORDS(1, 1) 2

##! POLY SHEET=DEFAULT STROKE=black
#!pragma POLYGON(0.9,0.9,0.2,0.25) 0 1 2
```

Qubit anchored to coords:
```
##! QUBIT SHEET=UPPER X=3.5 Y=1.0 TEXT="q0"
QUBIT_COORDS(0, 0) 0
```

Connections:
```
##! CONN SET SHEET=DEFAULT EDGES=(0-1, 1-2) COLOUR=#b0b5ba
```

Highlight next gate:
```
##! HIGHLIGHT TARGET=GATE COLOR=gold
CX 0 1
```

## 15) Notes on compatibility

- Shatter never emits Stim‑breaking content. `##!` overlays are comments and ignored by Stim/Crumble. Pairing with `#!pragma` ensures Crumble can still understand basic annotations (e.g., polygons) when Shatter is not used.
- Where feasible, Shatter reuses Crumble’s renderers and data flows; e.g., the timeline’s polygon drawing is driven through synthesized POLYGON markers built from annotations.

---

Questions or gaps? Please open an issue with a minimal Stim sample and note whether the problem occurs in a panel, the global timeline, or both.
Gate connector style:
```
##! GATESTYLE DROOP=0.25 COLOUR=#00AA88
CX 0 1
```
