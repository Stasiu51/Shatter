import {pitch, rad, OFFSET_X, OFFSET_Y} from "./config.js"
import {marker_placement} from "../gates/gateset_markers.js";
import {PropagatedPauliFrames} from "../circuit/propagated_pauli_frames.js";
import {stroke_connector_to} from "../gates/gate_draw_util.js"
import {beginPathPolygon} from './draw_util.js';

/**
 * @param {!number|undefined} x
 * @param {!number|undefined} y
 * @return {![undefined, undefined]|![!number, !number]}
 */
function xyToPos(x, y) {
    if (x === undefined || y === undefined) {
        return [undefined, undefined];
    }
    let focusX = x / pitch;
    let focusY = y / pitch;
    let roundedX = Math.floor(focusX * 2 + 0.5) / 2;
    let roundedY = Math.floor(focusY * 2 + 0.5) / 2;
    let centerX = roundedX*pitch;
    let centerY = roundedY*pitch;
    if (Math.abs(centerX - x) <= rad && Math.abs(centerY - y) <= rad && roundedX % 1 === roundedY % 1) {
        return [roundedX, roundedY];
    }
    return [undefined, undefined];
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!StateSnapshot} snap
 * @param {!function(q: !int): ![!number, !number]} qubitCoordsFunc
 * @param {!PropagatedPauliFrames} propagatedMarkers
 * @param {!int} mi
 */
function drawCrossMarkers(ctx, snap, qubitCoordsFunc, propagatedMarkers, mi) {
    let crossings = propagatedMarkers.atLayer(snap.curLayer).crossings;
    if (crossings !== undefined) {
        for (let {q1, q2, color} of crossings) {
            let [x1, y1] = qubitCoordsFunc(q1);
            let [x2, y2] = qubitCoordsFunc(q2);
            if (color === 'X') {
                ctx.strokeStyle = 'red';
            } else if (color === 'Y') {
                ctx.strokeStyle = 'green';
            } else if (color === 'Z') {
                ctx.strokeStyle = 'blue';
            } else {
                ctx.strokeStyle = 'purple'
            }
            ctx.lineWidth = 8;
            stroke_connector_to(ctx, x1, y1, x2, y2);
            ctx.lineWidth = 1;
        }
    }
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!StateSnapshot} snap
 * @param {!function(q: !int): ![!number, !number]} qubitCoordsFunc
 * @param {!Map<!int, !PropagatedPauliFrames>} propagatedMarkerLayers
 */
function drawMarkers(ctx, snap, qubitCoordsFunc, propagatedMarkerLayers, isQubitVisible) {
    let obsCount = new Map();
    let detCount = new Map();
    for (let [mi, p] of propagatedMarkerLayers.entries()) {
        drawSingleMarker(ctx, snap, qubitCoordsFunc, p, mi, obsCount, detCount, isQubitVisible);
    }
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!StateSnapshot} snap
 * @param {!function(q: !int): ![!number, !number]} qubitCoordsFunc
 * @param {!PropagatedPauliFrames} propagatedMarkers
 * @param {!int} mi
 * @param {!Map} hitCount
 */
function drawSingleMarker(ctx, snap, qubitCoordsFunc, propagatedMarkers, mi, hitCount, isQubitVisible) {
    let basesQubitMap = propagatedMarkers.atLayer(snap.curLayer + 0.5).bases;

    // Convert qubit indices to draw coordinates.
    let basisCoords = [];
    for (let [q, b] of basesQubitMap.entries()) {
        if (!isQubitVisible || isQubitVisible(q)) {
            basisCoords.push([b, qubitCoordsFunc(q)]);
        }
    }

    // Draw a polygon for the marker set.
    if (mi >= 0 && basisCoords.length > 0) {
        if (basisCoords.every(e => e[0] === 'X')) {
            ctx.fillStyle = 'red';
        } else if (basisCoords.every(e => e[0] === 'Y')) {
            ctx.fillStyle = 'green';
        } else if (basisCoords.every(e => e[0] === 'Z')) {
            ctx.fillStyle = 'blue';
        } else {
            ctx.fillStyle = 'black';
        }
        ctx.strokeStyle = ctx.fillStyle;
        let coords = basisCoords.map(e => e[1]);
        let cx = 0;
        let cy = 0;
        for (let [x, y] of coords) {
            cx += x;
            cy += y;
        }
        cx /= coords.length;
        cy /= coords.length;
        coords.sort((a, b) => {
            let [ax, ay] = a;
            let [bx, by] = b;
            let av = Math.atan2(ay - cy, ax - cx);
            let bv = Math.atan2(by - cy, bx - cx);
            if (ax === cx && ay === cy) {
                av = -100;
            }
            if (bx === cx && by === cy) {
                bv = -100;
            }
            return av - bv;
        })
        beginPathPolygon(ctx, coords);
        ctx.globalAlpha *= 0.25;
        ctx.fill();
        ctx.globalAlpha *= 4;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
    }

    // Draw individual qubit markers.
    for (let [b, [x, y]] of basisCoords) {
        let {dx, dy, wx, wy} = marker_placement(mi, `${x}:${y}`, hitCount);
        if (b === 'X') {
            ctx.fillStyle = 'red'
        } else if (b === 'Y') {
            ctx.fillStyle = 'green'
        } else if (b === 'Z') {
            ctx.fillStyle = 'blue'
        } else {
            throw new Error('Not a pauli: ' + b);
        }
        ctx.fillRect(x - dx, y - dy, wx, wy);
    }

    // Show error highlights.
    let errorsQubitSet = propagatedMarkers.atLayer(snap.curLayer).errors;
    for (let q of errorsQubitSet) {
        if (!isQubitVisible || isQubitVisible(q)) {
            let [x, y] = qubitCoordsFunc(q);
            let {dx, dy, wx, wy} = marker_placement(mi, `${x}:${y}`, hitCount);
            if (mi < 0) {
                ctx.lineWidth = 2;
            } else {
                ctx.lineWidth = 8;
            }
            ctx.strokeStyle = 'magenta'
            ctx.strokeRect(x - dx, y - dy, wx, wy);
            ctx.lineWidth = 1;
            ctx.fillStyle = 'black'
            ctx.fillRect(x - dx, y - dy, wx, wy);
        }
    }
}

