import {rad} from "./config.js";
import {stroke_connector_to} from "../gates/gate_draw_util.js";
import {marker_placement} from '../gates/gateset_markers.js';

/**
 * Draws the timeline only (no left panel, no cross-canvas links).
 * This is adapted from timeline_viewer.js but assumes the entire canvas is the timeline.
 *
 * Deviations from upstream drawTimeline:
 * - Does not assume a left-half panel; uses the full provided viewport width.
 * - Does not draw cross-canvas links to a timeslice viewer (panels are separate canvases).
 * - Accepts viewportContentWidth, timelineZoom, and scrollOffContent to avoid offscreen blitting.
 *
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!StateSnapshot} snap
 * @param {!Map<!number, !import('../circuit/propagated_pauli_frames.js').PropagatedPauliFrames>} propagatedMarkerLayers
 * @param {!function(!number): ![!number, !number]} timesliceQubitCoordsFunc  // Only used for labeling (coord lookup)
 * @param {!number} numLayers
 * @param {{ viewportContentWidth: number }} opts
 */
export function drawTimelineOnly(ctx, snap, propagatedMarkerLayers, timesliceQubitCoordsFunc, numLayers, opts = {}) {
  const viewportContentWidth = Math.max(1, Math.floor(opts.viewportContentWidth || ctx.canvas.width));

  // Sort lines by (y,x) from current timeslice layout.
  let qubits = snap.timelineQubits();
  qubits.sort((a, b) => {
    let [x1, y1] = timesliceQubitCoordsFunc(a);
    let [x2, y2] = timesliceQubitCoordsFunc(b);
    if (y1 !== y2) return y1 - y2;
    return x1 - x2;
  });

  // Assign base y and compact x per row group.
  let base_y2xy = new Map();
  let prev_y = undefined;
  let cur_x = 0;
  let cur_y = 0;
  let max_run = 0;
  let cur_run = 0;
  for (let q of qubits) {
    let [x, y] = timesliceQubitCoordsFunc(q);
    cur_y += 32; // TIMELINE_PITCH
    if (prev_y !== y) {
      prev_y = y;
      cur_x = 0; // left margin already applied by caller transform
      max_run = Math.max(max_run, cur_run);
      cur_run = 0;
      cur_y += 32 * 0.25; // row spacing
    } else {
      cur_x += rad * 0.25;
      cur_run++;
    }
    base_y2xy.set(`${x},${y}`, [Math.round(cur_x) + 0.5, Math.round(cur_y) + 0.5]);
  }

  // Horizontal slotting and visible time window around curLayer.
  const x_pitch = 32 + Math.ceil(rad * max_run * 0.25);
  const num_cols_half = Math.floor(viewportContentWidth / (2 * x_pitch));
  const min_t_free = snap.curLayer - num_cols_half + 1;
  const min_t_clamp = Math.max(0, Math.min(min_t_free, numLayers - num_cols_half * 2 + 1));
  const max_t = Math.min(min_t_clamp + num_cols_half * 2 + 2, numLayers);

  const t2t = (t) => {
    let dt = t - snap.curLayer;
    dt -= min_t_clamp - min_t_free;
    return dt * x_pitch;
  };

  const coordTransform_t = ([x, y, t]) => {
    const key = `${x},${y}`;
    if (!base_y2xy.has(key)) return [undefined, undefined];
    const [xb, yb] = base_y2xy.get(key);
    return [xb + t2t(t), yb];
  };
  const qubitTimeCoords = (q, t) => {
    const [x, y] = timesliceQubitCoordsFunc(q);
    return coordTransform_t([x, y, t]);
  };

  // Clear full canvas (caller sets transforms).
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Pauli propagation overlays per time step.
  const hitCounts = new Map();
  for (let [mi, p] of propagatedMarkerLayers.entries()) {
    for (let t = min_t_clamp - 1; t <= max_t; t++) {
      if (!hitCounts.has(t)) hitCounts.set(t, new Map());
      const hitCount = hitCounts.get(t);
      const p1 = p.atLayer(t + 0.5);
      const p0 = p.atLayer(t);

      // Basis bars.
      for (let [q, b] of p1.bases.entries()) {
        let { dx, dy, wx, wy } = marker_placement(mi, q, hitCount);
        if (mi >= 0 && mi < 4) {
          dx = 0;
          wx = x_pitch;
          wy = 5;
          dy = (mi === 0) ? 10 : (mi === 1) ? 5 : (mi === 2) ? 0 : -5;
        } else {
          dx -= x_pitch / 2;
        }
        const [x, y] = qubitTimeCoords(q, t);
        if (x === undefined || y === undefined) continue;
        ctx.fillStyle = b === 'X' ? 'red' : b === 'Y' ? 'green' : b === 'Z' ? 'blue' : 'black';
        ctx.fillRect(x - dx, y - dy, wx, wy);
      }

      // Errors.
      for (let q of p0.errors) {
        let { dx, dy, wx, wy } = marker_placement(mi, q, hitCount);
        dx -= x_pitch / 2;
        const [x, y] = qubitTimeCoords(q, t - 0.5);
        if (x === undefined || y === undefined) continue;
        ctx.strokeStyle = 'magenta';
        ctx.lineWidth = 8;
        ctx.strokeRect(x - dx, y - dy, wx, wy);
        ctx.lineWidth = 1;
        ctx.fillStyle = 'black';
        ctx.fillRect(x - dx, y - dy, wx, wy);
      }

      // Crossings.
      for (let { q1, q2, color } of p0.crossings) {
        const [x1, y1] = qubitTimeCoords(q1, t);
        const [x2, y2] = qubitTimeCoords(q2, t);
        ctx.strokeStyle = color === 'X' ? 'red' : color === 'Y' ? 'green' : color === 'Z' ? 'blue' : 'purple';
        ctx.lineWidth = 8;
        stroke_connector_to(ctx, x1, y1, x2, y2);
        ctx.lineWidth = 1;
      }
    }
  }

  // Highlight current layer column.
  ctx.save();
  ctx.globalAlpha *= 0.5;
  ctx.fillStyle = 'black';
  ctx.fillRect(t2t(snap.curLayer) - x_pitch / 2, 0, x_pitch, ctx.canvas.height);
  ctx.restore();

  // Wire lines.
  ctx.strokeStyle = 'black';
  ctx.fillStyle = 'black';
  for (let q of qubits) {
    const [x0, y0] = qubitTimeCoords(q, min_t_clamp - 1);
    const [x1, y1] = qubitTimeCoords(q, max_t + 1);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // Wire labels.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let q of qubits) {
    const [x, y] = qubitTimeCoords(q, min_t_clamp - 1);
    const qx = snap.circuit.qubitCoordData[q * 2];
    const qy = snap.circuit.qubitCoordData[q * 2 + 1];
    ctx.fillText(`${qx},${qy}:`, x, y);
  }

  // Gate overlays per time slice.
  for (let time = min_t_clamp; time <= max_t; time++) {
    const qubitsCoordsFuncForLayer = (q) => qubitTimeCoords(q, time);
    const layer = snap.circuit.layers[time];
    if (!layer) continue;
    for (let op of layer.iter_gates_and_markers()) {
      op.id_draw(qubitsCoordsFuncForLayer, ctx);
    }
  }
}

