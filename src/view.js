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
  return String(propagated);
}

