# Gradient edges

Status: **implemented**, text-edit only. Landed 11 Nov 2026.

A connection (`##! CONN SET`) can now carry several colours and is drawn as a
linear gradient through them. Everything here is reachable only by editing
circuit text; no toolbox control was added.

---

## Syntax

`COLOUR` accepts colour stops separated by `|`:

```
##! CONN SET EDGES=(0-1) SHEET=DEFAULT COLOUR=#ff0000|#0000ff
##! CONN SET EDGES=(0-1) SHEET=DEFAULT COLOUR=(255,0,0)|(0,0,255)
##! CONN SET EDGES=(0-1) SHEET=DEFAULT COLOUR=gold|violet|cornflowerblue THICKNESS=8 DROOP=1
```

Each stop is an ordinary colour value. CSS names, `#rrggbb` and the
`(r,g,b[,a])` tuple form all work, and may be mixed within one value. Stops are
spaced evenly from one end of the edge to the other.

**No spaces, anywhere in the value.** Write `(255,0,0)`, never `(255, 0, 0)`.
This is not new — it is how every pragma value has always worked — but it bites
more often now that tuples are useful inside a list. See *Why `|`* below.

### Direction

The gradient runs **from the first-named endpoint to the second**:

```
##! CONN SET EDGES=(0-1) COLOUR=#ff0000|#0000ff     red at qubit 0, blue at qubit 1
##! CONN SET EDGES=(1-0) COLOUR=#ff0000|#0000ff     red at qubit 1, blue at qubit 0
```

Endpoint order has no other effect: the two forms are still the same edge for
deduplication, selection and hit-testing. To flip a gradient, swap either the
endpoints or the stops.

---

## Backwards compatibility

A value with no `|` is a single colour and takes exactly the code path it did
before. In particular `COLOUR=255,0,0` is still **one** colour, not three —
this is the whole reason the separator is `|` rather than `,`.

Every `COLOUR=` value in `circuits/` is a bare CSS name (`gold`,
`cornflowerblue`, `lightcoral`, `orange`, `violet`, `silver`, `red`), 7661 of
them, none containing `|`. No existing circuit renders differently.

A single-colour edge has no direction, so making endpoint order meaningful
changes nothing that already exists.

**Forward compatibility is the weak direction.** A gradient circuit opened in a
build from before this change hits `ctx.strokeStyle = "#ff0000|#0000ff"`, which
canvas rejects silently, leaving whatever colour was set last. Wrong colour, not
a crash — but the deploy has to land before a gradient circuit is shared.

---

## Why `|`

Three constraints, all of them discovered in the existing code rather than
chosen:

1. **`parseKVs`** (`src/circuit/annotated_circuit.js:853`) reads an unquoted
   value as `[^\s]+`. Commas are free; **spaces are not**.
2. **`encodeCircuitToHash`** (`src/io/url_sync.js:15`) rewrites `', '` to `','`
   and then every space to `_`. A quoted value containing spaces does not
   survive a shared link. This rules out CSS-native syntax —
   `linear-gradient(90deg, #f00, #00f)` and `#f00 0%, #00f 100%` are both out.
3. **`copyOfCurAnnotatedCircuit()`** re-parses from `toStimCircuit()` text, so
   anything not serialised is lost on the next edit.

`|` passes the tokenizer, passes the URL codec untouched, and does not collide
with the comma already used inside `(r,g,b,a)`.

---

## Data model

**`a.colour` is still a single string** and is still the only colour field on a
`ConnSet`. It just may now contain `|`. This was deliberate:

- the serializer is unchanged — the string round-trips as-is, so constraint 3
  above is satisfied with no new code;
- the two recolour sites in `src/shatter_main.js` are unchanged —
  `a2.colour = '#f00|#00f'` already works;
- there is no second field to fall out of sync with the first.

Read it through `parseColourStops()` rather than splitting by hand.

### `src/util/color.js`

```js
export const COLOUR_STOP_SEP = '|';

/** "gold|violet" -> ["gold", "violet"]; "255,0,0" -> ["rgba(255, 0, 0, 1)"] */
export function parseColourStops(val) -> string[]

/** A CSS background that previews a value, gradient or not. */
export function colourSwatchCss(val) -> string
```

