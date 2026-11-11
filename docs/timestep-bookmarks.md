# Timestep labels & bookmarks

Reference for agents working on [Shatter](https://github.com/Stasiu51/Shatter). Self-contained: you
should not need to read the rest of the codebase to use or extend this feature.

## Concept

A **tick** is a boundary between layers. Tick `k` sits immediately *before* layer `k`, for
`k` in `0..layers.length` inclusive. A circuit with `N` layers therefore has `N+1` ticks:

```
tick 0 │ layer 0 │ tick 1 │ layer 1 │ tick 2 │ ... │ layer N-1 │ tick N
```

Only ticks `1..N-1` correspond to an actual Stim `TICK` instruction. Tick `0` and tick `N` are the
open ends of the circuit — real boundaries a user may want to name, but with no `TICK` line to hang
an annotation on.

A **timestep** is an annotation on a tick. It carries:

- `label` — optional free text describing that point in the circuit.
- `bookmark` — optional boolean marking the tick as a navigation target.

The two are independent: a tick can be labelled without being bookmarked, and bookmarked without a
label. An entry with neither is deleted rather than stored.

## Syntax

Both forms are accepted on parse.

```
##! TIMESTEP [LABEL="..."] [BOOKMARK=TRUE]              # anchored
##! TIMESTEP INDEX=<k> [LABEL="..."] [BOOKMARK=TRUE]    # standalone
```

**Anchored form.** Must be immediately followed by `TICK`; the tick's index is taken from the
parser's position. Emitting diagnostic `TIME001` if the next instruction is not a `TICK`.

**Standalone form.** Names its tick with `INDEX=`, so it needs no `TICK`. This is how ticks `0` and
`N` are represented.

`BOOKMARK` accepts `TRUE`, `1`, `YES` (case-insensitive) and a bare `BOOKMARK` with no value.
Anything else, or its absence, is false. `LABEL` is a double-quoted string; backslashes and quotes
inside it are backslash-escaped.

### Example

```
##! EMBEDDING TYPE=PLANE
##! TIMESTEP INDEX=0 LABEL="before everything" BOOKMARK=TRUE
##! TIMESTEP INDEX=7 LABEL="all done"
QUBIT_COORDS(0, 0) 0
QUBIT_COORDS(1, 0) 1
R 0 1
##! TIMESTEP LABEL="reset done" BOOKMARK=TRUE
TICK
CX 0 1
TICK
M 0 1
```

## Serialization rules

`AnnotatedCircuit.toStimCircuit()` picks the form per tick:

| Tick index | Form emitted | Where |
|---|---|---|
| `1 .. layers.length-1` | anchored | on the line directly above its `TICK` |
| `0`, or `>= layers.length` | standalone `INDEX=` | with the header overlays, near the top |

Keeping interior ticks inline means the label reads next to the tick it describes, and circuits
written before the standalone form existed still round-trip unchanged.

Parse → export → parse is stable.

## Data model

```js
circuit.timesteps        // Map<number, {label: string, bookmark: boolean}>
```

Keyed by tick index. Lives on `AnnotatedCircuit`, copied verbatim by `withCoordsIncluded()` and the
coordinate-transforming copy (labels do not depend on coordinates).

**Important:** `editorState.copyOfCurAnnotatedCircuit()` round-trips through Stim *text*. Any state
not emitted by `toStimCircuit()` is lost on the next edit, so a new field on a timestep entry must be
added to the pragma in the same change.

## Keybindings

| Command id | Default | Behaviour |
|---|---|---|
| `layer.prev` / `layer.next` | `Q` / `E`, arrows | step one layer |
| `layer.prev.fast` / `layer.next.fast` | `Shift+Q` / `Shift+E` | step five layers |
| `bookmark.prev` / `bookmark.next` | `Ctrl+Q` / `Ctrl+E`, `Ctrl+Arrow` | hop to the adjacent bookmarked tick |

Defaults live in `settings_default.json` under `keybindings.commands`. The settings panel builds its
keybinding rows from that object, so a new command registered with `keymap.registerCommand` becomes
user-editable simply by adding an entry there.

`Ctrl` is deliberate rather than `Mod`: on macOS `Mod` maps to Cmd, and `Cmd+Q` quits the browser.

Hopping past the last bookmark in either direction is a no-op with a status message; it does not wrap.

## UI surfaces

- **Subbar** — `Timestep:` text box and a `Bookmark` checkbox, both acting on the current tick and
  both enabled for every tick including `0` and `N`.
- **Timeline header** — two lines inside the fixed 47px header:

  ```
  Layer 3/7. Use Q/E to move.
  At bookmark [syndrome round 1]  Shift to jump 5, ctrl for bookmarks
  ```

  Line two reads `At bookmark [name]` when the current tick is itself bookmarked, otherwise
  `Last bookmark [name]` for the nearest bookmark before it, otherwise `No bookmark yet`. An unnamed
  bookmark displays as `(unnamed)`. The key hint is dropped when the panel is narrow.

  All other panel headers are also 47px, so adding a third line would break their alignment.

## Where the code lives

| Concern | Location |
|---|---|
| Parse both pragma forms | `src/circuit/annotated_circuit.js`, the `kind === 'TIMESTEP'` branch |
| Emit pragma | `formatTimestepPragma()`, module scope in the same file |
| Emit inline / standalone | `toStimCircuit()` — the per-layer loop and the header overlay block |
| Model field | `AnnotatedCircuit` constructor, `this.timesteps` |
| Helpers, UI, navigation | `src/shatter_main.js`, the `// ---- TIMESTEP label / bookmark UI ----` block |
| Header text | `updateLayerIndicator()` in `src/shatter_main.js` |
| Markup and CSS | `index.html` — `#timestep-bookmark`, `.layer-info .li-line1` / `.li-line2` |
| Keybinding defaults | `settings_default.json` |
| Diagnostic | `src/diag/diag_factory.js`, `timestep_no_tick` (TIME001) |

Useful entry points in `src/shatter_main.js`:

```js
maxTickIndex()                               // highest valid tick index
getTimestep(tickIdx, circuit?)               // -> {label, bookmark}, defaulted when absent
bookmarkTicks()                              // -> ascending tick indices flagged as bookmarks
commitTimestepEntry(tickIdx, entry, desc)    // write + undo entry; drops empty entries
gotoBookmark(dir)                            // -1 back, +1 forward
```

## Known gaps

- **Insert/delete layer does not reindex ticks.** Timestep annotations keep their old indices and so
  drift relative to the circuit. This predates bookmarks and affects plain labels too.
- Bookmarks are not drawn on the timeline canvas; they are only visible in the header and subbar.
- No "list all bookmarks" view or jump-to-bookmark menu.

## Testing notes

The app is static ES modules with no build step. The parser and serializer can be driven directly
from Node:

```js
import { AnnotatedCircuit } from './src/circuit/annotated_circuit.js';
const { circuit } = AnnotatedCircuit.fromStimCircuit(text);
circuit.timesteps;          // inspect
circuit.toStimCircuit();    // re-emit
```

`src/shatter_main.js` cannot be imported under Node — it touches `document` at module scope.

When testing in a browser, serve with `python3 devserver.py 8777` rather than
`python3 -m http.server`. The latter allows the browser to cache ES modules, which silently serves
stale `src/` code after an edit.
