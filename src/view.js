// Minimal placeholder: formats propagation layers for display.

/**
 * @param {import('../stim_crumble/circuit/circuit.js').Circuit} circuit
 * @returns {string}
 */
export function describeCircuit(circuit) {
  const layers = circuit.layers.length;
  const qubits = circuit.allQubits().size;
  return `Circuit: ${layers} layer(s), ${qubits} qubit(s)`;
}

/**
 * @param {any} propagated
 * @returns {string}
 */
export function describePropagation(propagated) {
  try {
    if (!propagated || !propagated.id_layers) {
      return String(propagated);
    }
    const keys = [...propagated.id_layers.keys()].sort((a, b) => a - b);
    const lines = ['PropagatedPauliFrames {'];
    for (const k of keys) {
      const layer = propagated.id_layers.get(k);
      const bases = {};
      for (const [q, b] of layer.bases.entries()) bases[q] = b;
      const errors = Array.from(layer.errors);
      const crossings = Array.isArray(layer.crossings)
        ? layer.crossings.map(c => ({ q1: c.q1, q2: c.q2, color: c.color }))
        : [];
      lines.push(
        `  ${k}: { bases: ${JSON.stringify(bases)}, errors: ${JSON.stringify(errors)}, crossings: ${JSON.stringify(crossings)} }`
      );
    }
    lines.push('}');
    return lines.join('\n');
  } catch (e) {
    return 'describePropagation error: ' + e;
  }
}
