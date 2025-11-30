import {AnnotatedCircuit} from "../circuit/annotated_circuit.js";
import {AnnotatedLayer} from "../circuit/annotated_layer.js";

/**
 * A copy of the editor state which can be used for tasks such as drawing previews of changes.
 *
 * Technically not immutable, but should be treated as immutable. Should never be mutated.
 */
class StateSnapshot {
    /**
     * @param {!AnnotatedCircuit} circuit
     * @param {!int} curLayer
     * @param {!Map<!string, ![!number, !number]>} focusedSet
     * @param {!Map<!string, ![!number, !number]>} timelineSet
     * @param {!number} curMouseX
     * @param {!number} curMouseY
     * @param {!number} mouseDownX
     * @param {!number} mouseDownY
     * @param {!Array<![!number, !number]>} boxHighlightPreview
     */
    constructor(circuit, curLayer, focusedSet, timelineSet, curMouseX, curMouseY, mouseDownX, mouseDownY, boxHighlightPreview, propagatedFrames = undefined) {
        this.circuit = circuit.copy();
        this.curLayer = curLayer;
        this.focusedSet = new Map(focusedSet.entries());
        this.timelineSet = new Map(timelineSet.entries());
        this.curMouseX = curMouseX;
        this.curMouseY = curMouseY;
        this.mouseDownX = mouseDownX;
        this.mouseDownY = mouseDownY;
        this.boxHighlightPreview = [...boxHighlightPreview];
        // Optional cache of propagated pauli frames (Map<int, PropagatedPauliFrames>)
        this.propagatedFrames = propagatedFrames || undefined;

        while (this.circuit.layers.length <= this.curLayer) {
            this.circuit.layers.push(new AnnotatedLayer());
        }
    }

    /**
     * @returns {!Set<!int>}
     */
    id_usedQubits() {
        return this.circuit.allQubits();
    }

    /**
     * @returns {!Array<!int>}
     */
    timelineQubits() {
        // Prefer used qubits, but fall back to all declared qubits when there are no gates/markers.
        const used = this.id_usedQubits();
        const declared = new Set();
        try { const n = Math.floor((this.circuit.qubitCoordData?.length || 0) / 2); for (let i = 0; i < n; i++) declared.add(i); } catch {}
        try { if (this.circuit.qubit_coords && typeof this.circuit.qubit_coords.keys === 'function') { for (const q of this.circuit.qubit_coords.keys()) declared.add(q); } } catch {}
        try { if (this.circuit.qubits && typeof this.circuit.qubits.keys === 'function') { for (const q of this.circuit.qubits.keys()) declared.add(q); } } catch {}

        let baseSet = used.size > 0 ? used : declared;
        let qubits = [];
        if (this.timelineSet.size > 0) {
            const c2q = this.circuit.coordToQubitMap();
            for (const key of this.timelineSet.keys()) {
                const q = c2q.get(key);
                if (q !== undefined) qubits.push(q);
            }
            // Restrict to known qubits (used or declared fallback)
            qubits = qubits.filter(q => baseSet.has(q));
        } else {
            qubits.push(...baseSet.values());
        }
        return qubits;
    }
}

export {StateSnapshot}
