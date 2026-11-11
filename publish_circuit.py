#!/usr/bin/env python3
"""Publish a circuit to this site so it can be opened by a short id.

    python3 publish_circuit.py circuit_viz.stim --id bb144-bb2zz-v7 \
        --title "Gross-code ZZ surgery (v7)"

Copies the file to circuits/<id>.stim, records it in circuits/index.json, and
prints the link. The point is that a paper can carry

    https://<user>.github.io/Shatter/#id=<id>

instead of a multi-megabyte `#circuit=` payload, which no PDF link would
survive. No dependencies: metadata is counted off the text.
"""
from __future__ import annotations

import argparse, json, re, shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
CIRCUITS = HERE / "circuits"
INDEX = CIRCUITS / "index.json"
ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def describe(text: str) -> dict:
    lines = text.splitlines()
    qubits = sum(1 for l in lines if l.startswith("QUBIT_COORDS"))
    return dict(
        qubits=qubits,
        detectors=sum(1 for l in lines if l.startswith("DETECTOR")),
        observables=sum(1 for l in lines if l.startswith("OBSERVABLE_INCLUDE")),
        ticks=sum(1 for l in lines if l.strip() == "TICK") + 2,
        bookmarks=sum(1 for l in lines if l.startswith("##! TIMESTEP")
                      and "BOOKMARK=TRUE" in l),
        bytes=len(text.encode()),
    )


def load_index() -> dict:
    if INDEX.exists():
        return json.loads(INDEX.read_text())
    return {"circuits": []}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", type=Path)
    ap.add_argument("--id", required=True)
    ap.add_argument("--title", default=None)
    ap.add_argument("--note", default=None, help="one line shown in the gallery")
    ap.add_argument("--base", default="https://stasiu51.github.io/Shatter/",
                    help="site root, used only to print the link")
    ap.add_argument("--start-bookmark", type=int, default=None,
                    help="open on this bookmark rather than at the start; 1 is "
                         "the first bookmark after the opening projections, "
                         "i.e. the first tick of the circuit proper")
    a = ap.parse_args()

    if not ID_RE.match(a.id):
        raise SystemExit(f"id {a.id!r} must match {ID_RE.pattern}")
    text = a.source.read_text()
    CIRCUITS.mkdir(exist_ok=True)
    shutil.copyfile(a.source, CIRCUITS / f"{a.id}.stim")

    entry = dict(id=a.id, title=a.title or a.id, note=a.note or "",
                 file=f"{a.id}.stim", **describe(text))
    if a.start_bookmark is not None:
        entry["start_bookmark"] = a.start_bookmark
    index = load_index()
    index["circuits"] = [c for c in index["circuits"] if c.get("id") != a.id]
    index["circuits"].append(entry)
    index["circuits"].sort(key=lambda c: c["id"])
    INDEX.write_text(json.dumps(index, indent=1) + "\n")

    link = a.base.rstrip("/") + "/#id=" + a.id
    if a.start_bookmark is not None:
        link += f"&bookmark={a.start_bookmark}"
    print(f"{a.id}: {entry['qubits']} qubits, {entry['detectors']} detectors, "
          f"{entry['observables']} observables, {entry['bytes']/1e6:.2f} MB")
    print(link)


if __name__ == "__main__":
    main()
