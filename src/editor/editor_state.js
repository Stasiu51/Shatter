import {AnnotatedCircuit} from "../circuit/annotated_circuit.js";
import {Chorder} from "../keyboard/chord.js";
import {AnnotatedLayer as Layer, minXY} from "../circuit/annotated_layer.js";
import {Revision} from "../base/revision.js";
import {ObservableValue} from "../base/obs.js";
import {pitch, rad} from "../draw/config.js";
import {xyToPos} from "../draw/draw_panel.js";
import {StateSnapshot} from "../draw/state_snapshot.js";
import { selectionStore } from './selection_store.js';
import {Operation} from "../circuit/operation.js";
import {GATE_MAP} from "../gates/gateset.js";
import {
    PropagatedPauliFrameLayer,
    PropagatedPauliFrames
} from '../circuit/propagated_pauli_frames.js';

/**
 * @param {!int} steps
 * @return {!function(x: !number, y: !number): ![!number, !number]}
 */
function rotated45Transform(steps) {
    let vx = [1, 0];
    let vy = [0, 1];
    let s = (x, y) => [x - y, x + y];
    steps %= 8;
    steps += 8;
    steps %= 8;
    for (let k = 0; k < steps; k++) {
        vx = s(vx[0], vx[1]);
        vy = s(vy[0], vy[1]);
    }
    return (x, y) => [vx[0]*x + vy[0]*y, vx[1]*x + vy[1]*y];
}