let _defensive_draw_enabled = true;

/**
 * @param {!boolean} val
 */
function setDefensiveDrawEnabled(val) {
    _defensive_draw_enabled = val;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!function} body
 */
function defensiveDraw(ctx, body) {
    ctx.save();
    try {
        if (_defensive_draw_enabled) {
            body();
        } else {
            try {
                body();
            } catch (ex) {
                console.error(ex);
            }
        }
    } finally {
        ctx.restore();
    }
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!StateSnapshot} snap
 * @param {!Map<!Sheet, bool>} sheetsToDraw
 */
function drawPanel(ctx, snap, sheetsToDraw) {
    let circuit = snap.circuit;

    let numPropagatedLayers = 0;
    for (let layer of circuit.layers) {
        for (let op of layer.markers) {
            let gate = op.gate;
            if (gate.name === "MARKX" || gate.name === "MARKY" || gate.name === "MARKZ") {
                numPropagatedLayers = Math.max(numPropagatedLayers, op.args[0] + 1);
            }
        }
    }

    let c2dCoordTransform = (x, y) => [x*pitch - OFFSET_X, y*pitch - OFFSET_Y];
    let qubitDrawCoords = q => {
        let x = circuit.qubitCoordData[2 * q];
        let y = circuit.qubitCoordData[2 * q + 1];
        return c2dCoordTransform(x, y);
    };
    let propagatedMarkerLayers = /** @type {!Map<!int, !PropagatedPauliFrames>} */ new Map();
    for (let mi = 0; mi < numPropagatedLayers; mi++) {
        propagatedMarkerLayers.set(mi, PropagatedPauliFrames.fromCircuit(circuit, mi));
    }
    let {dets: dets, obs: obs} = circuit.collectDetectorsAndObservables(false);
    let batch_input = [];
    for (let mi = 0; mi < dets.length; mi++) {
        batch_input.push(dets[mi].mids);
    }
    for (let mi of obs.keys()) {
        batch_input.push(obs.get(mi));
    }
    let batch_output = PropagatedPauliFrames.batchFromMeasurements(circuit, batch_input);
    let batch_index = 0;
    for (let mi = 0; mi < dets.length; mi++) {
        propagatedMarkerLayers.set(~mi, batch_output[batch_index++]);
    }
    for (let mi of obs.keys()) {
        propagatedMarkerLayers.set(~mi ^ (1 << 30), batch_output[batch_index++]);
    }

    let operatedOnQubits = new Set();
    for (let layer of circuit.layers) {
        for (let t of layer.id_ops.keys()) {
            operatedOnQubits.add(t);
        }
    }
    // Build visibility context for sheet-filtered drawing (qubits first phase).
    // Normalize sheetsToDraw (may be null) into a Set of sheet names to render.
    const visibleSheetNames = new Set();
    if (sheetsToDraw && typeof sheetsToDraw.size === 'number' && sheetsToDraw.size > 0) {
        for (const [sheet, on] of sheetsToDraw.entries()) {
            if (on) {
                const name = (sheet && sheet.name) ? sheet.name : String(sheet ?? 'DEFAULT');
                visibleSheetNames.add(name);
            }
        }
    } else if (circuit && circuit.sheets && typeof circuit.sheets.size === 'number') {
        for (const name of circuit.sheets.keys()) visibleSheetNames.add(name);
        if (visibleSheetNames.size === 0) visibleSheetNames.add('DEFAULT');
    } else {
        visibleSheetNames.add('DEFAULT');
    }
    const isQubitVisible = (qid) => {
        try {
            const q = circuit.qubits?.get?.(qid);
            const sheet = q?.sheet ?? 'DEFAULT';
            return visibleSheetNames.has(sheet);
        } catch (_) {
            return true;
        }
    };

    defensiveDraw(ctx, () => {
        ctx.fillStyle = 'white';
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        let [focusX, focusY] = xyToPos(snap.curMouseX, snap.curMouseY);

        // Draw the background polygons.
        let lastPolygonLayer = snap.curLayer;
        for (let r = 0; r <= snap.curLayer; r++) {
            for (let op of circuit.layers[r].markers) {
                if (op.gate.name === 'POLYGON') {
                    lastPolygonLayer = r;
                    break;
                }
            }
        }
        let polygonMarkers = [...circuit.layers[lastPolygonLayer].markers];
        polygonMarkers.sort((a, b) => b.id_targets.length - a.id_targets.length);
        for (let op of polygonMarkers) {
            if (op.gate.name === 'POLYGON') {
                op.id_draw(qubitDrawCoords, ctx);
            }
        }

        // Draw only actual qubits on visible sheets, using panel coordinates when available.
        defensiveDraw(ctx, () => {
            ctx.strokeStyle = 'black';
            for (const q of circuit.allQubits()) {
                if (!isQubitVisible(q)) continue;
                let px, py;
                try {
                    const qq = circuit.qubits?.get?.(q);
                    if (qq && typeof qq.panelX === 'number' && typeof qq.panelY === 'number') {
                        [px, py] = [qq.panelX, qq.panelY];
                    } else {
                        px = circuit.qubitCoordData[2 * q];
                        py = circuit.qubitCoordData[2 * q + 1];
                    }
                } catch (_) {
                    px = circuit.qubitCoordData[2 * q];
                    py = circuit.qubitCoordData[2 * q + 1];
                }
                const [x, y] = c2dCoordTransform(px, py);
                ctx.fillStyle = 'white';
                ctx.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
                ctx.strokeRect(x - rad, y - rad, 2 * rad, 2 * rad);
            }
        });

        for (let [mi, p] of propagatedMarkerLayers.entries()) {
            drawCrossMarkers(ctx, snap, qubitDrawCoords, p, mi);
        }

        const isOpVisible = (op) => {
            // Future: if op.sheets is a Set or name, check it here.
            if (op.sheets && op.sheets.size >= 0) {
                // Placeholder for future semantics; for now treat as visible.
                return true;
            }
            // Default: visible if any target qubit is visible on this panel.
            for (let t of op.id_targets) {
                if (isQubitVisible(t)) return true;
            }
            return false;
        };

        for (let op of circuit.layers[snap.curLayer].iter_gates_and_markers()) {
            if (op.gate.name !== 'POLYGON' && isOpVisible(op)) {
                op.id_draw(qubitDrawCoords, ctx);
            }
        }

        defensiveDraw(ctx, () => {
            ctx.globalAlpha *= 0.25
            for (let [qx, qy] of snap.timelineSet.values()) {
                let [x, y] = c2dCoordTransform(qx, qy);
                ctx.fillStyle = 'yellow';
                ctx.fillRect(x - rad * 1.25, y - rad * 1.25, 2.5*rad, 2.5*rad);
            }
        });

        defensiveDraw(ctx, () => {
            ctx.globalAlpha *= 0.5
            for (let [qx, qy] of snap.focusedSet.values()) {
                let [x, y] = c2dCoordTransform(qx, qy);
                ctx.fillStyle = 'blue';
                ctx.fillRect(x - rad * 1.25, y - rad * 1.25, 2.5*rad, 2.5*rad);
            }
        });

        drawMarkers(ctx, snap, qubitDrawCoords, propagatedMarkerLayers, isQubitVisible);

        if (focusX !== undefined) {
            ctx.save();
            ctx.globalAlpha *= 0.5;
            let [x, y] = c2dCoordTransform(focusX, focusY);
            ctx.fillStyle = 'red';
            ctx.fillRect(x - rad, y - rad, 2*rad, 2*rad);
            ctx.restore();
        }

        defensiveDraw(ctx, () => {
            ctx.globalAlpha *= 0.25;
            ctx.fillStyle = 'blue';
            if (snap.mouseDownX !== undefined && snap.curMouseX !== undefined) {
                let x1 = Math.min(snap.curMouseX, snap.mouseDownX);
                let x2 = Math.max(snap.curMouseX, snap.mouseDownX);
                let y1 = Math.min(snap.curMouseY, snap.mouseDownY);
                let y2 = Math.max(snap.curMouseY, snap.mouseDownY);
                x1 -= 1;
                x2 += 1;
                y1 -= 1;
                y2 += 1;
                x1 -= OFFSET_X;
                x2 -= OFFSET_X;
                y1 -= OFFSET_Y;
                y2 -= OFFSET_Y;
                ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
            }
            for (let [qx, qy] of snap.boxHighlightPreview) {
                let [x, y] = c2dCoordTransform(qx, qy);
                ctx.fillRect(x - rad, y - rad, rad*2, rad*2);
            }
        });
    });

    // Timeline rendering and scrubber have been removed from this panel draw.
}
export {xyToPos, drawPanel, setDefensiveDrawEnabled, OFFSET_X, OFFSET_Y}
