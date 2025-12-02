// Shared placement helpers for allocating or reusing qubits at panel coordinates.

/**
 * Ensure a qubit exists at the given panel-space coordinate.
 * - Reuses an existing qubit with matching panelX/panelY, if present.
 * - Otherwise allocates a new id (1 + max existing id in qubit_coords) and sets up
 *   qubit_coords plus qubit metadata (panelX/panelY, stimX/stimY, sheet, optional extras).
 * @param {*} circuit AnnotatedCircuit copy to mutate
 * @param {{x:number,y:number}} coord panel-space lattice coord
 * @param {() => string} getTargetSheet supplier for sheet name (DEFAULT fallback)
 * @param {{colour?:string, text?:string, mouseover?:string, defective?:boolean}} [extras]
 * @returns {number} qubit id
 */
export function ensureQubitForCoord(circuit, coord, getTargetSheet, extras = undefined) {
  // Find existing qubit at exact panel coords.
  try {
    for (const [qid, q] of circuit.qubits.entries()) {
      if (q && q.panelX === coord.x && q.panelY === coord.y) return qid;
    }
  } catch {}
  // Allocate new id
  let newId = 0;
  try { for (const k of circuit.qubit_coords.keys()) newId = Math.max(newId, k + 1); } catch {}
  circuit.qubit_coords.set(newId, [coord.x, coord.y]);
  // Attach per-qubit metadata
  try {
    const sheetName = (typeof getTargetSheet === 'function' ? getTargetSheet() : null) || 'DEFAULT';
    const meta = {
      id: newId,
      stimX: coord.x,
      stimY: coord.y,
      panelX: coord.x,
      panelY: coord.y,
      sheet: sheetName,
    };
    if (extras && typeof extras === 'object') {
      if (extras.colour) meta.colour = extras.colour;
      if (extras.text) meta.text = extras.text;
      if (extras.mouseover) meta.mouseover = extras.mouseover;
      if (typeof extras.defective === 'boolean') meta.defective = extras.defective;
    }
    if (!circuit.qubits) circuit.qubits = new Map();
    circuit.qubits.set(newId, meta);
  } catch {}
  return newId;
}

