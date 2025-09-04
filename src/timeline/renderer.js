import {StateSnapshot} from '../draw/state_snapshot.js';
import {drawTimelineOnly} from '../draw/timeline_only.js';
import {pitch, OFFSET_X, OFFSET_Y} from '../draw/config.js';
import {drawScrubber} from '../draw/scrubber.js';
import {PropagatedPauliFrames} from '../circuit/propagated_pauli_frames.js';

export const TIMELINE_PITCH = 32; // keep in sync with Crumble

export function computePropagated(circuit) {
  const propagated = new Map();
  let numPropagatedLayers = 0;
  for (let layer of circuit.layers) {
    for (let op of layer.markers) {
      const gate = op.gate;
      if (gate.name === 'MARKX' || gate.name === 'MARKY' || gate.name === 'MARKZ') {
        numPropagatedLayers = Math.max(numPropagatedLayers, op.args[0] + 1);
      }
    }
  }
  for (let mi = 0; mi < numPropagatedLayers; mi++) {
    propagated.set(mi, PropagatedPauliFrames.fromCircuit(circuit, mi));
  }
  const {dets, obs} = circuit.collectDetectorsAndObservables(false);
  const batch_input = [];
  for (let mi = 0; mi < dets.length; mi++) batch_input.push(dets[mi].mids);
  for (let mi of obs.keys()) batch_input.push(obs.get(mi));
  const batch_output = PropagatedPauliFrames.batchFromMeasurements(circuit, batch_input);
  let batch_index = 0;
  for (let mi = 0; mi < dets.length; mi++) propagated.set(~mi, batch_output[batch_index++]);
  for (let mi of obs.keys()) propagated.set(~mi ^ (1 << 30), batch_output[batch_index++]);
  return propagated;
}

export function computeContentHeightOffscreenPx(circuit) {
  if (!circuit) return 0;
  const used = circuit.allQubits();
  const qubits = [...used.values()];
  qubits.sort((a, b) => {
    const ax = circuit.qubitCoordData[2 * a];
    const ay = circuit.qubitCoordData[2 * a + 1];
    const bx = circuit.qubitCoordData[2 * b];
    const by = circuit.qubitCoordData[2 * b + 1];
    if (ay !== by) return ay - by;
    return ax - bx;
  });
  let prevY = undefined;
  let curY = 0;
  for (const q of qubits) {
    const y = circuit.qubitCoordData[2 * q + 1];
    curY += TIMELINE_PITCH;
    if (prevY !== y) {
      prevY = y;
      curY += TIMELINE_PITCH * 0.25;
    }
  }
  return Math.max(0, Math.ceil(curY + TIMELINE_PITCH));
}

export function computeContentOffHeight(circuit, viewportDevPx) {
  if (!circuit) return viewportDevPx;
  const exact = computeContentHeightOffscreenPx(circuit);
  return Math.max(viewportDevPx, exact);
}

export function computeMaxScrollCSS(circuit, viewportCssHeight, timelineZoom, dpr = (window.devicePixelRatio || 1)) {
  if (!circuit) return 0;
  const contentOffPx = computeContentHeightOffscreenPx(circuit);
  const contentCss = (contentOffPx * timelineZoom) / Math.max(1, dpr);
  return Math.max(0, Math.floor(contentCss - viewportCssHeight));
}

export function renderTimeline({canvas, circuit, currentLayer, timelineZoom, timelineScrollY}) {
  if (!canvas || !circuit) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const snap = new StateSnapshot(
    circuit,
    Math.max(0, Math.min(currentLayer, circuit.layers.length - 1)),
    new Map(),
    new Map(),
    0, 0, undefined, undefined, []
  );
  const propagated = computePropagated(circuit);
  const c2d = (x, y) => [x * pitch - OFFSET_X, y * pitch - OFFSET_Y];
  const qubitDrawCoords = q => {
    const x = circuit.qubitCoordData[2 * q];
    const y = circuit.qubitCoordData[2 * q + 1];
    return c2d(x, y);
  };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const leftPadOnscreen = Math.round(12 * (window.devicePixelRatio || 1));
  const contentWidth = Math.max(1, Math.floor((w - leftPadOnscreen) / Math.max(0.1, timelineZoom)));
  const scrollDev = Math.round((timelineScrollY || 0) * (window.devicePixelRatio || 1));
  const scrollOffContent = Math.round(scrollDev / Math.max(0.1, timelineZoom));

  // Draw scrubber at the top. It internally translates by canvas.width/2 due to
  // originating from the combined (left+right) canvas logic. Counter that here
  // so it aligns to x=0 in our timeline-only canvas.
  ctx.save();
  ctx.translate(-Math.floor(ctx.canvas.width / 2), 0);
  drawScrubber(ctx, snap, propagated, circuit);
  ctx.restore();

  // Draw the timeline content directly with zoom and vertical scroll.
  // Apply scale first, then translate in content units so device-space padding
  // remains constant regardless of zoom.
  ctx.save();
  ctx.scale(Math.max(0.1, timelineZoom), Math.max(0.1, timelineZoom));
  ctx.translate(leftPadOnscreen / Math.max(0.1, timelineZoom), -scrollOffContent);
  drawTimelineOnly(ctx, snap, propagated, qubitDrawCoords, circuit.layers.length, { viewportContentWidth: contentWidth });
  ctx.restore();
}