class EditorState {
    /**
     * @param {!HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.rev = Revision.startingAt('');
        this.canvas = canvas;
        this.curMouseY = /** @type {undefined|!number} */ undefined;
        this.curMouseX = /** @type {undefined|!number} */ undefined;
        this.chorder = new Chorder();
        this.curLayer = 0;
        this.focusedSet = /** @type {!Map<!string, ![!number, !number]>} */  new Map();
        this.timelineSet = /** @type {!Map<!string, ![!number, !number]>} */ new Map();
        this.mouseDownX = /** @type {undefined|!number} */ undefined;
        this.mouseDownY = /** @type {undefined|!number} */ undefined;
        this.obs_val_draw_state = /** @type {!ObservableValue<StateSnapshot>} */ new ObservableValue(this.toSnapshot(undefined));
    }

    flipTwoQubitGateOrderAtFocus(preview) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit();
        let layer = newAnnotatedCircuit.layers[this.curLayer];
        let flipped_op_first_targets = new Set();
        let pairs = [
            ['CX', 'reverse'],
            ['CY', 'reverse'],
            ['XCY', 'reverse'],
            ['CXSWAP', 'reverse'],
            ['XCZ', 'reverse'],
            ['XCY', 'reverse'],
            ['YCX', 'reverse'],
            ['SWAPCX', 'reverse'],
            ['RX', 'MX'],
            ['R', 'M'],
            ['RY', 'MY'],
        ];
        let rev = new Map();
        for (let p of pairs) {
            rev.set(p[0], p[1]);
            rev.set(p[1], p[0]);
        }
        for (let q of this.focusedSet.keys()) {
            let op = layer.id_ops.get(newAnnotatedCircuit.coordToQubitMap().get(q));
            if (op !== undefined && rev.has(op.gate.name)) {
                flipped_op_first_targets.add(op.id_targets[0]);
            }
        }
        for (let q of flipped_op_first_targets) {
            let op = layer.id_ops.get(q);
            let other = rev.get(op.gate.name);
            if (other === 'reverse') {
                layer.id_ops.get(q).id_targets.reverse();
            } else {
                op.gate = GATE_MAP.get(other);
            }
        }
        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    reverseLayerOrderFromFocusToEmptyLayer(preview) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit();
        let end = this.curLayer;
        while (end < newAnnotatedCircuit.layers.length && !newAnnotatedCircuit.layers[end].empty()) {
            end += 1;
        }
        let layers = [];
        for (let k = this.curLayer; k < end; k++) {
            layers.push(newAnnotatedCircuit.layers[k]);
        }
        layers.reverse();
        for (let k = this.curLayer; k < end; k++) {
            newAnnotatedCircuit.layers[k] = layers[k - this.curLayer];
        }
        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    /**
     * @return {!AnnotatedCircuit}
     */
    copyOfCurAnnotatedCircuit() {
        let result = AnnotatedCircuit.fromStimCircuit(this.rev.peekActiveCommit()).circuit;
        while (result.layers.length <= this.curLayer) {
            result.layers.push(new Layer());
        }
        return result;
    }

    clearFocus() {
        this.focusedSet.clear();
        this.force_redraw();
    }

    /**
     * @param {!boolean} preview
     */
    deleteAtFocus(preview) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit();
        let c2q = newAnnotatedCircuit.coordToQubitMap();
        for (let key of this.focusedSet.keys()) {
            let q = c2q.get(key);
            if (q !== undefined) {
                newAnnotatedCircuit.layers[this.curLayer].id_pop_at(q);
            }
        }
        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    /**
     * @param {!boolean} preview
     */
    deleteCurLayer(preview) {
        let c = this.copyOfCurAnnotatedCircuit();
        c.layers.splice(this.curLayer, 1);
        this.commit_or_preview(c, preview);
    }

    /**
     * @param {!boolean} preview
     */
    insertLayer(preview) {
        let c = this.copyOfCurAnnotatedCircuit();
        c.layers.splice(this.curLayer, 0, new Layer());
        this.commit_or_preview(c, preview);
    }

    undo() {
        this.rev.undo();
    }

    redo() {
        this.rev.redo();
    }

    /**
     * @param {!AnnotatedCircuit} newAnnotatedCircuit
     * @param {!boolean} preview
     */
    commit_or_preview(newAnnotatedCircuit, preview) {
        if (preview) {
            this.preview(newAnnotatedCircuit);
        } else {
            this.commit(newAnnotatedCircuit);
        }
    }

    /**
     * @param {!AnnotatedCircuit} newAnnotatedCircuit
     */
    commit(newAnnotatedCircuit) {
        while (newAnnotatedCircuit.layers.length > 0 && newAnnotatedCircuit.layers[newAnnotatedCircuit.layers.length - 1].isEmpty()) {
            newAnnotatedCircuit.layers.pop();
        }
        this.rev.commit(newAnnotatedCircuit.toStimCircuit());
    }

    /**
     * @param {!AnnotatedCircuit} newAnnotatedCircuit
     */
    preview(newAnnotatedCircuit) {
        // Emit preview text and prepare a snapshot with cached propagation frames.
        this.rev.startedWorkingOnCommit(newAnnotatedCircuit.toStimCircuit());
        const propagated = this._computePropagationCache(newAnnotatedCircuit);
        this.obs_val_draw_state.set(this.toSnapshot(newAnnotatedCircuit, propagated));
    }

    /**
     * @param {undefined|!AnnotatedCircuit} previewAnnotatedCircuit
     * @returns {!StateSnapshot}
     */
    toSnapshot(previewAnnotatedCircuit, propagatedFrames) {
        if (previewAnnotatedCircuit === undefined) {
            previewAnnotatedCircuit = this.copyOfCurAnnotatedCircuit();
        }
        return new StateSnapshot(
            previewAnnotatedCircuit,
            this.curLayer,
            this.focusedSet,
            this.timelineSet,
            this.curMouseX,
            this.curMouseY,
            this.mouseDownX,
            this.mouseDownY,
            this.currentPositionsBoxesByMouseDrag(this.chorder.curModifiers.has("alt")),
            propagatedFrames,
        );
    }

    force_redraw() {
        let previewedAnnotatedCircuit = this.obs_val_draw_state.get().circuit;
        // Preserve existing propagated frames when just redrawing.
        const existing = this.obs_val_draw_state.get().propagatedFrames;
        this.obs_val_draw_state.set(this.toSnapshot(previewedAnnotatedCircuit, existing));
    }

    /**
     * Build a cache of propagated pauli frames for the given circuit:
     * - marker indices present in the circuit (0..max)
     * - detector frames keyed by ~index
     * - observable frames keyed by obs index
     * @param {!AnnotatedCircuit} c
     * @returns {!Map<number, import('../circuit/propagated_pauli_frames.js').default>}
     */
    _computePropagationCache(c) {
        const cache = new Map();
        try {
            // Collect used marker indices
            let maxIndex = -1;
            for (const layer of c.layers) {
                for (const op of layer.iter_gates_and_markers()) {
                    const name = op?.gate?.name || '';
                    if ((name === 'MARKX' || name === 'MARKY' || name === 'MARKZ') && op.args && op.args.length > 0) {
                        const mi = Math.round(op.args[0]);
                        if (mi > maxIndex) maxIndex = mi;
                    }
                }
            }
            for (let mi = 0; mi <= maxIndex; mi++) {
                cache.set(mi, PropagatedPauliFrames.fromCircuit(c, mi));
            }
            // Detectors and observables (batch)
            const { dets, obs } = c.collectDetectorsAndObservables(false);
            const batch_input = [];
            for (let di = 0; di < dets.length; di++) batch_input.push(dets[di].mids);
            for (const oi of obs.keys()) batch_input.push(obs.get(oi));
            const batch = PropagatedPauliFrames.batchFromMeasurements(c, batch_input);
            let idx = 0;
            for (let di = 0; di < dets.length; di++) cache.set(~di, batch[idx++]);
            for (const oi of obs.keys()) cache.set((~oi) ^ (1 << 30), batch[idx++]);
        } catch {}
        return cache;
    }

    clearAnnotatedCircuit() {
        this.commit(new AnnotatedCircuit(new Float64Array([]), []));
    }

    clearMarkers() {
        let c = this.copyOfCurAnnotatedCircuit();
        for (let layer of c.layers) {
            layer.markers = layer.markers.filter(e => e.gate.name !== 'MARKX' && e.gate.name !== 'MARKY' && e.gate.name !== 'MARKZ');
        }
        this.commit(c);
    }

    /** Clear all markers for a given index (0-9) across the whole circuit. */
    clearMarkersIndex(index) {
        let c = this.copyOfCurAnnotatedCircuit();
        for (let layer of c.layers) {
            layer.markers = layer.markers.filter(e => !( (e.gate.name === "MARKX" || e.gate.name === "MARKY" || e.gate.name === "MARKZ") && Math.round(e.args[0]) === Math.round(index) ));
        }
        this.commit(c);
    }

    /**
     * @param {!boolean} parityLock
     * @returns {!Array<![!int, !int]>}
     */
    currentPositionsBoxesByMouseDrag(parityLock) {
        let curMouseX = this.curMouseX;
        let curMouseY = this.curMouseY;
        let mouseDownX = this.mouseDownX;
        let mouseDownY = this.mouseDownY;
        let result = [];
        if (curMouseX !== undefined && mouseDownX !== undefined) {
            let [sx, sy] = xyToPos(mouseDownX, mouseDownY);
            let x1 = Math.min(curMouseX, mouseDownX);
            let x2 = Math.max(curMouseX, mouseDownX);
            let y1 = Math.min(curMouseY, mouseDownY);
            let y2 = Math.max(curMouseY, mouseDownY);
            let gap = pitch/4 - rad;
            x1 += gap;
            x2 -= gap;
            y1 += gap;
            y2 -= gap;
            x1 = Math.floor(x1 * 2 / pitch + 0.5) / 2;
            x2 = Math.floor(x2 * 2 / pitch + 0.5) / 2;
            y1 = Math.floor(y1 * 2 / pitch + 0.5) / 2;
            y2 = Math.floor(y2 * 2 / pitch + 0.5) / 2;
            let b = 1;
            if (x1 === x2 || y1 === y2) {
                b = 2;
            }
            for (let x = x1; x <= x2; x += 0.5) {
                for (let y = y1; y <= y2; y += 0.5) {
                    if (x % 1 === y % 1) {
                        if (!parityLock || (sx % b === x % b && sy % b === y % b)) {
                            result.push([x, y]);
                        }
                    }
                }
            }
        }
        return result;
    }

    /**
     * @param {!function(!number, !number): ![!number, !number]} coordTransform
     * @param {!boolean} preview
     * @param {!boolean} moveFocus
     */
    applyCoordinateTransform(coordTransform, preview, moveFocus) {
        let c = this.copyOfCurAnnotatedCircuit();
        c = c.afterCoordTransform(coordTransform);
        if (!preview && moveFocus) {
            let trans = m => {
                let new_m = new Map();
                for (let [x, y] of m.values()) {
                    [x, y] = coordTransform(x, y);
                    new_m.set(`${x},${y}`, [x, y]);
                }
                return new_m;
            }
            this.timelineSet = trans(this.timelineSet);
            this.focusedSet = trans(this.focusedSet);
        }
        this.commit_or_preview(c, preview);
    }

    /**
     * @param {!int} steps
     * @param {!boolean} preview
     */
    rotate45(steps, preview) {
        let t1 = rotated45Transform(steps);
        let t2 = this.copyOfCurAnnotatedCircuit().afterCoordTransform(t1).coordTransformForRectification();
        this.applyCoordinateTransform((x, y) => {
            [x, y] = t1(x, y);
            return t2(x, y);
        }, preview, true);
    }

    /**
     * @param {!int} newLayer
     */
    changeCurLayerTo(newLayer) {
        this.curLayer = Math.max(newLayer, 0);
        this.force_redraw();
    }

    /**
     * @param {!Array<![!number, !number]>} newFocus
     * @param {!boolean} unionMode
     * @param {!boolean} xorMode
     */
    changeFocus(newFocus, unionMode, xorMode) {
        if (!unionMode && !xorMode) {
            this.focusedSet.clear();
        }
        for (let [x, y] of newFocus) {
            let k = `${x},${y}`;
            if (xorMode && this.focusedSet.has(k)) {
                this.focusedSet.delete(k);
            } else {
                this.focusedSet.set(k, [x, y]);
            }
        }
        this.force_redraw();
    }

    /**
     * @param {!Iterable<int>} affectedQubits
     * @returns {!Map<!int, !string>}
     * @private
     */
    _inferBases(affectedQubits) {
        let inferredBases = new Map();
        let layer = this.copyOfCurAnnotatedCircuit().layers[this.curLayer];
        for (let q of [...affectedQubits]) {
            let op = layer.id_ops.get(q);
            if (op !== undefined) {
                if (op.gate.name === 'RX' || op.gate.name === 'MX' || op.gate.name === 'MRX') {
                    inferredBases.set(q, 'X');
                } else if (op.gate.name === 'RY' || op.gate.name === 'MY' || op.gate.name === 'MRY') {
                    inferredBases.set(q, 'Y');
                } else if (op.gate.name === 'R' || op.gate.name === 'M' || op.gate.name === 'MR') {
                    inferredBases.set(q, 'Z');
                } else if (op.gate.name === 'MXX' || op.gate.name === 'MYY' || op.gate.name === 'MZZ') {
                    let opBasis = op.gate.name[1];
                    for (let q of op.id_targets) {
                        inferredBases.set(q, opBasis);
                    }
                } else if (op.gate.name.startsWith('MPP:') && op.gate.tableau_map === undefined && op.id_targets.length === op.gate.name.length - 4) {
                    // MPP special case.
                    let bases = op.gate.name.substring(4);
                    for (let k = 0; k < op.id_targets.length; k++) {
                        let q = op.id_targets[k];
                        inferredBases.set(q, bases[k]);
                    }
                }
            }
        }
        return inferredBases;
    }

    /**
     * @param {!boolean} preview
     * @param {!int} markIndex
     */
    markFocusInferBasis(preview, markIndex) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit().withCoordsIncluded(this.focusedSet.values());
        let c2q = newAnnotatedCircuit.coordToQubitMap();
        let affectedQubits = new Set();
        for (let key of this.focusedSet.keys()) {
            affectedQubits.add(c2q.get(key));
        }

        // Determine which qubits have forced basis based on their operation.
        let forcedBases = this._inferBases(affectedQubits);
        for (let q of forcedBases.keys()) {
            affectedQubits.add(q);
        }

        // Pick a default basis for unforced qubits.
        let seenBases = new Set(forcedBases.values());
        seenBases.delete(undefined);
        let defaultBasis;
        if (seenBases.size === 1) {
            defaultBasis = [...seenBases][0];
        } else {
            defaultBasis = 'Z';
        }

        // Mark each qubit with its inferred basis.
        let layer = newAnnotatedCircuit.layers[this.curLayer];
        for (let q of affectedQubits) {
            let basis = forcedBases.get(q);
            if (basis === undefined) {
                basis = defaultBasis;
            }
            let gate = GATE_MAP.get(`MARK${basis}`).withDefaultArgument(markIndex);
            layer.put(new Operation(
                gate,
                '',
                new Float32Array([markIndex]),
                new Uint32Array([q]),
            ));
        }

        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    /**
     * @param {!boolean} preview
     */
    unmarkFocusInferBasis(preview) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit().withCoordsIncluded(this.focusedSet.values());
        let c2q = newAnnotatedCircuit.coordToQubitMap();
        let affectedQubits = new Set();
        for (let key of this.focusedSet.keys()) {
            affectedQubits.add(c2q.get(key));
        }

        let inferredBases = this._inferBases(affectedQubits);
        for (let q of inferredBases.keys()) {
            affectedQubits.add(q);
        }

        for (let q of affectedQubits) {
            if (q !== undefined) {
                newAnnotatedCircuit.layers[this.curLayer].id_dropMarkersAt(q);
            }
        }

        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    /**
     * @param {!boolean} preview
     * @param {!Gate} gate
     * @param {!Array<!number>} gate_args
     */
    _writeSingleQubitGateToFocus(preview, gate, gate_args) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit().withCoordsIncluded(this.focusedSet.values());
        let c2q = newAnnotatedCircuit.coordToQubitMap();
        for (let key of this.focusedSet.keys()) {
            newAnnotatedCircuit.layers[this.curLayer].put(new Operation(
                gate,
                '',
                new Float32Array(gate_args),
                new Uint32Array([c2q.get(key)]),
            ));
        }
        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    /** Toggle a marker of a given type at the current focus for marker index. */
    toggleMarkerAtFocus(preview, gateName, markerIndex) {
        if (this.focusedSet.size === 0) return;
        let c = this.copyOfCurAnnotatedCircuit().withCoordsIncluded(this.focusedSet.values());
        const layer = c.layers[this.curLayer];
        const c2q = c.coordToQubitMap();
        const targets = [];
        for (const key of this.focusedSet.keys()) targets.push(c2q.get(key));
        this._toggleMarkerOnQubits(preview, c, targets, gateName, markerIndex);
    }

    /** Toggle a marker of a given type for specific qubit ids at current layer. */
    toggleMarkerAtQubits(preview, gateName, markerIndex, qids) {
        if (!Array.isArray(qids) || qids.length === 0) return;
        let c = this.copyOfCurAnnotatedCircuit();
        this._toggleMarkerOnQubits(preview, c, qids, gateName, markerIndex);
    }

    /** Toggle a marker based on current selectionStore (qubits | gates | connections | polygons). */
    toggleMarkerAtSelection(preview, gateName, markerIndex) {
        try {
            const c = this.copyOfCurAnnotatedCircuit();
            const snapSel = selectionStore.snapshot();
            if (!snapSel || !snapSel.kind || snapSel.selected.size === 0) return;
            const qids = [];
            const addQid = (id) => { if (Number.isFinite(id)) qids.push(id); };
            const addQids = (arr) => { for (const q of arr) addQid(q); };
            if (snapSel.kind === 'qubit') {
                for (const id of snapSel.selected) {
                    const parts = String(id || '').split(':');
                    if (parts[0] !== 'q') continue;
                    addQid(parseInt(parts[1]));
                }
            } else if (snapSel.kind === 'gate') {
                for (const id of snapSel.selected) {
                    const tokens = String(id).split(':');
                    const layerIdx = parseInt(tokens[1]);
                    const first = parseInt(tokens[2]);
                    const op = c?.layers?.[layerIdx]?.id_ops?.get?.(first);
                    if (op && op.id_targets) addQids([...op.id_targets]);
                }
            } else if (snapSel.kind === 'connection') {
                const parity = new Map();
                for (const id of snapSel.selected) {
                    const tokens = String(id).split(':');
                    const key = tokens[2] || '';
                    const [a, b] = key.split('-');
                    const q1 = parseInt(a), q2 = parseInt(b);
                    if (Number.isFinite(q1)) parity.set(q1, (parity.get(q1) || 0) ^ 1);
                    if (Number.isFinite(q2)) parity.set(q2, (parity.get(q2) || 0) ^ 1);
                }
                for (const [qid, bit] of parity.entries()) if (bit === 1) addQid(qid);
            } else if (snapSel.kind === 'polygon') {
                // Symmetric difference over the vertex sets of the selected polygons.
                const parity = new Map();
                for (const id of snapSel.selected) {
                    const tokens = String(id).split(':');
                    const layerIdx = parseInt(tokens[1]);
                    const polyIndex = parseInt(tokens[2]);
                    const anns = c?.layers?.[layerIdx]?.annotations || [];
                    const poly = anns.find(a => a && a.kind === 'Polygon' && a.polyIndex === polyIndex);
                    const ids = Array.isArray(poly?.targets) ? poly.targets : [];
                    for (const q of ids) {
                        const qid = parseInt(q);
                        if (!Number.isFinite(qid)) continue;
                        parity.set(qid, (parity.get(qid) || 0) ^ 1);
                    }
                }
                for (const [qid, bit] of parity.entries()) if (bit === 1) addQid(qid);
            }
            if (qids.length === 0) return;
            this._toggleMarkerOnQubits(preview, c, qids, gateName, markerIndex);
        } catch {}
    }

    /** @private */
    _toggleMarkerOnQubits(preview, circuit, qids, gateName, markerIndex) {
        const layer = circuit.layers[this.curLayer];
        for (const q of qids) {
            if (q === undefined || q === null) continue;
            let existing = layer.markers.find(op => (op.gate.name === "MARKX" || op.gate.name === "MARKY" || op.gate.name === "MARKZ") && op.id_targets[0] === q && Math.round(op.args[0]) === Math.round(markerIndex));
            if (existing && existing.gate.name === gateName) {
                layer.markers = layer.markers.filter(op => op !== existing);
            } else {
                layer.id_dropMarkersAt(q, markerIndex);
                const gate = GATE_MAP.get(gateName).withDefaultArgument(markerIndex);
                layer.put(new Operation(gate, '', new Float32Array([markerIndex]), new Uint32Array([q])));
            }
        }
        this.commit_or_preview(circuit, preview);
    }

    /**
     * @param {!boolean} preview
     * @param {!Gate} gate
     * @param {!Array<!number>} gate_args
     */
    _writeTwoQubitGateToFocus(preview, gate, gate_args) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit();
        let [x, y] = xyToPos(this.curMouseX, this.curMouseY);
        let [minX, minY] = minXY(this.focusedSet.values());
        let coords = [];
        if (x !== undefined && minX !== undefined && !this.focusedSet.has(`${x},${y}`)) {
            let dx = x - minX;
            let dy = y - minY;

            for (let [vx, vy] of this.focusedSet.values()) {
                coords.push([vx, vy]);
                coords.push([vx + dx, vy + dy]);
            }
        } else if (this.focusedSet.size === 2) {
            for (let [vx, vy] of this.focusedSet.values()) {
                coords.push([vx, vy]);
            }
        }
        if (coords.length > 0) {
            newAnnotatedCircuit = newAnnotatedCircuit.withCoordsIncluded(coords)
            let c2q = newAnnotatedCircuit.coordToQubitMap();
            for (let k = 0; k < coords.length; k += 2) {
                let [x0, y0] = coords[k];
                let [x1, y1] = coords[k + 1];
                let q0 = c2q.get(`${x0},${y0}`);
                let q1 = c2q.get(`${x1},${y1}`);
                newAnnotatedCircuit.layers[this.curLayer].put(new Operation(
                    gate,
                    '',
                    new Float32Array(gate_args),
                    new Uint32Array([q0, q1]),
                ));
            }
        }

        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    /**
     * @param {!boolean} preview
     * @param {!Gate} gate
     * @param {!Array<!number>} gate_args
     */
    _writeVariableQubitGateToFocus(preview, gate, gate_args) {
        if (this.focusedSet.size === 0) {
            return;
        }

        let pairs = [];
        let cx = 0;
        let cy = 0;
        for (let xy of this.focusedSet.values()) {
            pairs.push(xy);
            cx += xy[0];
            cy += xy[1];
        }
        cx /= pairs.length;
        cy /= pairs.length;
        pairs.sort((a, b) => {
            let [x1, y1] = a;
            let [x2, y2] = b;
            return Math.atan2(y1 - cy, x1 - cx) - Math.atan2(y2 - cy, x2 - cx);
        });

        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit().withCoordsIncluded(this.focusedSet.values());
        let c2q = newAnnotatedCircuit.coordToQubitMap();
        let qs = new Uint32Array(this.focusedSet.size);
        for (let k = 0; k < pairs.length; k++) {
            let [x, y] = pairs[k];
            qs[k] = c2q.get(`${x},${y}`);
        }

        newAnnotatedCircuit.layers[this.curLayer].put(new Operation(gate, '', new Float32Array(gate_args), qs));
        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    /**
     * @param {!boolean} preview
     * @param {!Gate} gate
     * @param {undefined|!Array<!number>=} gate_args
     */
    writeGateToFocus(preview, gate, gate_args=undefined) {
        if (gate_args === undefined) {
            if (gate.defaultArgument === undefined) {
                gate_args = [];
            } else {
                gate_args = [gate.defaultArgument];
            }
        }
        if (gate.num_qubits === 1) {
            this._writeSingleQubitGateToFocus(preview, gate, gate_args);
        } else if (gate.num_qubits === 2) {
            this._writeTwoQubitGateToFocus(preview, gate, gate_args);
        } else {
            this._writeVariableQubitGateToFocus(preview, gate, gate_args);
        }
    }

    writeMarkerToObservable(preview, marker_index) {
        this._writeMarkerToDetOrObs(preview, marker_index, false);
    }

    writeMarkerToDetector(preview, marker_index) {
        this._writeMarkerToDetOrObs(preview, marker_index, true);
    }

    _writeMarkerToDetOrObs(preview, marker_index, isDet) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit();
        let argIndex = isDet ? newAnnotatedCircuit.collectDetectorsAndObservables(false).dets.length : marker_index;
        let prop = PropagatedPauliFrames.fromAnnotatedCircuit(newAnnotatedCircuit, marker_index);

        for (let k = 0; k < newAnnotatedCircuit.layers.length; k++) {
            let before = k === 0 ? new PropagatedPauliFrameLayer(new Map(), new Set(), []) : prop.atLayer(k - 0.5);
            let after = prop.atLayer(k + 0.5);
            let layer = newAnnotatedCircuit.layers[k];
            for (let q of new Set([...before.bases.keys(), ...after.bases.keys()])) {
                let b1 = before.bases.get(q);
                let b2 = after.bases.get(q);
                let op = layer.id_ops.get(q);
                let name = op !== undefined ? op.gate.name : undefined;
                let transition = undefined;
                if (name === 'MR' || name === 'MRX' || name === 'MRY') {
                    transition = b1;
                } else if (op !== undefined && op.countMeasurements() > 0) {
                    if (b1 === undefined) {
                        transition = b2;
                    } else if (b2 === undefined) {
                        transition = b1;
                    } else if (b1 !== b2) {
                        let s = new Set(['X', 'Y', 'Z']);
                        s.delete(b1);
                        s.delete(b2);
                        transition = [...s][0];
                    }
                }
                if (transition !== undefined) {
                    layer.markers.push(new Operation(
                        GATE_MAP.get(isDet ? 'DETECTOR' : 'OBSERVABLE_INCLUDE'),
                        '',
                        new Float32Array([argIndex]),
                        op.id_targets,
                    ));
                }
            }
            layer.markers = layer.markers.filter(op => !op.gate.name.startsWith('MARK') || op.args[0] !== marker_index);
        }

        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    addDissipativeOverlapToMarkers(preview, marker_index) {
        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit();
        let prop = PropagatedPauliFrames.fromAnnotatedCircuit(newAnnotatedCircuit, marker_index);

        let k = this.curLayer;
        let before = k === 0 ? new PropagatedPauliFrameLayer(new Map(), new Set(), []) : prop.atLayer(k - 0.5);
        let after = prop.atLayer(k + 0.5);
        let layer = newAnnotatedCircuit.layers[k];
        let processedQubits = new Set();
        for (let q of new Set([...before.bases.keys(), ...after.bases.keys()])) {
            if (processedQubits.has(q)) {
                continue;
            }
            let b1 = before.bases.get(q);
            let b2 = after.bases.get(q);
            let op = layer.id_ops.get(q);
            if (op === undefined) {
                continue;
            }
            let name = op.gate.name;
            let basis = undefined;
            if (name === 'R' || name === 'M' || name === 'MR') {
                basis = 'Z';
            } else if (name === 'RX' || name === 'MX' || name === 'MRX') {
                basis = 'X';
            } else if (name === 'RY' || name === 'MY' || name === 'MRY') {
                basis = 'Y';
            } else if (name === 'MXX' || name === 'MYY' || name === 'MZZ') {
                basis = name[1];
                let score = 0;
                for (let q2 of op.id_targets) {
                    if (processedQubits.has(q2)) {
                        score = -1;
                        break;
                    }
                    score += before.bases.get(q2) === basis;
                }
                if (score === 2) {
                    for (let q2 of op.id_targets) {
                        processedQubits.add(q2);
                        layer.markers.push(new Operation(
                            GATE_MAP.get(`MARK${basis}`),
                            '',
                            new Float32Array([marker_index]),
                            new Uint32Array([q2]),
                        ));
                    }
                }
                continue;
            } else if (name.startsWith('MPP:')) {
                let score = 0;
                for (let k = 0; k < op.id_targets.length; k++) {
                    let q2 = op.id_targets[k];
                    basis = name[k + 4];
                    if (processedQubits.has(q2)) {
                        score = -1;
                        break;
                    }
                    score += before.bases.get(q2) === basis;
                }
                if (score > op.id_targets.length / 2) {
                    for (let k = 0; k < op.id_targets.length; k++) {
                        let q2 = op.id_targets[k];
                        basis = name[k + 4];
                        processedQubits.add(q2);
                        layer.markers.push(new Operation(
                            GATE_MAP.get(`MARK${basis}`),
                            '',
                            new Float32Array([marker_index]),
                            new Uint32Array([q2]),
                        ));
                    }
                }
                continue;
            } else {
                continue;
            }
            if (b1 !== undefined || b2 !== undefined) {
                layer.markers.push(new Operation(
                    GATE_MAP.get(`MARK${basis}`),
                    '',
                    new Float32Array([marker_index]),
                    new Uint32Array([q]),
                ));
                processedQubits.add(q);
            }
        }

        this.commit_or_preview(newAnnotatedCircuit, preview);
    }

    moveDetOrObsAtFocusIntoMarker(preview, marker_index) {
        let circuit = this.copyOfCurAnnotatedCircuit();

        let focusSetQids = new Set();
        let c2q = circuit.coordToQubitMap();
        for (let s of this.focusedSet.keys()) {
            focusSetQids.add(c2q.get(s));
        }

        let find_overlapping_region = () => {
            let {dets: dets, obs: obs} = circuit.collectDetectorsAndObservables(false);
            for (let det_id = 0; det_id < dets.length; det_id++) {
                let prop = PropagatedPauliFrames.fromMeasurements(circuit, dets[det_id].mids);
                if (prop.atLayer(this.curLayer + 0.5).touchesQidSet(focusSetQids)) {
                    return [prop, new Operation(GATE_MAP.get('DETECTOR'), '', new Float32Array([det_id]), new Uint32Array([]))];
                }
            }
            for (let [obs_id, obs_val] of obs.entries()) {
                let prop = PropagatedPauliFrames.fromMeasurements(circuit, obs_val);
                if (prop.atLayer(this.curLayer + 0.5).touchesQidSet(focusSetQids)) {
                    return [prop, new Operation(GATE_MAP.get('OBSERVABLE_INCLUDE'), '', new Float32Array([obs_id]), new Uint32Array([]))];
                }
            }
            return undefined;
        }
        let overlap = find_overlapping_region();
        if (overlap === undefined) {
            return;
        }
        let [prop, rep_op] = overlap;

        let newAnnotatedCircuit = this.copyOfCurAnnotatedCircuit();
        for (let k = 0; k < newAnnotatedCircuit.layers.length; k++) {
            let before = k === 0 ? new PropagatedPauliFrameLayer(new Map(), new Set(), []) : prop.atLayer(k - 0.5);
            let after = prop.atLayer(k + 0.5);
            let layer = newAnnotatedCircuit.layers[k];
            for (let q of new Set([...before.bases.keys(), ...after.bases.keys()])) {
                let b1 = before.bases.get(q);
                let b2 = after.bases.get(q);
                let op = layer.id_ops.get(q);
                let name = op !== undefined ? op.gate.name : undefined;
                let transition = undefined;
                if (name === 'MR' || name === 'MRX' || name === 'MRY' || name === 'R' || name === 'RX' || name === 'RY') {
                    transition = b2;
                } else if (op !== undefined && op.countMeasurements() > 0) {
                    if (b1 === undefined) {
                        transition = b2;
                    } else if (b2 === undefined) {
                        transition = b1;
                    } else if (b1 !== b2) {
                        let s = new Set(['X', 'Y', 'Z']);
                        s.delete(b1);
                        s.delete(b2);
                        transition = [...s][0];
                    }
                }
                if (transition !== undefined) {
                    layer.markers.push(new Operation(
                        GATE_MAP.get(`MARK${transition}`),
                        '',
                        new Float32Array([marker_index]),
                        new Uint32Array([q]),
                    ))
                }
            }
            layer.markers = layer.markers.filter(op => op.gate.name !== rep_op.gate.name || op.args[0] !== rep_op.args[0]);
        }
        this.commit_or_preview(newAnnotatedCircuit, preview);
    }
}

export {EditorState, StateSnapshot}
