import {AnnotatedCircuit} from "../circuit/annotated_circuit.js";
import {AnnotatedLayer} from "../circuit/annotated_layer.js";

/**
 * A copy of the editor state which can be used for tasks such as drawing previews of changes.
 *
 * Technically not immutable, but should be treated as immutable. Should never be mutated.
 */
class StateSnapshot {
    /**
     * @param {!AnnotatedCircuit} annotatedCircuit
     * @param {!int} curAnnotatedLayer
     * @param {!Map<!string, ![!number, !number]>} focusedSet
     * @param {!Map<!string, ![!number, !number]>} timelineSet
     * @param {!number} curMouseX
     * @param {!number} curMouseY
     * @param {!number} mouseDownX
     * @param {!number} mouseDownY
     * @param {!Array<![!number, !number]>} boxHighlightPreview
     */
    constructor(annotatedCircuit, curAnnotatedLayer, focusedSet, timelineSet, curMouseX, curMouseY, mouseDownX, mouseDownY, boxHighlightPreview) {
        this.annotatedCircuit = annotatedCircuit.copy();
        this.curAnnotatedLayer = curAnnotatedLayer;
        this.focusedSet = new Map(focusedSet.entries());
        this.timelineSet = new Map(timelineSet.entries());
        this.curMouseX = curMouseX;
        this.curMouseY = curMouseY;
        this.mouseDownX = mouseDownX;
        this.mouseDownY = mouseDownY;
        this.boxHighlightPreview = [...boxHighlightPreview];

        while (this.annotatedCircuit.layers.length <= this.curAnnotatedLayer) {
            this.annotatedCircuit.layers.push(new AnnotatedLayer());
        }
    }

    /**
     * @returns {!Set<!int>}
     */
    id_usedQubits() {
        return this.annotatedCircuit.allQubits();
    }

    /**
     * @returns {!Array<!int>}
     */
    timelineQubits() {
        let used = this.id_usedQubits();
        let qubits = [];
        if (this.timelineSet.size > 0) {
            let c2q = this.annotatedCircuit.coordToQubitMap();
            for (let key of this.timelineSet.keys()) {
                let q = c2q.get(key);
                if (q !== undefined) {
                    qubits.push(q);
                }
            }
        } else {
            qubits.push(...used.values());
        }
        return qubits.filter(q => used.has(q));
    }
}

export {StateSnapshot}
