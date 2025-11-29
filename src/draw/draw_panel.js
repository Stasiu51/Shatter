import {pitch, rad, OFFSET_X, OFFSET_Y} from "./config.js"
import {marker_placement} from "../gates/gateset_markers.js";
import {PropagatedPauliFrames} from "../circuit/propagated_pauli_frames.js";
import {stroke_connector_to, draw_x_control, draw_y_control, draw_z_control, draw_swap_control, draw_iswap_control, draw_xswap_control, draw_zswap_control} from "../gates/gate_draw_util.js"
import {beginPathPolygon} from './draw_util.js';
import { parseCssColor } from '../util/color.js';
import { selectionStore } from '../editor/selection_store.js';

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
function drawAnnotations(ctx, snap, qubitCoordsFunc, visibleSheetNames, focusDimmed) {
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
            if (focusDimmed) ctx.globalAlpha *= 0.7;
            ctx.fillStyle = fillStyle;
            ctx.fill();
            ctx.restore();
        }
        if (strokeStyle) {
            ctx.save();
            if (focusDimmed) ctx.globalAlpha *= 0.7;
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
function drawConnections(ctx, snap, qubitCoordsFunc, visibleSheetNames, focusDimmed) {
    const layers = snap.circuit.layers;
    // Accumulate unique edges from all ConnSet annotations up to current layer.
    // Key edges by normalized pair "min-max" and keep style (colour) by last occurrence.
    const edgeMap = new Map(); // key => {q1,q2, colour, thickness, droop}
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
                edgeMap.set(key, {
                    q1: a1,
                    q2: a2,
                    colour: a.COLOUR || a.colour || '#9aa0a6',
                    thickness: (typeof a.thickness === 'number' && isFinite(a.thickness)) ? a.thickness : undefined,
                    droop: (typeof a.droop === 'number' && isFinite(a.droop)) ? a.droop : 0,
                });
            }
        }
    }
    if (edgeMap.size === 0) return;

    ctx.save();
    try {
        ctx.lineCap = 'round';
        for (const { q1, q2, colour, thickness, droop } of edgeMap.values()) {
            let p1, p2;
            try {
                p1 = qubitCoordsFunc(q1);
                p2 = qubitCoordsFunc(q2);
            } catch (_) {
                // If coordinates are missing for either endpoint, skip.
                continue;
            }
            // Draw using shared connector, honoring THICKNESS and DROOP, and color.
            const params = [
                ctx,
                p1[0], p1[1], p2[0], p2[1],
                {
                    thickness: (typeof thickness === 'number' && isFinite(thickness)) ? thickness : 4,
                    droop: (typeof droop === 'number' && isFinite(droop)) ? droop : 0,
                    color: parseCssColor(colour) || '#b0b5ba',
                }
            ];
            if (focusDimmed) {
                ctx.save();
                ctx.globalAlpha *= 0.7;
                stroke_connector_to(...params);
                ctx.restore();
            } else {
                stroke_connector_to(...params);
            }
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
    const propagatedMarkerLayers = snap.propagatedFrames || new Map();

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
        // Focus mode: polygons are always dimmed when focus is active and timeline is visible.
        const _opts = arguments[3] || {};
        const focusActive = !!(snap.timelineSet && snap.timelineSet.size > 0 && !_opts.timelineCollapsed);
        const dimFactor = focusActive ? (typeof _opts.focusDim === 'number' ? _opts.focusDim : 0.5) : 1;
        drawAnnotations(ctx, snap, qubitDrawCoords, visibleSheetNames, dimFactor);

        // Draw connection highlights (latest highlight layer), under connections.
        const hlLayer = findLatestHighlightLayerIndex(circuit, snap.curLayer);
        if (embedding && embedding.type === 'TORUS') {
            drawConnectionHighlights(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, embedding, hlLayer);
        } else {
            // Plane: reuse the same draw helper with trivial split
            drawConnectionHighlights(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, null, hlLayer);
        }

        // Draw connections (under qubits, above polygons). Always dimmed in focus mode.
        if (embedding && embedding.type === 'TORUS') {
            drawConnectionsTorus(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, embedding, dimFactor);
        } else {
            drawConnections(ctx, snap, qubitDrawCoords, visibleSheetNames, dimFactor);
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
                const key = `${meta?.panelX},${meta?.panelY}`;
                const dim = focusActive && !snap.timelineSet.has(key);
                ctx.save();
                if (dim) ctx.globalAlpha *= dimFactor;
                ctx.fillStyle = fill || 'white';
                ctx.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
                ctx.strokeRect(x - rad, y - rad, 2 * rad, 2 * rad);
                ctx.restore();
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

        // Gates that visually include a connector between two targets.
        const CONNECTOR_GATES = new Set([
            'CX','CY','CZ','XCX','XCY','YCY',
            'SWAP','ISWAP','ISWAP_DAG','CXSWAP','CZSWAP',
            'MXX','MYY','MZZ',
            'II','SQRT_XX','SQRT_XX_DAG','SQRT_YY','SQRT_YY_DAG','SQRT_ZZ','SQRT_ZZ_DAG',
        ]);

        function drawConnectorSegmentsTorus(q1, q2, color = 'black', thickness = 2) {
            const p1 = getPanelXY(q1);
            const p2 = getPanelXY(q2);
            const segs = torusSegmentsBetween(p1, p2, embedding.Lx, embedding.Ly);
            const prevW = ctx.lineWidth;
            const prevS = ctx.strokeStyle;
            ctx.lineCap = 'round';
            ctx.lineWidth = thickness;
            ctx.strokeStyle = color;
            for (const [[sx, sy], [tx, ty]] of segs) {
                const [dx1, dy1] = c2dCoordTransform(sx, sy);
                const [dx2, dy2] = c2dCoordTransform(tx, ty);
                stroke_connector_to(ctx, dx1, dy1, dx2, dy2);
            }
            ctx.strokeStyle = prevS;
            ctx.lineWidth = prevW;
        }

        function drawGlyphSquaresWithLabel(q1, q2, fillStyle, label1, label2) {
            const pts = [q1, q2].map(qubitDrawCoords);
            for (let i = 0; i < pts.length; i++) {
                const [x, y] = pts[i];
                ctx.fillStyle = fillStyle;
                ctx.fillRect(x - rad, y - rad, rad*2, rad*2);
                ctx.strokeStyle = 'black';
                ctx.strokeRect(x - rad, y - rad, rad*2, rad*2);
                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 12pt monospace';
                const txt = i === 0 ? label1 : (label2 ?? label1);
                ctx.fillText(txt, x, y);
            }
        }

        function drawGateGlyphsByName(name, q1, q2) {
            const [x1, y1] = qubitDrawCoords(q1);
            const [x2, y2] = qubitDrawCoords(q2);
            switch (name) {
                case 'CX': draw_z_control(ctx, x1, y1); draw_x_control(ctx, x2, y2); break;
                case 'CY': draw_z_control(ctx, x1, y1); draw_y_control(ctx, x2, y2); break;
                case 'XCX': draw_x_control(ctx, x1, y1); draw_x_control(ctx, x2, y2); break;
                case 'XCY': draw_x_control(ctx, x1, y1); draw_y_control(ctx, x2, y2); break;
                case 'YCY': draw_y_control(ctx, x1, y1); draw_y_control(ctx, x2, y2); break;
                case 'CZ': draw_z_control(ctx, x1, y1); draw_z_control(ctx, x2, y2); break;
                case 'SWAP': draw_swap_control(ctx, x1, y1); draw_swap_control(ctx, x2, y2); break;
                case 'ISWAP':
                case 'ISWAP_DAG': draw_iswap_control(ctx, x1, y1); draw_iswap_control(ctx, x2, y2); break;
                case 'CXSWAP': draw_zswap_control(ctx, x1, y1); draw_xswap_control(ctx, x2, y2); break;
                case 'CZSWAP': draw_zswap_control(ctx, x1, y1); draw_zswap_control(ctx, x2, y2); break;
                case 'MXX': drawGlyphSquaresWithLabel(q1, q2, 'gray', 'MXX'); break;
                case 'MYY': drawGlyphSquaresWithLabel(q1, q2, 'gray', 'MYY'); break;
                case 'MZZ': drawGlyphSquaresWithLabel(q1, q2, 'gray', 'MZZ'); break;
                case 'II': drawGlyphSquaresWithLabel(q1, q2, 'white', 'II'); break;
                case 'SQRT_XX': drawGlyphSquaresWithLabel(q1, q2, 'yellow', '√XX'); break;
                case 'SQRT_XX_DAG': drawGlyphSquaresWithLabel(q1, q2, 'yellow', '√XX†'); break;
                case 'SQRT_YY': drawGlyphSquaresWithLabel(q1, q2, 'yellow', '√YY'); break;
                case 'SQRT_YY_DAG': drawGlyphSquaresWithLabel(q1, q2, 'yellow', '√YY†'); break;
                case 'SQRT_ZZ': drawGlyphSquaresWithLabel(q1, q2, 'yellow', '√ZZ'); break;
                case 'SQRT_ZZ_DAG': drawGlyphSquaresWithLabel(q1, q2, 'yellow', '√ZZ†'); break;
                default: break;
            }
        }

        for (let op of circuit.layers[snap.curLayer].iter_gates_and_markers()) {
            if (!isOpVisible(op)) continue;
            if (op.gate.name === 'POLYGON') continue;

            // Dim gate if not entirely on focused qubits.
            let gateDim = false;
            if (focusActive) {
                try {
                    gateDim = !op.id_targets.every(q => {
                        const meta = circuit.qubits?.get?.(q);
                        if (!meta) return false;
                        const k = `${meta.panelX},${meta.panelY}`;
                        return snap.timelineSet.has(k);
                    });
                } catch {}
            }
            if (embedding && embedding.type === 'TORUS' && CONNECTOR_GATES.has(op.gate.name) && op.id_targets?.length === 2) {
                const [q1, q2] = [op.id_targets[0], op.id_targets[1]];
                if (isQubitVisible(q1) || isQubitVisible(q2)) {
                    if (gateDim) { ctx.save(); ctx.globalAlpha *= dimFactor; }
                    drawConnectorSegmentsTorus(q1, q2, 'black', 2);
                    drawGateGlyphsByName(op.gate.name, q1, q2);
                    if (gateDim) ctx.restore();
                }
            } else if (op.gate.name && op.gate.name.startsWith('MPP:')) {
                // Custom MPP drawing that reuses connection line logic (toroidal aware),
                // instead of relying on Crumble's single-segment connector.
                if (embedding && embedding.type === 'TORUS') {
                    if (gateDim) ctx.save(), ctx.globalAlpha *= dimFactor;
                    drawMppConnectorsTorus(ctx, op, c2dCoordTransform, getPanelXY, embedding, isQubitVisible);
                    if (gateDim) ctx.restore();
                } else {
                    if (gateDim) ctx.save(), ctx.globalAlpha *= dimFactor;
                    drawMppConnectorsPlane(ctx, op, qubitDrawCoords, isQubitVisible);
                    if (gateDim) ctx.restore();
                }
                if (gateDim) ctx.save(), ctx.globalAlpha *= dimFactor;
                drawMppGlyphs(ctx, op, qubitDrawCoords);
                if (gateDim) ctx.restore();
            } else {
                if (gateDim) ctx.save(), ctx.globalAlpha *= dimFactor;
                op.id_draw(qubitDrawCoords, ctx);
                if (gateDim) ctx.restore();
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

        // Legacy timeline/focus overlays removed; selection overlays below use selectionStore instead.

        // Selection/hover overlays (global selection store; cross-panel synced).
        defensiveDraw(ctx, () => {
            try {
                const sel = selectionStore.snapshot();
                const drawQ = (q, style, colorOverride) => {
                    const [x,y] = qubitDrawCoords(q);
                    if (style === 'hover') {
                        ctx.strokeStyle = colorOverride || '#f2c744';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x - rad*1.3, y - rad*1.3, 2.6*rad, 2.6*rad);
                    } else {
                        ctx.strokeStyle = colorOverride || '#1e90ff';
                        ctx.lineWidth = 3;
                        ctx.strokeRect(x - rad*1.4, y - rad*1.4, 2.8*rad, 2.8*rad);
                    }
                    ctx.lineWidth = 1;
                };

                // Hover outline
                if (sel.hover) {
                    const [kind, rest] = sel.hover.id.split(':',2);
                    if (sel.hover.kind === 'qubit') {
                        const q = parseInt(rest);
                        if (isQubitVisible(q)) drawQ(q, 'hover');
                    } else if (sel.hover.kind === 'gate') {
                        const tokens = sel.hover.id.split(':');
                        const layerIdx = parseInt(tokens[1]);
                        const first = parseInt(tokens[2]);
                        const op = circuit.layers?.[layerIdx]?.id_ops?.get?.(first);
                        if (op) {
                            // Highlight gate qubit squares.
                            for (const q of op.id_targets) if (isQubitVisible(q)) drawQ(q, 'hover');
                            // Highlight connectors between consecutive qubits of the gate.
                            const color = '#f2c744';
                            const thick = 4;
                            for (let k = 1; k < op.id_targets.length; k++) {
                                const q0 = op.id_targets[k-1];
                                const q1 = op.id_targets[k];
                                if (!isQubitVisible(q0) || !isQubitVisible(q1)) continue;
                                if (embedding && embedding.type === 'TORUS') {
                                    const p0 = getPanelXY(q0), p1 = getPanelXY(q1);
                                    const segs = torusSegmentsBetween(p0, p1, embedding.Lx, embedding.Ly);
                                    for (const [[sx,sy],[tx,ty]] of segs) {
                                        const [dx1,dy1] = c2dCoordTransform(sx,sy);
                                        const [dx2,dy2] = c2dCoordTransform(tx,ty);
                                        stroke_connector_to(ctx, dx1, dy1, dx2, dy2, { color, thickness: thick });
                                    }
                                } else {
                                    const [x0,y0] = qubitDrawCoords(q0);
                                    const [x1,y1] = qubitDrawCoords(q1);
                                    stroke_connector_to(ctx, x0, y0, x1, y1, { color, thickness: thick });
                                }
                            }
                        }
                    } else if (sel.hover.kind === 'connection') {
                        const [, sheet, key] = sel.hover.id.split(':');
                        const [q1s,q2s] = key.split('-');
                        const q1 = parseInt(q1s), q2 = parseInt(q2s);
                        const color = '#f2c744';
                        if (embedding && embedding.type === 'TORUS') {
                            const p1 = getPanelXY(q1), p2 = getPanelXY(q2);
                            const segs = torusSegmentsBetween(p1, p2, embedding.Lx, embedding.Ly);
                            for (const [[sx,sy],[tx,ty]] of segs) {
                                const [dx1,dy1] = c2dCoordTransform(sx,sy);
                                const [dx2,dy2] = c2dCoordTransform(tx,ty);
                                stroke_connector_to(ctx, dx1, dy1, dx2, dy2, { color, thickness: 5, droop: 0 });
                            }
                        } else {
                            const [x1,y1] = qubitDrawCoords(q1);
                            const [x2,y2] = qubitDrawCoords(q2);
                            stroke_connector_to(ctx, x1, y1, x2, y2, { color, thickness: 5, droop: 0 });
                        }
                    } else if (sel.hover.kind === 'polygon') {
                        const tokens = sel.hover.id.split(':');
                        const layerIdx = parseInt(tokens[1]);
                        const polyIndex = parseInt(tokens[2]);
                        const anns = circuit.layers?.[layerIdx]?.annotations || [];
                        const poly = anns.find(a => a && a.kind === 'Polygon' && a.polyIndex === polyIndex);
                        const ids = Array.isArray(poly?.targets) ? poly.targets : [];
                        const pts = ids.map(q => qubitDrawCoords(q));
                        if (pts.length >= 3) beginPathPolygon(ctx, pts);
                        ctx.strokeStyle = '#f2c744';
                        ctx.lineWidth = 3;
                        ctx.stroke();
                        ctx.lineWidth = 1;
                    }
                }

                // Selected outline(s)
                if (sel.selected.size > 0) {
                    for (const id of sel.selected) {
                        const tokens = id.split(':');
                        if (sel.kind === 'qubit') {
                            const q = parseInt(tokens[1]);
                            if (isQubitVisible(q)) {
                                drawQ(q, 'selected', selectionStore.getColorFor(id) || '#1e90ff');
                            }
                        } else if (sel.kind === 'gate') {
                            const layerIdx = parseInt(tokens[1]);
                            const first = parseInt(tokens[2]);
                            const op = circuit.layers?.[layerIdx]?.id_ops?.get?.(first);
                            if (op) {
                                const color = selectionStore.getColorFor(id) || '#1e90ff';
                                for (const q of op.id_targets) if (isQubitVisible(q)) {
                                    drawQ(q, 'selected', color);
                                }
                                const thick = 6;
                                for (let k = 1; k < op.id_targets.length; k++) {
                                    const q0 = op.id_targets[k-1];
                                    const q1 = op.id_targets[k];
                                    if (!isQubitVisible(q0) || !isQubitVisible(q1)) continue;
                                    if (embedding && embedding.type === 'TORUS') {
                                        const p0 = getPanelXY(q0), p1 = getPanelXY(q1);
                                        const segs = torusSegmentsBetween(p0, p1, embedding.Lx, embedding.Ly);
                                        for (const [[sx,sy],[tx,ty]] of segs) {
                                            const [dx1,dy1] = c2dCoordTransform(sx,sy);
                                            const [dx2,dy2] = c2dCoordTransform(tx,ty);
                                            stroke_connector_to(ctx, dx1, dy1, dx2, dy2, { color, thickness: thick });
                                        }
                                    } else {
                                        const [x0,y0] = qubitDrawCoords(q0);
                                        const [x1,y1] = qubitDrawCoords(q1);
                                        stroke_connector_to(ctx, x0, y0, x1, y1, { color, thickness: thick });
                                    }
                                }
                            }
                        } else if (sel.kind === 'connection') {
                            const [, sheet, key] = tokens;
                            const [q1s,q2s] = key.split('-');
                            const q1 = parseInt(q1s), q2 = parseInt(q2s);
                            const color = selectionStore.getColorFor(id) || '#1e90ff';
                            if (embedding && embedding.type === 'TORUS') {
                                const p1 = getPanelXY(q1), p2 = getPanelXY(q2);
                                const segs = torusSegmentsBetween(p1, p2, embedding.Lx, embedding.Ly);
                                for (const [[sx,sy],[tx,ty]] of segs) {
                                    const [dx1,dy1] = c2dCoordTransform(sx,sy);
                                    const [dx2,dy2] = c2dCoordTransform(tx,ty);
                                    stroke_connector_to(ctx, dx1, dy1, dx2, dy2, { color, thickness: 6, droop: 0 });
                                }
                            } else {
                                const [x1,y1] = qubitDrawCoords(q1);
                                const [x2,y2] = qubitDrawCoords(q2);
                                stroke_connector_to(ctx, x1, y1, x2, y2, { color, thickness: 6, droop: 0 });
                            }
                        } else if (sel.kind === 'polygon') {
                            const layerIdx = parseInt(tokens[1]);
                            const polyIndex = parseInt(tokens[2]);
                            const anns = circuit.layers?.[layerIdx]?.annotations || [];
                            const poly = anns.find(a => a && a.kind === 'Polygon' && a.polyIndex === polyIndex);
                            const ids = Array.isArray(poly?.targets) ? poly.targets : [];
                            const pts = ids.map(q => qubitDrawCoords(q));
                            if (pts.length >= 3) beginPathPolygon(ctx, pts);
                            ctx.strokeStyle = selectionStore.getColorFor(id) || '#1e90ff';
                            ctx.lineWidth = 4;
                            ctx.stroke();
                            ctx.lineWidth = 1;
                        }
                    }
                }
            } catch {}
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

function drawConnectionsTorus(ctx, snap, c2dCoordTransform, getPanelXY, visibleSheetNames, embedding, focusDimmed) {
    const layers = snap.circuit.layers;
    const edgeMap = new Map(); // key => {q1,q2, colour, thickness, droop}
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
                edgeMap.set(key, {
                    q1: a1,
                    q2: a2,
                    colour: a.COLOUR || a.colour || '#9aa0a6',
                    thickness: (typeof a.thickness === 'number' && isFinite(a.thickness)) ? a.thickness : undefined,
                    droop: (typeof a.droop === 'number' && isFinite(a.droop)) ? a.droop : 0,
                });
            }
        }
    }
    if (edgeMap.size === 0) return;
    ctx.save();
    try {
        ctx.lineCap = 'round';
        for (const { q1, q2, colour, thickness, droop } of edgeMap.values()) {
            let p1, p2;
            try {
                p1 = getPanelXY(q1);
                p2 = getPanelXY(q2);
            } catch { continue; }
            const segs = torusSegmentsBetween(p1, p2, embedding.Lx, embedding.Ly);
            for (const [[sx, sy], [tx, ty]] of segs) {
                const [dx1, dy1] = c2dCoordTransform(sx, sy);
                const [dx2, dy2] = c2dCoordTransform(tx, ty);
                const params = [ctx, dx1, dy1, dx2, dy2, {
                    thickness: (typeof thickness === 'number' && isFinite(thickness)) ? thickness : 4,
                    droop: (typeof droop === 'number' && isFinite(droop)) ? droop : 0,
                    color: parseCssColor(colour) || '#b0b5ba',
                }];
                if (focusDimmed) {
                    ctx.save(); ctx.globalAlpha *= 0.7; stroke_connector_to(...params); ctx.restore();
                } else {
                    stroke_connector_to(...params);
                }
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

// --- MPP custom drawing (reuse connection logic) ----------------------------
function drawMppGlyphs(ctx, op, coordFunc) {
    // Draw per-qubit squares + labels like Crumble does.
    try {
        const name = op?.gate?.name || '';
        const bases = name.startsWith('MPP:') ? name.substring(4) : '';
        for (let k = 0; k < op.id_targets.length; k++) {
            const t = op.id_targets[k];
            const [x, y] = coordFunc(t);
            ctx.fillStyle = 'gray';
            ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
            ctx.strokeStyle = 'black';
            ctx.strokeRect(x - rad, y - rad, rad * 2, rad * 2);
            ctx.fillStyle = 'black';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 12pt monospace';
            const ch = bases[k] || '';
            ctx.fillText(ch, x, y - 1);
            ctx.font = '5pt monospace';
            ctx.fillText('MPP', x, y + 8);
        }
    } catch (_) { /* ignore draw failures */ }
}

function drawMppConnectorsPlane(ctx, op, coordFunc, isQubitVisible) {
    // Connect successive targets with the same style used for connectors.
    // Skip segments where endpoints are not visible on this panel.
    ctx.save();
    try {
        ctx.lineCap = 'round';
        const prevW = ctx.lineWidth;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'black';
        let prev = null;
        for (let k = 0; k < op.id_targets.length; k++) {
            const q = op.id_targets[k];
            if (typeof isQubitVisible === 'function' && !isQubitVisible(q)) {
                prev = null;
                continue;
            }
            const [x, y] = coordFunc(q);
            if (prev) {
                const [px, py] = prev;
                stroke_connector_to(ctx, px, py, x, y);
            }
            prev = [x, y];
        }
        ctx.lineWidth = prevW;
    } finally {
        ctx.restore();
    }
}

function drawMppConnectorsTorus(ctx, op, c2dCoordTransform, getPanelXY, embedding, isQubitVisible) {
    // Split segments across torus seams like connections do.
    ctx.save();
    try {
        ctx.lineCap = 'round';
        const prevW = ctx.lineWidth;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'black';
        let prev = null;
        for (let k = 0; k < op.id_targets.length; k++) {
            const q = op.id_targets[k];
            if (typeof isQubitVisible === 'function' && !isQubitVisible(q)) {
                prev = null;
                continue;
            }
            const p = getPanelXY(q);
            if (prev) {
                const segs = torusSegmentsBetween(prev, p, embedding.Lx, embedding.Ly);
                for (const [[sx, sy], [tx, ty]] of segs) {
                    const [dx1, dy1] = c2dCoordTransform(sx, sy);
                    const [dx2, dy2] = c2dCoordTransform(tx, ty);
                    stroke_connector_to(ctx, dx1, dy1, dx2, dy2);
                }
            }
            prev = p;
        }
        ctx.lineWidth = prevW;
    } finally {
        ctx.restore();
    }
}

export {xyToPos, drawPanel, setDefensiveDrawEnabled, OFFSET_X, OFFSET_Y, torusSegmentsBetween}