`parseColourStops` returns `[]` for an empty or unusable value, tolerates
`a||b` and a trailing separator, and drops stops that do not parse.

---

## Rendering

The gradient is built inside `stroke_connector_to`
(`src/gates/gate_draw_util.js:204`), not by its callers, because that function
**swaps its own endpoints** when `x2 < x1` and the gradient has to be mirrored
with them. Two new options:

| option | meaning |
|---|---|
| `gradientReversed` | the declaration ran high-id → low-id, so reverse the stops |
| `gradientSpan` | `[t0,t1]`, the fraction of the whole edge this call draws |

`mirrorGradientOpts()` flips both when the endpoints are swapped.

Three things worth knowing:

- **The chord is correct, not an approximation.** For a drooped edge the
  gradient runs along the chord while the bezier bulges perpendicular — which is
  exactly the direction the gradient does not vary in.
- **Torus edges are sub-ranged.** `drawConnectionsTorus` splits a wrapped edge
  into 2–3 pieces. Each gets its share of the stop range by arc length, and the
  gradient line is extrapolated back out to the virtual full-edge endpoints so
  canvas interpolates the boundary colours for us — no colour maths, and the
  pieces join seamlessly.
- **Flat colour fallbacks.** The connection highlight underlay
  (`drawConnectionHighlights`) and the palette's swatch identity take the first
  stop only.

---

## Where the code lives

| what | where |
|---|---|
| stop parsing, swatch CSS | `src/util/color.js` |
| gradient construction, endpoint mirroring | `src/gates/gate_draw_util.js:204` |
| orientation capture, flat renderer | `src/draw/draw_panel.js` `drawConnections` |
| torus sub-ranging | `src/draw/draw_panel.js` `drawConnectionsTorus` |
| highlight underlay first-stop | `src/draw/draw_panel.js` `drawConnectionHighlights` |
| gradient swatch preview | `src/ui_elements/edges_palette.js` |
| spec | `SPEC.md` §4.1 |

Parsing and serialization were **not** touched: `COLOUR` was already an opaque
string at both ends.

---

## Known gaps

- No UI. Edges added or recoloured through the toolbox are single-coloured.
  The palette renders a gradient swatch so gradients already in a circuit stay
  visible and re-selectable, but there is no way to author one by clicking.
- Stops are always evenly spaced. `COLOURSTOPS=0,0.35,1` is the obvious
  extension and is not implemented.
- No diagnostic for an unparseable stop; bad stops are dropped silently, which
  matches how `COLOUR` has always behaved.
- Gate-drawn connectors (`##! GATESTYLE`) remain single-colour. Polygons are
  untouched. The timeline draws no `ConnSet`s at all.

---

## Testing notes

There is no wired-up test runner in this repo (the `*.test.js` files are
orphaned), so this was checked two ways.

A mock-canvas harness over `stroke_connector_to` covering single colours, 2- and
3-stop gradients, tuple stops, explicit reversal, internal endpoint swap, torus
half-spans and degenerate values. The decisive cases:

```
2-stop, swapped pts        grad 0,0->100,0 [[0,"#0000ff"],[1,"#ff0000"]]
span [0,0.5]               grad 0,0->100,0 [[0,"#ff0000"],[1,"#0000ff"]]
span [0.5,1]               grad 0,0->100,0 [[0,"#ff0000"],[1,"#0000ff"]]
```

— the two spans produce the same gradient line, which is what makes a wrapped
edge continuous across the seam.

In the browser, a four-row circuit confirmed left-to-right 2-stop, right-to-left
2-stop via `EDGES=(3-2)`, a 3-stop drooped curve, and an unchanged single-colour
edge; and `bb144-bb2zz-v7-viz` (600 qubits) loads and renders as before.

Round-trip through `AnnotatedCircuit.fromStimCircuit` → `toStimCircuit` is
stable on the second pass, preserves declared endpoint order, and the `|`
survives `encodeCircuitToHash`.
