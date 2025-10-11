import {pitch, rad, OFFSET_X, OFFSET_Y} from "./config.js"
import {marker_placement} from "../gates/gateset_markers.js";
import {PropagatedPauliFrames} from "../circuit/propagated_pauli_frames.js";
import {stroke_connector_to} from "../gates/gate_draw_util.js"
import {beginPathPolygon} from './draw_util.js';
import { parseCssColor } from '../util/color.js';

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
function drawCrossMarkers(ctx, snap, qubitCoordsFunc, propagatedMarkers, mi, isOpVisible) {
    let crossings = propagatedMarkers.atLayer(snap.curLayer).crossings;
    if (crossings !== undefined) {
        const layer = snap.circuit.layers[snap.curLayer];
        for (let {q1, q2, color} of crossings) {
            const op = layer.id_ops.get(q1) || layer.id_ops.get(q2);
            if (!op) continue;
            if (typeof isOpVisible === 'function' && !isOpVisible(op)) continue;
            const [x1, y1] = qubitCoordsFunc(q1);
            const [x2, y2] = qubitCoordsFunc(q2);
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
    let hitCount = new Map();
    for (let [mi, p] of propagatedMarkerLayers.entries()) {
        drawSingleMarker(ctx, snap, qubitCoordsFunc, p, mi, hitCount, isQubitVisible);
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

// --- Annotations (Polygons) -------------------------------------------------
/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!StateSnapshot} snap
 * @param {!function(q: !int): ![!number, !number]} qubitCoordsFunc
 * @param {!Set<string>} visibleSheetNames
 */
function drawAnnotations(ctx, snap, qubitCoordsFunc, visibleSheetNames) {
    // Find latest layer up to curLayer that has Polygon annotations.
    const layers = snap.circuit.layers;
    let last = -1;
    for (let r = 0; r <= snap.curLayer && r < layers.length; r++) {
        const anns = layers[r].annotations || [];
        if (anns.some(a => a && a.kind === 'Polygon')) last = r;
    }
    if (last < 0) return;
    const anns = (layers[last].annotations || []).filter(a => a && a.kind === 'Polygon');
    if (anns.length === 0) return;

    // Sort larger polygons first (by number of vertices) for nicer layering.
    anns.sort((a, b) => (b.targets?.length || 0) - (a.targets?.length || 0));

    for (const a of anns) {
        const sheetName = a.sheet || 'DEFAULT';
        if (!visibleSheetNames.has(sheetName)) continue;
        const ids = Array.isArray(a.targets) ? a.targets : [];
        if (ids.length === 0) continue;
        const coords = [];
        try {
            for (const q of ids) coords.push(qubitCoordsFunc(q));
        } catch (_) {
            // Missing coords; skip this polygon.
            continue;
        }
        // Determine fill/stroke styles, reusing shared color parsing.
        const fillStyle = (a.fill && a.fill !== 'none') ? parseCssColor(a.fill) : null;
        const strokeStyle = (a.stroke && a.stroke !== 'none') ? parseCssColor(a.stroke) : null;

        beginPathPolygon(ctx, coords);
        if (fillStyle) {
            ctx.save();
            ctx.fillStyle = fillStyle;
            ctx.fill();
            ctx.restore();
        }
        if (strokeStyle) {
            ctx.save();
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    }
}

// --- Connections (under qubits, above polygons) ----------------------------
/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!StateSnapshot} snap
 * @param {!function(q: !int): ![!number, !number]} qubitCoordsFunc
 * @param {!Set<string>} visibleSheetNames
 */
function drawConnections(ctx, snap, qubitCoordsFunc, visibleSheetNames) {
    const layers = snap.circuit.layers;
    // Accumulate unique edges from all ConnSet annotations up to current layer.
    // Key edges by normalized pair "min-max" and keep style (colour) by last occurrence.
    const edgeMap = new Map(); // key => {q1,q2, colour}
    for (let r = 0; r <= snap.curLayer && r < layers.length; r++) {
        const anns = layers[r].annotations || [];
        for (const a of anns) {
            if (!a || a.kind !== 'ConnSet') continue;
            const sheetName = a.sheet.name || 'DEFAULT';
            if (!visibleSheetNames.has(sheetName)) continue;
            const edges = Array.isArray(a.edges) ? a.edges : [];
            for (const e of edges) {
                if (!Array.isArray(e) || e.length !== 2) continue;
                let [q1, q2] = e.map(v => parseInt(v));
                if (!(Number.isFinite(q1) && Number.isFinite(q2))) continue;
                const a1 = Math.min(q1, q2);
                const a2 = Math.max(q1, q2);
                const key = `${a1}-${a2}`;
                edgeMap.set(key, { q1: a1, q2: a2, colour: a.COLOUR || a.colour || '#9aa0a6' });
            }
        }
    }
    if (edgeMap.size === 0) return;

    ctx.save();
    try {
        ctx.lineCap = 'round';
        ctx.lineWidth = 4; // slightly thicker and dimmer than multi-qubit ops
        for (const { q1, q2, colour } of edgeMap.values()) {
            let p1, p2;
            try {
                p1 = qubitCoordsFunc(q1);
                p2 = qubitCoordsFunc(q2);
            } catch (_) {
                // If coordinates are missing for either endpoint, skip.
                continue;
            }
            ctx.strokeStyle = parseCssColor(colour) || '#b0b5ba';
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.stroke();
        }
    } finally {
        ctx.restore();
    }
}

// --- Highlights (panel-only, latest layer) ----------------------------------
function findLatestHighlightLayerIndex(circuit, upTo) {
    const maxIdx = Math.min(upTo, circuit.layers.length - 1);
    for (let r = maxIdx; r >= 0; r--) {
        const anns = circuit.layers[r].annotations || [];
        const hasQ = anns.some(a => a && a.kind === 'QubitHighlight');
        const hasC = anns.some(a => a && a.kind === 'ConnSet' && a.highlight && a.highlight.enabled);
        if (hasQ || hasC) return r;
    }
    return -1;
}

function drawConnectionHighlights(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, embedding, layerIndex) {
    if (layerIndex < 0) return;
    const anns = snap.circuit.layers[layerIndex].annotations || [];
    const connSets = anns.filter(a => a && a.kind === 'ConnSet' && a.highlight && a.highlight.enabled);
    if (connSets.length === 0) return;
    ctx.save();
    try {
        ctx.lineCap = 'round';
        for (const a of connSets) {
            const sheetName = a.sheet?.name || a.sheet || 'DEFAULT';
            if (!visibleSheetNames.has(sheetName)) continue;
            const edges = Array.isArray(a.edges) ? a.edges : [];
            const baseColor = a.highlight?.color || a.COLOUR || a.colour || '#FFD500';
            ctx.strokeStyle = parseCssColor(baseColor) || '#FFD500';
            ctx.globalAlpha *= 0.6;
            ctx.lineWidth = 6; // underlay thicker than connection line
            for (const e of edges) {
                if (!Array.isArray(e) || e.length !== 2) continue;
                let [q1, q2] = e.map(v => parseInt(v));
                if (!(Number.isFinite(q1) && Number.isFinite(q2))) continue;
                let p1, p2;
                try {
                    p1 = getPanelXY(q1);
                    p2 = getPanelXY(q2);
                } catch { continue; }
                const segs = (embedding && embedding.type === 'TORUS')
                    ? torusSegmentsBetween(p1, p2, embedding.Lx, embedding.Ly)
                    : [[p1, p2]];
                for (const [[sx, sy], [tx, ty]] of segs) {
                    const [dx1, dy1] = c2dCoordTransform(sx, sy);
                    const [dx2, dy2] = c2dCoordTransform(tx, ty);
                    ctx.beginPath();
                    ctx.moveTo(dx1, dy1);
                    ctx.lineTo(dx2, dy2);
                    ctx.stroke();
                }
            }
        }
    } finally {
        ctx.restore();
    }
}

function drawQubitHighlights(ctx, snap, qubitDrawCoords, visibleSheetNames, layerIndex) {
    if (layerIndex < 0) return;
    const anns = snap.circuit.layers[layerIndex].annotations || [];
    const sets = anns.filter(a => a && a.kind === 'QubitHighlight');
    if (sets.length === 0) return;
    ctx.save();
    try {
        for (const a of sets) {
            const color = parseCssColor(a.color) || 'rgba(255,215,0,0.6)';
            ctx.fillStyle = color;
            ctx.globalAlpha *= 0.8;
            const qids = Array.isArray(a.qubits) ? a.qubits : [];
            for (const q of qids) {
                try {
                    const qmeta = snap.circuit.qubits?.get?.(q);
                    const sheetName = qmeta?.sheet || 'DEFAULT';
                    if (!visibleSheetNames.has(sheetName)) continue;
                    const [x, y] = qubitDrawCoords(q);
                    // Slightly larger square underlay
                    const k = 1.3;
                    ctx.fillRect(x - rad * k, y - rad * k, 2 * rad * k, 2 * rad * k);
                } catch (_) { /* ignore */ }
            }
        }
    } finally {
        ctx.restore();
    }
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

    const embedding = circuit.embedding || { type: 'PLANE' };
    const c2dCoordTransform = (x, y) => [x*pitch - OFFSET_X, y*pitch - OFFSET_Y];
    const modWrap = (v, L) => ((v % L) + L) % L;
    const getPanelXY = (q) => {
        const qq = circuit.qubits?.get?.(q);
        if (!qq || typeof qq.panelX !== 'number' || typeof qq.panelY !== 'number') {
            throw new Error(`Missing panel coords for qubit ${q}`);
        }
        let x = qq.panelX;
        let y = qq.panelY;
        if (embedding && embedding.type === 'TORUS') {
            x = modWrap(x, embedding.Lx);
            y = modWrap(y, embedding.Ly);
        }
        return [x, y];
    };
    const qubitDrawCoords = q => c2dCoordTransform(...getPanelXY(q));
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
    if (sheetsToDraw && typeof sheetsToDraw.size === 'number') {
        // Respect explicit selection; if empty, draw nothing.
        for (const name of sheetsToDraw.values()) {
            visibleSheetNames.add(name);
        }
    } else if (circuit && circuit.sheets && typeof circuit.sheets.size === 'number') {
        // No selection provided; default to all sheets known in circuit.
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

        // Draw torus domain bounding box to indicate wrap edges.
        if (embedding && embedding.type === 'TORUS') {
            ctx.save();
            try {
                const [x0, y0] = c2dCoordTransform(0, 0);
                ctx.strokeStyle = '#9aa0a6';
                ctx.lineWidth = 1;
                if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);
                ctx.globalAlpha *= 0.9;
                ctx.strokeRect(x0, y0, embedding.Lx * pitch, embedding.Ly * pitch);
            } finally {
                ctx.restore();
            }
        }

        // Draw annotation polygons under qubits.
        drawAnnotations(ctx, snap, qubitDrawCoords, visibleSheetNames);

        // Draw connection highlights (latest highlight layer), under connections.
        const hlLayer = findLatestHighlightLayerIndex(circuit, snap.curLayer);
        if (embedding && embedding.type === 'TORUS') {
            drawConnectionHighlights(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, embedding, hlLayer);
        } else {
            // Plane: reuse the same draw helper with trivial split
            drawConnectionHighlights(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, null, hlLayer);
        }

        // Draw connections (under qubits, above polygons).
        if (embedding && embedding.type === 'TORUS') {
            drawConnectionsTorus(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, embedding);
        } else {
            drawConnections(ctx, snap, qubitDrawCoords, visibleSheetNames);
        }

        // Draw qubit highlights (latest highlight layer), under qubit squares.
        drawQubitHighlights(ctx, snap, qubitDrawCoords, visibleSheetNames, hlLayer);

        // Draw only actual qubits on visible sheets, using panel coordinates when available.
        defensiveDraw(ctx, () => {
            ctx.strokeStyle = 'black';
            for (const q of circuit.allQubits()) {
                if (!isQubitVisible(q)) continue;
                const [x, y] = qubitDrawCoords(q);
                const meta = circuit.qubits?.get?.(q);
                // Fill with per-qubit colour if present; default white.
                const fill = (meta && meta.colour) ? parseCssColor(meta.colour) : 'white';
                ctx.fillStyle = fill || 'white';
                ctx.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
                ctx.strokeRect(x - rad, y - rad, 2 * rad, 2 * rad);
            }
        });

        // Crossings are drawn after gates; see below.

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

        // Draw crossings after gates, using gate-derived visibility.
        for (let [mi, p] of propagatedMarkerLayers.entries()) {
            if (embedding && embedding.type === 'TORUS') {
                drawCrossMarkersTorus(ctx, snap, c2dCoordTransform, getPanelXY, p, mi, isOpVisible, embedding);
            } else {
                drawCrossMarkers(ctx, snap, qubitDrawCoords, p, mi, isOpVisible);
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
// --- Torus helpers and variants --------------------------------------------
function wrappedDelta(d, L) { return d - Math.round(d / L) * L; }
function torusSegmentsBetween(p1, p2, Lx, Ly) {
    // Inputs assumed in-domain [0,Lx) x [0,Ly). Return array of segments [[x1,y1],[x2,y2]]
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

    // Nine candidate virtual positions for p2
    const candidates = [
        { tag: 'base',       vx: x2,       vy: y2       },
        { tag: 'left',       vx: x2 - Lx,  vy: y2       },
        { tag: 'right',      vx: x2 + Lx,  vy: y2       },
        { tag: 'up',         vx: x2,       vy: y2 + Ly  },
        { tag: 'down',       vx: x2,       vy: y2 - Ly  },
        { tag: 'left_up',    vx: x2 - Lx,  vy: y2 + Ly  },
        { tag: 'left_down',  vx: x2 - Lx,  vy: y2 - Ly  },
        { tag: 'right_up',   vx: x2 + Lx,  vy: y2 + Ly  },
        { tag: 'right_down', vx: x2 + Lx,  vy: y2 - Ly  },
    ];
    let best = candidates[0];
    let bestD2 = dist2(x1, y1, best.vx, best.vy);
    for (let k = 1; k < candidates.length; k++) {
        const c = candidates[k];
        const d2 = dist2(x1, y1, c.vx, c.vy);
        if (d2 < bestD2) { best = c; bestD2 = d2; }
    }

    const dx = best.vx - x1;
    const dy = best.vy - y1;
    const eps = 1e-12;

    switch (best.tag) {
        case 'base':
            // Straight path within the domain.
            return [[[x1, y1], [x2, y2]]];
        case 'left': {
            // Cross x=0 seam once.
            const ex = 0;
            const t = Math.abs(dx) > eps ? (ex - x1) / dx : 0.5;
            const ey = y1 + dy * t;
            return [[[x1, y1], [0, ey]], [[Lx, ey], [x2, y2]]];
        }
        case 'right': {
            // Cross x=Lx seam once.
            const ex = Lx;
            const t = Math.abs(dx) > eps ? (ex - x1) / dx : 0.5;
            const ey = y1 + dy * t;
            return [[[x1, y1], [Lx, ey]], [[0, ey], [x2, y2]]];
        }
        case 'down': {
            // Cross y=0 seam once.
            const ey = 0;
            const t = Math.abs(dy) > eps ? (ey - y1) / dy : 0.5;
            const ex = x1 + dx * t;
            return [[[x1, y1], [ex, 0]], [[ex, Ly], [x2, y2]]];
        }
        case 'up': {
            // Cross y=Ly seam once.
            const ey = Ly;
            const t = Math.abs(dy) > eps ? (ey - y1) / dy : 0.5;
            const ex = x1 + dx * t;
            return [[[x1, y1], [ex, Ly]], [[ex, 0], [x2, y2]]];
        }
        case 'left_up':
        case 'left_down':
        case 'right_up':
        case 'right_down':
            // Diagonal wrap: cross one vertical seam and one horizontal seam.
            // Determine target seams for this tag.
            const ex1 = (best.tag.startsWith('left')) ? 0 : Lx;          // first vertical seam in unfolded space
            const exOpp = ex1 === 0 ? Lx : 0;                            // opposite vertical edge
            const ey1 = (best.tag.endsWith('up')) ? Ly : 0;              // first horizontal seam in unfolded space
            const eyOpp = ey1 === 0 ? Ly : 0;                            // opposite horizontal edge

            // Intersections along the ray to p2v in the unfolded plane.
            const tX = Math.abs(dx) > eps ? (ex1 - x1) / dx : Infinity;  // where x reaches ex1
            const tY = Math.abs(dy) > eps ? (ey1 - y1) / dy : Infinity;  // where y reaches ey1
            const Ax = ex1;
            const Ay = y1 + dy * (isFinite(tX) ? tX : 0.5);
            const Bx = x1 + dx * (isFinite(tY) ? tY : 0.5);
            const By = ey1;

            if (tX < tY) {
                // Cross vertical seam first at (ex1, Ay), teleport to (exOpp, Ay), continue to y=ey1.
                const deltaX = exOpp - ex1; // ±Lx
                const seg1 = [[x1, y1], [Ax, Ay]];
                const seg2 = [[exOpp, Ay], [Bx + deltaX, By]];
                const seg3 = [[Bx + deltaX, eyOpp], [x2, y2]];
                return [seg1, seg2, seg3];
            } else {
                // Cross horizontal seam first at (Bx, ey1), teleport to (Bx, eyOpp), continue to x=ex1.
                const deltaY = eyOpp - ey1; // ±Ly
                const seg1 = [[x1, y1], [Bx, By]];
                const seg2 = [[Bx, eyOpp], [Ax, Ay + deltaY]];
                const seg3 = [[exOpp, Ay + deltaY], [x2, y2]];
                return [seg1, seg2, seg3];
            }
        default:
            return [[[x1, y1], [x2, y2]]];
    }
}

function drawConnectionsTorus(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, embedding) {
    const layers = snap.circuit.layers;
    const edgeMap = new Map();
    for (let r = 0; r <= snap.curLayer && r < layers.length; r++) {
        const anns = layers[r].annotations || [];
        for (const a of anns) {
            if (!a || a.kind !== 'ConnSet') continue;
            const sheetName = a.sheet.name || 'DEFAULT';
            if (!visibleSheetNames.has(sheetName)) continue;
            const edges = Array.isArray(a.edges) ? a.edges : [];
            for (const e of edges) {
                if (!Array.isArray(e) || e.length !== 2) continue;
                let [q1, q2] = e.map(v => parseInt(v));
                if (!(Number.isFinite(q1) && Number.isFinite(q2))) continue;
                const a1 = Math.min(q1, q2);
                const a2 = Math.max(q1, q2);
                const key = `${a1}-${a2}`;
                edgeMap.set(key, { q1: a1, q2: a2, colour: a.COLOUR || a.colour || '#9aa0a6' });
            }
        }
    }
    if (edgeMap.size === 0) return;
    ctx.save();
    try {
        ctx.lineCap = 'round';
        ctx.lineWidth = 4;
        for (const { q1, q2, colour } of edgeMap.values()) {
            let p1, p2;
            try {
                p1 = getPanelXY(q1);
                p2 = getPanelXY(q2);
            } catch { continue; }
            ctx.strokeStyle = parseCssColor(colour) || '#b0b5ba';
            const segs = torusSegmentsBetween(p1, p2, embedding.Lx, embedding.Ly);
            for (const [[sx, sy], [tx, ty]] of segs) {
                const [dx1, dy1] = c2dCoordTransform(sx, sy);
                const [dx2, dy2] = c2dCoordTransform(tx, ty);
                ctx.beginPath();
                ctx.moveTo(dx1, dy1);
                ctx.lineTo(dx2, dy2);
                ctx.stroke();
            }
        }
    } finally {
        ctx.restore();
    }
}

function drawCrossMarkersTorus(ctx, snap, c2dCoordTransform, getPanelXY, propagatedMarkers, mi, isOpVisible, embedding) {
    let crossings = propagatedMarkers.atLayer(snap.curLayer).crossings;
    if (crossings === undefined) return;
    const layer = snap.circuit.layers[snap.curLayer];
    for (let {q1, q2, color} of crossings) {
        const op = layer.id_ops.get(q1) || layer.id_ops.get(q2);
        if (!op) continue;
        if (typeof isOpVisible === 'function' && !isOpVisible(op)) continue;
        const [x1p, y1p] = getPanelXY(q1);
        const [x2p, y2p] = getPanelXY(q2);
        if (color === 'X') ctx.strokeStyle = 'red';
        else if (color === 'Y') ctx.strokeStyle = 'green';
        else if (color === 'Z') ctx.strokeStyle = 'blue';
        else ctx.strokeStyle = 'purple';
        ctx.lineWidth = 8;
        const segs = torusSegmentsBetween([x1p, y1p], [x2p, y2p], embedding.Lx, embedding.Ly);
        for (const [[sx, sy], [tx, ty]] of segs) {
            const [dx1, dy1] = c2dCoordTransform(sx, sy);
            const [dx2, dy2] = c2dCoordTransform(tx, ty);
            stroke_connector_to(ctx, dx1, dy1, dx2, dy2);
        }
        ctx.lineWidth = 1;
    }
}

export {xyToPos, drawPanel, setDefensiveDrawEnabled, OFFSET_X, OFFSET_Y}
