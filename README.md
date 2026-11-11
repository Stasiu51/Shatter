## Shatter Visualiser (Work in Progress)

> *"All this chitter-chatter, chitter-chatter, chitter-chatter 'bout
> shmatta, shmatta, shmatta."*

Shatter is a visualiser/editor for quantum circuits that is based on [Crumble](https://algassert.com/crumble). 

It expands on the rendering capabilities of Crumble by adding multiple panels and the ability to render different components of the quantum circuit to 'sheets' which can be toggled per-panel. It also adds the ability to render edges between qubits, and additional styling options for gates and qubits. It inherits the ability to render Pauli marks from Crumble, as well as its key-chord system for adding gates. Note that unlike in crumble, the gate specifier key(s) must be held before the Pauli specifier key (x/y/z), and thereafter all keys can be released.

Ticks can be given a text label describing that point in the circuit, and optionally flagged as a
bookmark; `Ctrl+Q` / `Ctrl+E` then hop between bookmarks while `Q`/`E` step one layer at a time. See
[`docs/timestep-bookmarks.md`](docs/timestep-bookmarks.md) for the syntax and [`SPEC.md`](SPEC.md) for the full overlay reference.

Edges can carry several colours and are then drawn as a gradient, written
`COLOUR=#ff0000|#0000ff` and running from the first-named endpoint to the
second. This is a text-only feature for now; see
[`docs/gradient-edges.md`](docs/gradient-edges.md).

### Running locally

Shatter is a static, zero-backend app, so any static file server works:

```
python3 devserver.py 8777
```

then open <http://localhost:8777>. `devserver.py` sends `no-store`; plain `python3 -m http.server`
lets the browser cache ES modules, so edits under `src/` silently fail to appear on reload.

## Hosted circuits

A circuit too big for the URL can be served from this site and opened by a
short id:

```
python3 publish_circuit.py circuit.stim --id my-circuit --title "Readable name"
```

then <https://stasiu51.github.io/Shatter/#id=my-circuit>. `circuits/index.html`
lists what is published. See [docs/hosted-circuits.md](docs/hosted-circuits.md).

*TODO*: Implement conversion between marks and detectors/observables.

*Attribution:* the source code of Shatter is inextricable from that of Crumble. I have variously vendored and modified the files available under an Apache license [here](https://github.com/quantumlib/Stim/blob/main/glue/crumble/).

<img width="1787" height="1035" alt="Screenshot 2025-11-30 at 14 56 26" src="https://github.com/user-attachments/assets/3f793db4-5b96-430e-ae6d-a223b2bd2778" />
