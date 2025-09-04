// Extracted from stim_crumble/draw/main_draw.js "Draw scrubber" block.
// Perfect copy of logic; only deviation is packaging into a function and
// accepting circuit/propagatedMarkerLayers as parameters.

/**
 * Draws the top scrubber strip that summarizes per-layer content and highlights
 * the current layer.
 *
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!StateSnapshot} snap
 * @param {!Map<!number, !import('../circuit/propagated_pauli_frames.js').PropagatedPauliFrames>} propagatedMarkerLayers
 * @param {!import('../circuit/annotated_circuit.js').AnnotatedCircuit} circuit
 */
export function drawScrubber(ctx, snap, propagatedMarkerLayers, circuit) {
  ctx.save();
  try {
    ctx.strokeStyle = 'black';
    ctx.translate(Math.floor(ctx.canvas.width / 2), 0);
    for (let k = 0; k < circuit.layers.length; k++) {
      let hasPolygons = false;
      let hasXMarker = false;
      let hasYMarker = false;
      let hasZMarker = false;
      let hasResetOperations = circuit.layers[k].hasResetOperations();
      let hasMeasurements = circuit.layers[k].hasMeasurementOperations();
      let hasTwoQubitGate = false;
      let hasMultiQubitGate = false;
      let hasSingleQubitClifford = circuit.layers[k].hasSingleQubitCliffords();
      for (let op of circuit.layers[k].markers) {
        hasPolygons |= op.gate.name === 'POLYGON';
        hasXMarker |= op.gate.name === 'MARKX';
        hasYMarker |= op.gate.name === 'MARKY';
        hasZMarker |= op.gate.name === 'MARKZ';
      }
      for (let op of circuit.layers[k].id_ops.values()) {
        hasTwoQubitGate |= op.id_targets.length === 2;
        hasMultiQubitGate |= op.id_targets.length > 2;
      }
      ctx.fillStyle = 'white';
      ctx.fillRect(k * 8, 0, 8, 20);
      if (hasSingleQubitClifford) {
        ctx.fillStyle = '#FF0';
        ctx.fillRect(k * 8, 0, 8, 20);
      } else if (hasPolygons) {
        ctx.fillStyle = '#FBB';
        ctx.fillRect(k * 8, 0, 8, 7);
        ctx.fillStyle = '#BFB';
        ctx.fillRect(k * 8, 7, 8, 7);
        ctx.fillStyle = '#BBF';
        ctx.fillRect(k * 8, 14, 8, 6);
      }
      if (hasMeasurements) {
        ctx.fillStyle = '#DDD';
        ctx.fillRect(k * 8, 0, 8, 20);
      } else if (hasResetOperations) {
        ctx.fillStyle = '#DDD';
        ctx.fillRect(k * 8, 0, 4, 20);
      }
      if (hasXMarker) {
        ctx.fillStyle = 'red';
        ctx.fillRect(k * 8 + 3, 14, 3, 3);
      }
      if (hasYMarker) {
        ctx.fillStyle = 'green';
        ctx.fillRect(k * 8 + 3, 9, 3, 3);
      }
      if (hasZMarker) {
        ctx.fillStyle = 'blue';
        ctx.fillRect(k * 8 + 3, 3, 3, 3);
      }
      if (hasMultiQubitGate) {
        ctx.strokeStyle = 'black';
        ctx.beginPath();
        let x = k * 8 + 0.5;
        for (let dx of [3, 5]) {
          ctx.moveTo(x + dx, 6);
          ctx.lineTo(x + dx, 15);
        }
        ctx.stroke();
      }
      if (hasTwoQubitGate) {
        ctx.strokeStyle = 'black';
        ctx.beginPath();
        ctx.moveTo(k * 8 + 0.5 + 4, 6);
        ctx.lineTo(k * 8 + 0.5 + 4, 15);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(snap.curLayer * 8 + 0.5 + 4, 16);
    ctx.lineTo(snap.curLayer * 8 + 0.5 - 2, 28);
    ctx.lineTo(snap.curLayer * 8 + 0.5 + 10, 28);
    ctx.closePath();
    ctx.fill();

    for (let k = 0; k < circuit.layers.length; k++) {
      let has_errors = ![...propagatedMarkerLayers.values()].every(p => p.atLayer(k).errors.size === 0);
      let hasOps = circuit.layers[k].id_ops.size > 0 || circuit.layers[k].markers.length > 0;
      if (has_errors) {
        ctx.strokeStyle = 'magenta';
        ctx.lineWidth = 4;
        ctx.strokeRect(k * 8 + 0.5 - 1, 0.5 - 1, 7 + 2, 20 + 2);
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = '#000';
        ctx.strokeRect(k * 8 + 0.5, 0.5, 8, 20);
      }
    }
  } finally {
    ctx.restore();
  }
}

