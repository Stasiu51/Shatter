# Hosted circuits

Reference for agents working on Shatter. Self-contained.

## Why

`#circuit=<text>` carries the whole circuit in the URL. That is fine for a toy
example and hopeless for a real one: a surgery circuit is megabytes, past what
a browser, a mail client or a PDF link will carry. A hosted circuit is a file
served by this same static site under a short id, so a paper can print

    https://<user>.github.io/Shatter/#id=bb144-bb2zz-v7

and have it open.

## Layout

    circuits/<id>.stim     the circuit
    circuits/index.json    the catalogue
    circuits/index.html    a gallery listing it

An id matches `[A-Za-z0-9._-]+`. `index.json` is `{"circuits": [...]}` with one
entry per circuit: `id`, `title`, `note`, `file`, and the counts shown in the
gallery (`qubits`, `detectors`, `observables`, `ticks`, `bookmarks`, `bytes`).

## Publishing

    python3 publish_circuit.py path/to/circuit.stim --id my-circuit \
        --title "Something readable" --note "one line for the gallery"

Copies the file in, rewrites `index.json`, prints the link. No dependencies:
the counts are read off the text. Re-publishing an id replaces it.

Everything is static, so the circuit is live as soon as the commit is on the
Pages branch.

## Loading

`src/io/hosted.js` fetches `circuits/<id>.stim` relative to `document.baseURI`,
and `initCircuitFromHash` in `src/shatter_main.js` drives it. Two things there
are load-bearing:

* **The hash is not rewritten while a hosted circuit is loaded.**
  `loadStimText` normally calls `writeHashFromCircuit`, which would replace
  `#id=bb144-bb2zz-v7` with the entire circuit and undo the point of hosting.
  `syncHash` suppresses that whenever `hostedCircuitId` is set.
* **`hashchange` ignores the id it already loaded**, so the listener does not
  re-enter and reload on its own writes.

A fetch is asynchronous, so the empty circuit below the initialiser draws
first and the hosted one replaces it. That is what keeps startup responsive.

## A trap worth knowing

Shatter's URL encoding maps newlines to `;`. A semicolon inside a comment
therefore becomes a line break if a circuit is round-tripped through
`#circuit=`, which can push `##! SHEET` off the top of the file and trip
SHEET001. Keep semicolons out of generated comment text.

Relatedly, Shatter's layer count is not stim's: each `MPP` expands into many
layers, so a circuit with 151 `TICK`s can report 727 layers. Anchored
`##! TIMESTEP` entries are safe because they sit against a real `TICK`, but a
standalone `##! TIMESTEP INDEX=<k>` computed from stim's layering will land in
the wrong place for anything past tick 0.
